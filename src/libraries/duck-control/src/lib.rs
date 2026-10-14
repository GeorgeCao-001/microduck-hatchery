// Hatchery modifications: v2 paths and camera/servo bring-up.
// Upstream source, license and changes: src/NOTICE-UPSTREAM.md; docs/UPSTREAM_IMPORT.json.
//! The robot control core: everything between reading the bus and writing it.
//!
//! Deliberately not a daemon. There is no tokio here, no socket, no systemd — `robotd`
//! owns all of that. The boundary is enforced by the compiler rather than by discipline,
//! which is what stops process concerns leaking into the code that drives motors.
//!
//! The control path it holds — model, bus, [`io::RobotIo`], observations, policy, safety — is
//! designed in `docs/design/robotd-design.md` §2.

#[cfg(feature = "runtime")]
pub mod bus;
#[cfg(feature = "runtime")]
pub mod fall;
#[cfg(feature = "runtime")]
pub mod imu;
#[cfg(feature = "runtime")]
pub mod io;
#[cfg(feature = "runtime")]
pub mod model;
#[cfg(feature = "runtime")]
pub mod obs;
#[cfg(feature = "runtime")]
pub mod policy;
#[cfg(feature = "runtime")]
pub mod safety;
/// A robot in MuJoCo, over TCP — the backend `robotd-design.md` §9 deferred.
#[cfg(feature = "runtime")]
pub mod sim;

#[cfg(feature = "runtime")]
pub use imu::ImuData;
#[cfg(feature = "runtime")]
pub use io::{FakeIo, IoError, JointTargets, RobotIo, Sensors, SlowSensors};
#[cfg(feature = "runtime")]
pub use model::{
    BATTERY_EMPTY_V, BATTERY_FULL_V, DEFAULT_POSITION, JOINT_IDS, JOINT_NAMES, NUM_JOINTS,
    REST_POSITION, battery_percent,
};
#[cfg(feature = "runtime")]
pub use obs::{ACTION_LEN, Command, OBS_LEN, Observation};

// Hatchery: retain the existing restricted maintenance boundary.
#[cfg(feature = "runtime")]
pub mod bus_feetech;
pub mod bus_maintenance;
#[cfg(feature = "runtime")]
pub mod bus_select;
pub mod io_maintenance;

// Native FT packets stay within the bus boundary.
#[cfg(feature = "runtime")]
mod bus_feetech_wire;

#[cfg(not(feature = "runtime"))]
pub mod bus {
    pub use crate::bus_maintenance::*;
}
#[cfg(not(feature = "runtime"))]
pub mod io {
    pub use crate::io_maintenance::*;
}
