"""Start a disposable sample server and check the assembled project shell."""

import argparse
import asyncio
import importlib.util
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, ProxyHandler, build_opener


PROJECT_ROOT = Path(__file__).resolve().parents[1]
EXPECTED_IDS = [20, 21, 22, 23, 24, 10, 11, 12, 13, 14, 30, 31, 32, 33, 34]
PROTOCOL_VERSION = "hatchery-shell/0"


def require(condition, message):
    if not condition:
        raise AssertionError(message)
    print(f"PASS {message}", flush=True)


def unused_loopback_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def request(opener, origin, path, method="GET", payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    req = Request(origin + path, data=body, method=method,
                  headers={"Content-Type": "application/json"} if body else {})
    try:
        response = opener.open(req, timeout=3)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.headers.get("Content-Type", ""), response.read()


def decoded_json(opener, origin, path, method="GET", payload=None):
    status, content_type, body = request(opener, origin, path, method, payload)
    require("application/json" in content_type, f"{method} {path} returns JSON")
    return status, json.loads(body)


def check_sample_markers(value):
    require(value.get("protocol_version") == PROTOCOL_VERSION, "development protocol is explicit")
    require(value.get("sample") is True and value.get("fake") is True
            and value.get("source") == "sample" and value.get("simulated") is False,
            "sample telemetry cannot be mistaken for a real robot or simulation")
    require(value.get("read_only") is True and value.get("device_id") is None,
            "sample identity is read-only and does not invent a real device ID")


def check_http(opener, origin, *, transport_only=False):
    frontend_paths = ["/", "/app.js", "/styles.css", "/joint-drafts.js",
                      "/joint-console.js", "/joint-console.css", "/joint-charts.js", "/joint-charts.css", "/assets/product.jpg",
                      "/shell/", "/shell/styles.css"]
    if not transport_only:
        frontend_paths.append("/shell/app.js")
    for path in frontend_paths:
        status, _, body = request(opener, origin, path)
        require(status == 200 and bool(body), f"frontend resource {path} is served")

    status, info = decoded_json(opener, origin, "/api/v1/info")
    require(status == 200, "device information endpoint is available")
    check_sample_markers(info)
    capabilities = info["capabilities"]
    require(capabilities.get("telemetry") is True and all(
        capabilities.get(name) is False for name in ["control", "calibration", "recording", "runtime"]
    ), "unimplemented hardware capabilities remain disabled")
    mapping = sorted(info["joint_mapping"], key=lambda joint: joint["display_index"])
    require([joint["joint_id"] for joint in mapping] == EXPECTED_IDS,
            "display order is left leg, right leg, head and mouth")
    require(sorted(joint["runtime_index"] for joint in mapping) == list(range(15)),
            "physical runtime mapping contains all 15 joints")
    mouth = next(joint for joint in mapping if joint["joint_id"] == 34)
    require(mouth["policy_index"] is None and sorted(
        joint["policy_index"] for joint in mapping if joint["policy_index"] is not None
    ) == list(range(14)), "mouth remains physical while the policy mapping has 14 actions")

    status, state = decoded_json(opener, origin, "/api/v1/state")
    require(status == 200, "read-only state endpoint is available")
    check_sample_markers(state)
    require(state["session_id"] == info["session_id"], "state belongs to the server session")
    require(set(joint["joint_id"] for joint in state["joints"]) == set(EXPECTED_IDS)
            and len(state["joints"]) == 15, "state retains every physical joint")
    require(abs(time.time() - state["sampled_at_unix_s"]) < 10
            and state["monotonic_elapsed_s"] >= 0 and state["age_ms"] >= 0,
            "sample generation uses explicit Unix and monotonic time fields")
    require(any(joint["position_ticks"] is None for joint in state["joints"]),
            "missing feedback remains null rather than fabricated zero")

    for method, path in [("POST", "/api/v1/command"), ("POST", "/api/v1/state"),
                         ("PUT", "/api/v1/goal"), ("PATCH", "/api/v1/calibrate"),
                         ("DELETE", "/api/v1/unknown")]:
        status, error = decoded_json(opener, origin, path, method, {"op": "goal", "id": 23, "goal": 128})
        require(status == 403 and "error" in error, f"{method} {path} is rejected by the backend")
    status, _ = decoded_json(opener, origin, "/api/v1/unknown")
    require(status == 404, "unknown API routes do not fall through to the frontend")
    for path in ["/.git/config", "/src/README.md", "/protocol/fixtures/sample-state.json"]:
        status, _, _ = request(opener, origin, path)
        require(status == 404, f"project-private path {path} is not served")


async def check_websocket(origin):
    from websockets.asyncio.client import connect

    uri = origin.replace("http://", "ws://", 1) + "/api/v1/ws"
    async with connect(uri, open_timeout=3, close_timeout=1, proxy=None) as websocket:
        hello = json.loads(await asyncio.wait_for(websocket.recv(), timeout=3))
        require(hello.get("type") == "hello", "WebSocket starts with explicit sample identity")
        check_sample_markers(hello)
        state = json.loads(await asyncio.wait_for(websocket.recv(), timeout=3))
        require(state.get("type") == "state" and len(state.get("joints", [])) == 15,
                "WebSocket streams the complete read-only state")
        await websocket.send(json.dumps({"op": "torque", "enabled": True, "ids": [23]}))
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            result = json.loads(await asyncio.wait_for(websocket.recv(), timeout=3))
            if result.get("type") == "error":
                require(result.get("code") == "read_only" and result.get("sample") is True,
                        "WebSocket write requests receive an explicit read-only rejection")
                break
        else:
            raise AssertionError("WebSocket did not reject the write request")
    async with connect(uri, open_timeout=3, close_timeout=1, proxy=None) as websocket:
        hello = json.loads(await asyncio.wait_for(websocket.recv(), timeout=3))
        require(hello.get("type") == "hello", "a fresh subscriber works after disconnect")


def main():
    parser = argparse.ArgumentParser(description="Check the isolated read-only sample service")
    parser.add_argument(
        "--transport-only", action="store_true",
        help="check sample HTTP/WS and static hosting; exclude the unfinished shell JavaScript",
    )
    args = parser.parse_args()
    missing = [name for name in ["starlette", "uvicorn", "websockets"]
               if importlib.util.find_spec(name) is None]
    if missing:
        print("Missing installed dependencies: " + ", ".join(missing), file=sys.stderr)
        print("See tools/hatchery-shell/README.md; this checker does not install packages.", file=sys.stderr)
        return 1
    port = unused_loopback_port()
    origin = f"http://127.0.0.1:{port}"
    opener = build_opener(ProxyHandler({}))
    with tempfile.TemporaryFile(mode="w+b") as server_log:
        options = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}
        process = subprocess.Popen([sys.executable, str(PROJECT_ROOT / "scripts" / "hatchery-shell.py"), "--host", "127.0.0.1",
                                    "--port", str(port)], cwd=PROJECT_ROOT,
                                   stdout=server_log, stderr=subprocess.STDOUT, **options)
        try:
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError("Sample server exited during startup")
                try:
                    status, _, _ = request(opener, origin, "/api/v1/info")
                    if status == 200:
                        break
                except (URLError, TimeoutError, OSError):
                    pass
                time.sleep(0.1)
            else:
                raise RuntimeError("Sample server did not become ready")
            require(True, "sample server starts from the documented CLI")
            check_http(opener, origin, transport_only=args.transport_only)
            asyncio.run(check_websocket(origin))
            if args.transport_only:
                print("Sample transport checks passed. Shell JavaScript/UI completeness was not checked. No hardware was accessed.", flush=True)
            else:
                print("Project shell checks passed. No hardware was accessed.", flush=True)
            return 0
        except Exception as error:
            print(f"FAIL {error}", file=sys.stderr)
            server_log.seek(0)
            print(server_log.read().decode("utf-8", errors="replace"), file=sys.stderr)
            return 1
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
