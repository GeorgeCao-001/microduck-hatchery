"""Serve the existing visual prototype locally using Python's standard library."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5173, help="Local port (default: 5173)")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")

    prototype = Path(__file__).resolve().parents[1] / "prototype"
    if not (prototype / "index.html").is_file():
        parser.error(f"Prototype entry is missing: {prototype / 'index.html'}")

    handler = partial(SimpleHTTPRequestHandler, directory=str(prototype))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        print(f"Cannot start local preview: {error}\nTry another --port.", file=sys.stderr)
        return 1

    with server:
        print(f"Prototype: http://127.0.0.1:{args.port}/", flush=True)
        print("Sample data only. No robot connection. Ctrl+C to stop.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
