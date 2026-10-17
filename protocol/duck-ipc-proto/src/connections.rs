//! Hatchery transport envelope around configd's official net.* and BlueZ backends.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct BluetoothStatus {
    pub available: bool,
    pub powered: Option<bool>,
    pub discovering: Option<bool>,
    pub devices: Vec<BluetoothDevice>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BluetoothDevice {
    pub mac: String,
    pub name: String,
    pub icon: Option<String>,
    pub paired: bool,
    pub connected: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum Action {
    WifiScan {},
    WifiConnect { ssid: String, psk: Option<String> },
    WifiForget { ssid: String },
    WifiRadio { enabled: bool },
    WifiDisconnect {},
    BluetoothScan {},
    BluetoothRadio { enabled: bool },
    BluetoothPair { mac: String },
    BluetoothConnect { mac: String },
    BluetoothDisconnect { mac: String },
    BluetoothForget { mac: String },
}
impl Action {
    pub fn validate(&self) -> Result<(), &'static str> {
        match self {
            Self::WifiConnect { ssid, psk } => {
                validate_ssid(ssid)?;
                if psk
                    .as_ref()
                    .is_some_and(|s| s.len() > 128 || s.chars().any(char::is_control))
                {
                    return Err("Invalid Wi-Fi credential");
                }
            }
            Self::WifiForget { ssid } => validate_ssid(ssid)?,
            Self::BluetoothPair { mac }
            | Self::BluetoothConnect { mac }
            | Self::BluetoothDisconnect { mac }
            | Self::BluetoothForget { mac } => {
                let pieces: Vec<_> = mac.split(':').collect();
                if pieces.len() != 6
                    || pieces
                        .iter()
                        .any(|p| p.len() != 2 || !p.bytes().all(|c| c.is_ascii_hexdigit()))
                {
                    return Err("Invalid Bluetooth address");
                }
            }
            _ => (),
        }
        Ok(())
    }
}
fn validate_ssid(ssid: &str) -> Result<(), &'static str> {
    if ssid.is_empty() || ssid.len() > 32 || ssid.chars().any(char::is_control) {
        Err("Invalid SSID")
    } else {
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Change {
    pub session_id: String,
    pub request_id: String,
    pub command: Action,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ssid_limits_count_utf8_bytes_and_credentials_reject_controls() {
        assert!(
            Action::WifiConnect {
                ssid: "校园网".into(),
                psk: None
            }
            .validate()
            .is_ok()
        );
        assert!(
            Action::WifiForget {
                ssid: "网".repeat(11)
            }
            .validate()
            .is_err()
        );
        assert!(
            Action::WifiConnect {
                ssid: "x".into(),
                psk: Some("secret\n".into())
            }
            .validate()
            .is_err()
        );
        assert!(Action::WifiForget { ssid: "".into() }.validate().is_err());
    }
    #[test]
    fn bluetooth_actions_require_one_complete_device_address() {
        assert!(
            Action::BluetoothPair {
                mac: "AA:bb:00:11:22:33".into()
            }
            .validate()
            .is_ok()
        );
        for mac in ["AA:BB", "AA:BB:CC:DD:EE:GG", "AA:BB:CC:DD:EE:FF/other"] {
            assert!(
                Action::BluetoothConnect { mac: mac.into() }
                    .validate()
                    .is_err()
            );
        }
    }
    #[test]
    fn configuration_envelopes_do_not_accept_arbitrary_backend_calls() {
        for request in [
            r#"{"action":"shell","command":"id"}"#,
            r#"{"action":"wifi_scan","psk":"secret"}"#,
        ] {
            assert!(serde_json::from_str::<Action>(request).is_err());
        }
    }
}
