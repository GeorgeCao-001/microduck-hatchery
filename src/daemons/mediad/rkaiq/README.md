# RKAIQ ISP21 controls

This is the upstream Rockchip 3A program with a small in-process control endpoint.
It replaces the running instance during a manual test; it must never run alongside
the installed 3A engine. No new systemd service or ISP algorithm library is supplied.

The original media enumeration, stream-event loop and RKAIQ context remain here.
`controls.cpp` calls the installed SDK's API2 functions on that same context.
Only the capture device selected by `HATCHERY_CAMERA_DEVICE` is enabled. Camera
mode and IQ directory are not copied from a different robot: prepare uses the
active sensor mode, and `HATCHERY_RKAIQ_IQ_DIR` can override `/etc/iqfiles/`.

Build with `python3 scripts/build-rkaiq.py`, using the board's matching headers
and library. Run instructions and hardware validation limits:
[Camera controls](../../../../docs/CAMERA_CONTROLS.md).

Source commit and hashes: [RKAIQ_SERVER_IMPORT.json](../../../../docs/RKAIQ_SERVER_IMPORT.json).
The server and Hatchery additions use Apache-2.0. The bundled `common/mediactl/`
sources retain LGPL-2.1-or-later notices; their license and complete buildable
source are included. The build keeps `rkaiq-mediactl.o` for relinking.
