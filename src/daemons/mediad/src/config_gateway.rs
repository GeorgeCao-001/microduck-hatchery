//! Authenticated HTTP adapter to official configd. No network or Bluetooth IO here.
use duck_ipc_proto::connections::{Action, Change};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[derive(Clone)]
pub struct Connections(Arc<Mutex<State>>);
struct State {
    session: String,
    seen: VecDeque<String>,
    operation: Option<Value>,
    networks: Vec<Value>,
}
impl Connections {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(State {
            session: format!(
                "connections-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            ),
            seen: VecDeque::new(),
            operation: None,
            networks: Vec::new(),
        })))
    }
    pub fn state(&self) -> Value {
        let remote = call("hatchery.connections.status", None, Duration::from_secs(4));
        let guard = self.0.lock().unwrap();
        let mut value = match remote {
            Ok(v) => v,
            Err(_) => {
                json!({"protocol_version":"hatchery-connections/1","source":"unavailable","wifi":null,"bluetooth":null,"error":"configd unavailable"})
            }
        };
        value["available"] = json!(value["source"] == "hardware");
        value["session_id"] = json!(guard.session);
        value["operation"] = json!(guard.operation);
        value["networks"] = json!(guard.networks);
        value
    }
    pub fn submit(&self, change: Change) -> Result<Value, String> {
        change.command.validate().map_err(str::to_owned)?;
        if change.request_id.is_empty() || change.request_id.len() > 80 {
            return Err("Invalid connection request".into());
        }
        let mut state = self.0.lock().unwrap();
        if change.session_id != state.session {
            return Err("Connection session changed".into());
        }
        if state.seen.contains(&change.request_id) {
            return Err("Duplicate connection request; refresh status".into());
        }
        if state
            .operation
            .as_ref()
            .is_some_and(|o| o["state"] == "pending")
        {
            return Err("A connection change is already running".into());
        }
        state.seen.push_back(change.request_id.clone());
        if state.seen.len() > 64 {
            state.seen.pop_front();
        }
        let scan = matches!(change.command, Action::WifiScan {});
        state.operation = Some(json!({"request_id":change.request_id,"state":"pending"}));
        let operation = state.operation.clone().unwrap();
        drop(state);
        let store = self.0.clone();
        std::thread::spawn(move || {
            let result = serde_json::to_value(change.command)
                .map_err(|_| "Invalid connection action".into())
                .and_then(|params| {
                    call(
                        "hatchery.connections.command",
                        Some(params),
                        Duration::from_secs(180),
                    )
                });
            let mut guard = store.lock().unwrap();
            guard.operation = Some(match result {
                Ok(result) => {
                    if scan {
                        guard.networks = result["networks"]
                            .as_array()
                            .map(|v| v.iter().take(256).cloned().collect())
                            .unwrap_or_default();
                    }
                    json!({"request_id":change.request_id,"state":"complete","result":result})
                }
                // Backend errors are not permission to replay a network mutation.
                Err(error) => {
                    json!({"request_id":change.request_id,"state":"error","message":error})
                }
            });
        });
        Ok(operation)
    }
}
#[cfg(unix)]
fn call(method: &str, params: Option<Value>, timeout: Duration) -> Result<Value, String> {
    use std::io::{BufRead, BufReader, Read, Write};
    let path = std::env::var_os("HATCHERY_CONFIG_SOCKET")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            if let Some(dir) = std::env::var_os("DUCK_RUNTIME_DIR") {
                return std::path::PathBuf::from(dir).join("configd.sock");
            }
            if std::env::var_os("INVOCATION_ID").is_some() {
                return duck_ipc_proto::socket::CONFIG.into();
            }
            std::env::var_os("HOME")
                .map(|home| {
                    std::path::PathBuf::from(home)
                        .join(".local/state/microduck-hatchery/run/configd.sock")
                })
                .unwrap_or_else(|| duck_ipc_proto::socket::CONFIG.into())
        });
    let mut stream =
        std::os::unix::net::UnixStream::connect(path).map_err(|_| "configd unavailable")?;
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|_| "Configuration socket unavailable")?;
    stream
        .set_write_timeout(Some(Duration::from_secs(1)))
        .map_err(|_| "Configuration socket unavailable")?;
    let mut request =
        serde_json::to_vec(&json!({"jsonrpc":"2.0","id":1,"method":method,"params":params}))
            .map_err(|_| "Invalid configuration request")?;
    request.push(b'\n');
    stream
        .write_all(&request)
        .map_err(|_| "Configuration request result unknown")?;
    let mut buffer = Vec::new();
    BufReader::new(stream.take(65537))
        .read_until(b'\n', &mut buffer)
        .map_err(|_| "Configuration request result unknown; refresh status")?;
    if buffer.len() > 65536 || !buffer.ends_with(b"\n") {
        return Err("Invalid configuration reply".into());
    }
    let reply: Value =
        serde_json::from_slice(&buffer).map_err(|_| "Invalid configuration reply")?;
    if reply["jsonrpc"] != "2.0" || reply["id"] != 1 {
        return Err("Invalid configuration reply".into());
    }
    if reply.get("error").is_some() {
        return Err("configd rejected the request; check permissions and backend status".into());
    }
    reply
        .get("result")
        .cloned()
        .ok_or("Missing configuration result".into())
}
#[cfg(not(unix))]
fn call(_method: &str, _params: Option<Value>, _timeout: Duration) -> Result<Value, String> {
    Err("configd requires Radxa Linux".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wrong_sessions_and_invalid_commands_are_rejected_before_dispatch() {
        let gateway = Connections::new();
        assert!(
            gateway
                .submit(Change {
                    session_id: "old".into(),
                    request_id: "one".into(),
                    command: Action::WifiScan {}
                })
                .is_err()
        );
        let session = gateway.0.lock().unwrap().session.clone();
        assert!(
            gateway
                .submit(Change {
                    session_id: session,
                    request_id: "two".into(),
                    command: Action::BluetoothPair {
                        mac: "invalid".into()
                    }
                })
                .is_err()
        );
        assert!(gateway.0.lock().unwrap().seen.is_empty());
    }
    #[test]
    fn a_pending_configuration_change_cannot_be_replayed_or_overlapped() {
        let gateway = Connections::new();
        let mut state = gateway.0.lock().unwrap();
        let session = state.session.clone();
        state.seen.push_back("one".into());
        state.operation = Some(json!({"state":"pending","request_id":"one"}));
        drop(state);
        for id in ["one", "two"] {
            assert!(
                gateway
                    .submit(Change {
                        session_id: session.clone(),
                        request_id: id.into(),
                        command: Action::WifiScan {}
                    })
                    .is_err()
            );
        }
    }
}
