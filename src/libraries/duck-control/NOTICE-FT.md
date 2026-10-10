# FT source attribution

The read-only packet and reference feedback logic in `src/bus.rs` and `src/io.rs`
is adapted from fanhao375/microduck-replica, `tools/servo-web/feetech.py`, commit
`b5381d86b68d2e4f4606170d54d1f3f46d249ffc`.

Source: https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/feetech.py

The source repository licenses its tools under Apache License 2.0. A copy is
included in `LICENSE-FT`.

Hatchery changes: port the read-only boundary to Rust; exclude all control and
configuration writes; validate replies; preserve raw bytes; add exclusive port
ownership and bounded failures. HD firmware, register units and calibration
remain unconfirmed. See `docs/FT_READ_ONLY_SOURCE.md` at the repository root.
