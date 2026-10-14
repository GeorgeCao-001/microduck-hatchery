# Runtime source notices

Pollen Robotics Microduck source is pinned to `9136aa4ee88e81edf2bcaf3527e90b65da25f1eb` (0.15.1). Imported crates retain `LICENSE-UPSTREAM` (Apache-2.0). Source-to-local paths, hashes and modified-file flags are in [UPSTREAM_IMPORT.json](../docs/UPSTREAM_IMPORT.json).

The FT selector and RobotIo adapter derive from fanhao375/microduck, commit `8db8f00c8fc5278d0bdf43f96934531c37ee2780`, Apache-2.0. Native FT packet decoding and bounded reads derive from the Rust firmware portion of kissqy/Microduck-kissqy, commit `94328f5b43c8ac825c90f0e564e7d1b926cd770d`, Apache-2.0. Its separately licensed console, training tools, FT6 firmware and runtime policy weights were not imported. Existing maintenance transport retains its separate LICENSE-FT / NOTICE-FT attribution.

Hatchery changes: v2 crate paths, explicit runtime features and maintenance binaries, HD1910 read-only bus adaptation, calibration validity gates, read-only RPC admission, explicit camera nodes / sensor configuration, measured-intrinsics requirements, local-only media startup, Hatchery camera page and Radxa service configuration. These modifications and local builds do not attest to upstream or Hatchery hardware test results.

Original tests and tiny model fixtures belong to their source crates. OTA-dependent integration tests are outside this workspace slice; original assertions were not weakened. Radxa runtime config and parameter-schema fixtures serve different purposes. Upstream comments can refer to tools not imported in this phase; use [RADXA_RUNTIME.md](../docs/RADXA_RUNTIME.md) for Hatchery startup.
