#!/bin/sh
# Hatchery: native build only; no installation, service start or hardware access.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
[ "$(uname -s)" = Linux ] && [ "$(uname -m)" = aarch64 ] || {
    printf '%s\n' 'Build on the Radxa (64-bit Linux/aarch64). See docs/RADXA_RUNTIME.md.' >&2
    exit 1
}
command -v cargo >/dev/null || { printf '%s\n' 'Install Rust 1.99.0 first.' >&2; exit 1; }
for module in gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0 gstreamer-webrtc-1.0; do
    pkg-config --atleast-version=1.22 "$module" || {
        printf 'Missing %s >= 1.22; run scripts/setup-gstreamer.sh --dev.\n' "$module" >&2
        exit 1
    }
done
cd "$ROOT/src"
cargo build --locked --release -j "${HATCHERY_BUILD_JOBS:-1}" \
    -p robotd -p mediad --features robotd/board-runtime,mediad/board-runtime \
    --bin robotd --bin mediad --bin robotd-maintenance --bin mediad-maintenance
printf '%s\n' 'Built src/target/release/{robotd,mediad,robotd-maintenance,mediad-maintenance}.' \
    'Next: configure deploy/radxa/hatchery.env.example. This command did not start hardware.'
