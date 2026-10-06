"""Run the local sample service without opening a hardware connection."""

import argparse
import ipaddress

import uvicorn

from device.api.app import create_app


def loopback_host(value: str) -> str:
    if value == "localhost":
        return "127.0.0.1"
    try:
        address = ipaddress.ip_address(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("host must be a loopback IP address") from exc
    if not address.is_loopback:
        raise argparse.ArgumentTypeError("this sample shell only binds to loopback")
    return str(address)


def port_number(value: str) -> int:
    try:
        port = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("port must be an integer") from exc
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be between 1 and 65535")
    return port


def main() -> None:
    parser = argparse.ArgumentParser(description="Microduck Hatchery read-only sample shell")
    parser.add_argument("--host", type=loopback_host, default="127.0.0.1")
    parser.add_argument("--port", type=port_number, default=8080)
    args = parser.parse_args()
    uvicorn.run(create_app(), host=args.host, port=args.port, proxy_headers=False)


if __name__ == "__main__":
    main()

