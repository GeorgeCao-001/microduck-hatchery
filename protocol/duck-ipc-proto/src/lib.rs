//! Hatchery desktop maintenance contract. Not a copy of upstream robotd RPC.
use serde::{Deserialize, Serialize};

pub const VERSION: &str = "hatchery-maintenance/1";
pub const MAX_FRAME: usize = 64 * 1024;
pub const DISPLAY_IDS: [u8; 15] = [20, 21, 22, 23, 24, 10, 11, 12, 13, 14, 30, 31, 32, 33, 34];
pub const RUNTIME_IDS: [u8; 15] = [20, 21, 22, 23, 24, 30, 31, 32, 33, 34, 10, 11, 12, 13, 14];
pub const POLICY_IDS: [u8; 14] = [20, 21, 22, 23, 24, 30, 31, 32, 33, 10, 11, 12, 13, 14];

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub jsonrpc: String,
    pub id: u64,
    pub token: String,
    pub method: String,
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
