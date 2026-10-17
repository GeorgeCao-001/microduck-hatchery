//! Hatchery desktop maintenance contract. Not a copy of upstream robotd RPC.
use serde::{Deserialize, Serialize};

pub const VERSION: &str = "hatchery-maintenance/1";
pub const MAX_FRAME: usize = 512 * 1024;
pub const DISPLAY_IDS: [u8; 15] = [20, 21, 22, 23, 24, 10, 11, 12, 13, 14, 30, 31, 32, 33, 34];
pub const RUNTIME_IDS: [u8; 15] = [20, 21, 22, 23, 24, 30, 31, 32, 33, 34, 10, 11, 12, 13, 14];
pub const POLICY_IDS: [u8; 14] = [20, 21, 22, 23, 24, 30, 31, 32, 33, 10, 11, 12, 13, 14];

/// Host telemetry is independent of servo fixtures and never grants control.
pub const DEVICE_VERSION: &str = "hatchery-device/1";
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceSnapshot {
    pub protocol_version: String,
    pub source: String,
    pub generated_unix_ms: u64,
    pub identity: DeviceIdentity,
    pub system: DeviceSystem,
    pub interfaces: Option<Vec<DeviceInterface>>,
    pub bluetooth: Option<Vec<DeviceBluetooth>>,
    pub service: DeviceService,
    /// Read-only program observations; absent in older maintenance backends.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub services: Option<Vec<DeviceDaemon>>,
}

/// systemd state is separate from executable observation so foreground daemons
/// remain visible without claiming that an inactive unit manages them.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceDaemon {
    pub name: String,
    pub unit: Option<String>,
    pub state: crate::UnitState,
    pub sub_state: Option<String>,
    pub main_pid: Option<u32>,
    pub process_pid: Option<u32>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceIdentity {
    pub id: Option<String>,
    pub id_source: String,
    pub name: Option<String>,
    pub hostname: Option<String>,
    pub model: Option<String>,
    pub os: String,
    pub kernel: Option<String>,
    pub architecture: String,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DeviceSystem {
    pub cpu_percent: Option<f64>,
    pub load_one: Option<f64>,
    pub memory_total_bytes: Option<u64>,
    pub memory_available_bytes: Option<u64>,
    pub uptime_seconds: Option<f64>,
    /// Maximum across readable thermal zones, not CPU temperature alone.
    pub hottest_zone_celsius: Option<f64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInterface {
    pub name: String,
    pub kind: String,
    pub state: String,
    pub carrier: Option<bool>,
    pub addresses: Option<Vec<String>>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceBluetooth {
    pub name: String,
    pub address: Option<String>,
    pub blocked: Option<bool>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceService {
    pub name: String,
    pub version: String,
    pub servo_source: Source,
    pub servo_connection: String,
    pub servo_fake: bool,
    pub serial_port: Option<String>,
    pub baud: Option<u32>,
    pub control_enabled: bool,
    pub bus_owner: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub jsonrpc: String,
    pub id: u64,
    pub token: String,
    pub method: String,
    #[serde(default)]
    pub params: Option<MaintenanceCommand>,
}

/// Explicit single-device requests; joint assignment is not a prerequisite.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MaintenanceCommand {
    pub command_id: String,
    pub session_id: String,
    pub expires_unix_ms: u64,
    #[serde(default)]
    pub bench_confirmed: bool,
    pub operation: DeviceAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum DeviceAction {
    Scan {
        start_id: u8,
        end_id: u8,
    },
    CancelScan,
    Ping {
        id: u8,
    },
    Read {
        id: u8,
        address: u8,
        length: u8,
    },
    Move {
        id: u8,
        target_raw: i32,
        speed_raw: u16,
        acceleration_raw: u8,
    },
    Torque {
        id: u8,
        enabled: bool,
    },
    ChangeId {
        id: u8,
        new_id: u8,
        single_device_confirmed: bool,
    },
}
impl DeviceAction {
    pub fn id(&self) -> Option<u8> {
        match *self {
            Self::Scan { .. } | Self::CancelScan => None,
            Self::Ping { id }
            | Self::Read { id, .. }
            | Self::Move { id, .. }
            | Self::Torque { id, .. }
            | Self::ChangeId { id, .. } => Some(id),
        }
    }
    pub fn writes(&self) -> bool {
        matches!(
            self,
            Self::Move { .. } | Self::Torque { .. } | Self::ChangeId { .. }
        )
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ScanState {
    pub active: bool,
    pub start_id: u8,
    pub end_id: u8,
    pub completed: u16,
    pub found_ids: Vec<u8>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    Disconnected,
    Fixture,
    Hardware,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JointReading {
    pub id: u8,
    pub runtime_index: usize,
    pub policy_index: Option<usize>,
    pub status: String,
    /// Host receipt time, not a timestamp measured by the servo.
    pub received_unix_ms: Option<u64>,
    pub received_monotonic_ms: Option<u64>,
    pub raw_bytes: Option<Vec<u8>>,
    pub decoded_reference: Option<ReferenceWords>,
    pub device_error: Option<u8>,
    pub reason: Option<String>,
}

/// A bus device without a joint assignment. It has no runtime or policy index.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceReading {
    pub id: u8,
    pub status: String,
    pub received_unix_ms: Option<u64>,
    pub received_monotonic_ms: Option<u64>,
    pub raw_bytes: Option<Vec<u8>>,
    pub decoded_reference: Option<ReferenceWords>,
    pub device_error: Option<u8>,
    pub reason: Option<String>,
}

impl DeviceReading {
    pub fn missing(id: u8, reason: &str) -> Self {
        Self {
            id,
            status: "missing".into(),
            received_unix_ms: None,
            received_monotonic_ms: None,
            raw_bytes: None,
            decoded_reference: None,
            device_error: None,
            reason: Some(reason.into()),
        }
    }
}

impl JointReading {
    pub fn apply_reading(&mut self, reading: DeviceReading) {
        assert_eq!(self.id, reading.id);
        self.status = reading.status;
        self.received_unix_ms = reading.received_unix_ms;
        self.received_monotonic_ms = reading.received_monotonic_ms;
        self.raw_bytes = reading.raw_bytes;
        self.decoded_reference = reading.decoded_reference;
        self.device_error = reading.device_error;
        self.reason = reading.reason;
    }
}

/// Frozen SCS interpretation only. Never promoted to verified HD units/angles.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferenceWords {
    pub position_raw: i32,
    pub goal_raw: i32,
    pub speed_raw: i32,
    pub load_raw: i32,
    pub current_raw: i32,
    pub voltage_raw: u8,
    pub temperature_raw: u8,
    pub state_raw: u8,
    pub moving_raw: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct State {
    pub protocol_version: String,
    pub session_id: String,
    pub source: Source,
    pub fake: bool,
    pub simulated: bool,
    pub hardware_confirmed: bool,
    pub read_only: bool,
    pub control_enabled: bool,
    pub bus_owner: String,
    pub connection: String,
    pub port: Option<String>,
    #[serde(default)]
    pub baud: Option<u32>,
    pub profile_id: Option<String>,
    pub register_profile_confirmed: bool,
    pub calibration_version: Option<String>,
    pub generated_unix_ms: u64,
    pub collected_monotonic_ms: u64,
    pub max_age_ms: u64,
    pub joints: Vec<JointReading>,
    #[serde(default)]
    pub unassigned_devices: Vec<DeviceReading>,
    #[serde(default)]
    pub scan: ScanState,
    pub notice: String,
}

pub fn empty_readings(reason: &str) -> Vec<JointReading> {
    DISPLAY_IDS
        .iter()
        .map(|&id| JointReading {
            id,
            runtime_index: RUNTIME_IDS.iter().position(|&n| n == id).unwrap(),
            policy_index: POLICY_IDS.iter().position(|&n| n == id),
            status: "missing".into(),
            received_unix_ms: None,
            received_monotonic_ms: None,
            raw_bytes: None,
            decoded_reference: None,
            device_error: None,
            reason: Some(reason.into()),
        })
        .collect()
}

pub fn empty_unassigned_readings(ids: &[u8], reason: &str) -> Vec<DeviceReading> {
    ids.iter()
        .filter(|id| !DISPLAY_IDS.contains(id))
        .map(|&id| DeviceReading::missing(id, reason))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mappings_keep_mouth_and_three_distinct_orders() {
        let rows = empty_readings("not read");
        assert_eq!(rows.iter().map(|r| r.id).collect::<Vec<_>>(), DISPLAY_IDS);
        assert_eq!(rows.iter().find(|r| r.id == 10).unwrap().runtime_index, 10);
        assert_eq!(rows.iter().find(|r| r.id == 34).unwrap().policy_index, None);
        assert!(
            rows.iter()
                .all(|r| r.raw_bytes.is_none() && r.received_unix_ms.is_none())
        );
    }

    #[test]
    fn unassigned_servo_never_becomes_a_joint_or_policy_entry() {
        let devices = empty_unassigned_readings(&[1, 20], "not read");
        assert_eq!(devices.len(), 1);
        let value = serde_json::to_value(&devices[0]).unwrap();
        assert_eq!(value["id"], 1);
        assert!(value.get("runtime_index").is_none());
        assert!(value.get("policy_index").is_none());
        let mut joints = empty_readings("not requested");
        joints[0].apply_reading(DeviceReading::missing(20, "timeout"));
        assert_eq!(joints.len(), 15);
        assert_eq!(joints[0].runtime_index, 0);
        assert_eq!(joints[0].policy_index, Some(0));
        assert_eq!(joints[14].id, 34);
    }
}

/// Local mediad camera control; shared with the authenticated maintenance gateway.
pub const CAMERA_GET: &str = "hatchery.camera.get";
pub const CAMERA_SET: &str = "hatchery.camera.set";
pub const CAMERA_VERSION: &str = "hatchery-camera/1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraState {
    pub protocol_version: String,
    pub session_id: String,
    pub source: String,
    pub width: u32,
    pub height: u32,
    /// Configured capture rate, not a measured browser preview rate.
    pub target_fps: u32,
    pub mode: String,
    pub auto_exposure: Option<bool>,
    pub controls: Vec<CameraParameter>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraParameter {
    pub key: String,
    pub min: i64,
    pub max: i64,
    pub step: i64,
    pub value: Option<i64>,
    pub writable: bool,
    pub unit: String,
    /// sensor, isp, or ae-target; never a browser-only visual filter.
    pub source: String,
    #[serde(default)]
    pub choices: Vec<(i64, String)>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CameraChange {
    pub session_id: String,
    pub request_id: String,
    pub key: String,
    pub value: i64,
}
