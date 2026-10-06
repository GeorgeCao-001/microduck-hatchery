"""Transport and scoped static hosting for the local read-only device shell."""

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route, WebSocketRoute
from starlette.staticfiles import StaticFiles
from starlette.websockets import WebSocket, WebSocketDisconnect

from device.adapters.sample import PROTOCOL_VERSION, SampleBackend
from device.controller.readonly import ReadonlyController, ReadOnlyOperationError

REPOSITORY_ROOT = Path(__file__).resolve().parents[4]


class ReadOnlyAPIGate:
    """The controller rejects all API writes before routing or static fallback."""

    def __init__(self, app, controller: ReadonlyController) -> None:
        self.app = app
        self.controller = controller

    async def __call__(self, scope, receive, send) -> None:
        path = scope.get("path", "")
        if scope["type"] == "http" and (path == "/api" or path.startswith("/api/")) and scope["method"] not in ("GET", "HEAD"):
            try:
                self.controller.reject_operation(scope["method"])
            except ReadOnlyOperationError as exc:
                response = JSONResponse(
                    {"error": {"code": exc.code, "message": str(exc)}, "sample": True, "read_only": True},
                    status_code=403,
                    headers={"Cache-Control": "no-store"},
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


def create_app(*, controller: ReadonlyController | None = None) -> Starlette:
    controller = controller or ReadonlyController(SampleBackend(REPOSITORY_ROOT / "protocol"))

    async def info(request: Request) -> JSONResponse:
        return JSONResponse(controller.info(), headers={"Cache-Control": "no-store"})

    async def state(request: Request) -> JSONResponse:
        return JSONResponse(controller.read_state(), headers={"Cache-Control": "no-store"})

    async def unknown_api(request: Request) -> JSONResponse:
        return JSONResponse(
            {"error": {"code": "not_found", "message": "Unknown API route."}, "sample": True, "read_only": True},
            status_code=404,
            headers={"Cache-Control": "no-store"},
        )

    async def stream(websocket: WebSocket) -> None:
        await websocket.accept()
        app.state.active_websockets += 1
        send_lock = asyncio.Lock()
        tasks: list[asyncio.Task] = []

        async def send_json(payload: dict) -> None:
            async with send_lock:
                await websocket.send_json(payload)

        async def send_states() -> None:
            while True:
                await asyncio.sleep(0.5)
                await send_json(controller.read_state())

        async def receive_commands() -> None:
            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    return
                try:
                    controller.reject_operation()
                except ReadOnlyOperationError as exc:
                    await send_json({
                        "type": "error",
                        "protocol_version": PROTOCOL_VERSION,
                        "code": exc.code,
                        "message": str(exc),
                        "sample": True,
                        "read_only": True,
                        "command_id": None,
                        "operation": None,
                    })

        try:
            await send_json({"type": "hello", **controller.info()})
            await send_json(controller.read_state())
            tasks = [asyncio.create_task(send_states()), asyncio.create_task(receive_commands())]
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
        except WebSocketDisconnect:
            pass
        finally:
            for task in tasks:
                task.cancel()
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
            app.state.active_websockets -= 1

    @asynccontextmanager
    async def lifespan(app: Starlette):
        yield

    routes = [
        Route("/api/v1/info", info, methods=["GET", "HEAD"]),
        Route("/api/v1/state", state, methods=["GET", "HEAD"]),
        WebSocketRoute("/api/v1/ws", stream),
        Route("/api", unknown_api, methods=["GET", "HEAD"]),
        Route("/api/{path:path}", unknown_api, methods=["GET", "HEAD"]),
        Mount("/shell", StaticFiles(directory=REPOSITORY_ROOT / "web" / "shell", html=True, check_dir=False), name="shell"),
        Mount("/", StaticFiles(directory=REPOSITORY_ROOT / "web" / "prototype", html=True), name="prototype"),
    ]
    app = Starlette(routes=routes, lifespan=lifespan)
    app.state.controller = controller
    app.state.active_websockets = 0
    app.add_middleware(ReadOnlyAPIGate, controller=controller)
    return app

