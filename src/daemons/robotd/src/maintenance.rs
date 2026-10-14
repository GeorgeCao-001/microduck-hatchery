//! Single-owner bench operations. The collector executes each command once.
use duck_control::bus::{BusError, MaintenanceBus};
use duck_ipc_proto::maintenance::{DeviceAction, MaintenanceCommand, State};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex, mpsc},
    time::{Duration, Instant},
};

pub struct Job {
    pub command: MaintenanceCommand,
    pub deadline: Instant,
    pub reply: mpsc::SyncSender<Value>,
}
pub type Queue = mpsc::SyncSender<Job>;

pub fn rejected(command: &MaintenanceCommand, reason: &str) -> Value {
    json!({"command_id":command.command_id,"id":command.operation.id(),"status":"rejected","reason":reason})
}
pub fn dispatch(command: MaintenanceCommand, state: &Arc<Mutex<State>>, queue: &Queue) -> Value {
    let current = state.lock().unwrap();
    if command.session_id != current.session_id || current.connection != "open" {
        return rejected(&command, "Session changed or serial not connected");
    }
    if command.operation.writes() && !current.control_enabled {
        return rejected(
            &command,
            "Bench control disabled; explicit --bench-control is required",
        );
    }
    if command.operation.writes() && !command.bench_confirmed {
        return rejected(
            &command,
            "Explicit bare-servo bench/profile confirmation required",
        );
    }
    if command.operation.writes() && current.scan.active {
        return rejected(&command, "Cancel or finish the scan before writing");
    }
    drop(current);
    let now = super::unix_ms();
    if command.command_id.is_empty()
        || command.command_id.len() > 96
        || command.expires_unix_ms <= now
        || command.expires_unix_ms - now > 2000
    {
        return rejected(
            &command,
            "Invalid command identity or deadline (maximum 2 seconds)",
        );
    }
    let (reply, receiver) = mpsc::sync_channel(1);
    let job = Job {
        deadline: Instant::now() + Duration::from_millis(command.expires_unix_ms - now),
        command: command.clone(),
        reply,
    };
    if queue.try_send(job).is_err() {
        return rejected(&command, "Serial queue busy");
    }
    receiver.recv_timeout(Duration::from_secs(2)).unwrap_or_else(|_| {
        json!({"command_id":command.command_id,"id":command.operation.id(),"status":"unconfirmed","reason":"Reply timed out; do not automatically retry"})
    })
}
fn read(bus: &mut MaintenanceBus, id: u8, address: u8, length: u8) -> Result<Vec<u8>, BusError> {
    let (error, bytes) = bus.read_registers(id, address, length)?;
    if error != 0 {
        return Err(BusError::Invalid(format!("Device status {error}")));
    }
    Ok(bytes)
}
fn write(
    bus: &mut MaintenanceBus,
    id: u8,
    address: u8,
    bytes: &[u8],
    deadline: Instant,
    attempted: &mut bool,
) -> Result<(), BusError> {
    if Instant::now() >= deadline {
        return Err(BusError::Invalid("Command expired before write".into()));
    }
    *attempted = true;
    let (error, _) = bus.write_bench_ram(id, address, bytes)?;
    if error != 0 {
        return Err(BusError::Invalid(format!("Device status {error}")));
    }
    Ok(())
}
fn position(bus: &mut MaintenanceBus, id: u8) -> Result<u16, BusError> {
    // FD HLSXX reference only. No EEPROM/mode changes to force compatibility.
    if read(bus, id, 33, 1)? != [4] || read(bus, id, 30, 1)? != [1] {
        return Err(BusError::Invalid(
            "Raw bench movement requires mode 4 and resolution 1; no mode change was sent".into(),
        ));
    }
    let bytes = read(bus, id, 56, 2)?;
    let current = u16::from_le_bytes([bytes[0], bytes[1]]);
    if current > 4095 {
        return Err(BusError::Invalid(
            "Current position outside single-turn bench range".into(),
        ));
    }
    Ok(current)
}
fn execute(bus: &mut MaintenanceBus, job: &Job, attempted: &mut bool) -> Result<Value, BusError> {
    let id = job.command.operation.id().unwrap();
    match job.command.operation {
        DeviceAction::Ping { .. } => {
            let (error, _) = bus.ping(id)?;
            Ok(json!({"status":"read","device_error":error,"raw_bytes":[]}))
        }
        DeviceAction::Read {
            address, length, ..
        } => {
            let bytes = read(bus, id, address, length)?;
            Ok(json!({"status":"read","address":address,"raw_bytes":bytes}))
        }
        DeviceAction::Move {
            target_raw,
            speed_raw,
            acceleration_raw,
            ..
        } => {
            if !(0..=4095).contains(&target_raw)
                || !(1..=200).contains(&speed_raw)
                || !(1..=50).contains(&acceleration_raw)
            {
                return Err(BusError::Invalid(
                    "Target 0..4095, speed 1..200 and acceleration 1..50 required".into(),
                ));
            }
            let current = position(bus, id)?;
            if (target_raw - i32::from(current)).abs() > 128 {
                return Err(BusError::Invalid(
                    "Target must be within 128 counts of the fresh position".into(),
                ));
            }
            if read(bus, id, 40, 1)? != [1] {
                return Err(BusError::Invalid(
                    "Output is disabled; enable explicitly before moving".into(),
                ));
            }
            write(bus, id, 41, &[acceleration_raw], job.deadline, attempted)?;
            write(
                bus,
                id,
                46,
                &speed_raw.to_le_bytes(),
                job.deadline,
                attempted,
            )?;
            write(
                bus,
                id,
                42,
                &(target_raw as u16).to_le_bytes(),
                job.deadline,
                attempted,
            )?;
            let bytes = read(bus, id, 42, 2)?;
            let target = u16::from_le_bytes([bytes[0], bytes[1]]);
            Ok(
                json!({"status":if i32::from(target)==target_raw {"readback_match"} else {"readback_mismatch"},"target_raw":target,"motion_complete":false}),
            )
        }
        DeviceAction::Torque { enabled, .. } => {
            if enabled {
                let current = position(bus, id)?;
                // Align the goal before enabling output; never apply an old goal.
                write(bus, id, 42, &current.to_le_bytes(), job.deadline, attempted)?;
                if read(bus, id, 42, 2)? != current.to_le_bytes() {
                    return Err(BusError::Invalid(
                        "Goal alignment readback mismatch; output was not enabled".into(),
                    ));
                }
            }
            write(bus, id, 40, &[u8::from(enabled)], job.deadline, attempted)?;
            let bytes = read(bus, id, 40, 1)?;
            Ok(
                json!({"status":if bytes[0]==u8::from(enabled) {"readback_match"} else {"readback_mismatch"},"output_raw":bytes[0],"motion_complete":false}),
            )
        }
        DeviceAction::ChangeId {
            new_id,
            single_device_confirmed,
            ..
        } => {
            if new_id > 253 || new_id == id || !single_device_confirmed {
                return Err(BusError::Invalid(
                    "Confirm a single connected servo and a different unicast ID in 0..253".into(),
                ));
            }
            // Match the local FD HLS memory table before changing persistent identity.
            let identity = read(bus, id, 0, 6)?;
            if identity[0] != 3 || !(40..=59).contains(&identity[1]) || identity[5] != id {
                return Err(BusError::Invalid("Firmware does not match the local FD HLS 3.40..3.59 identity table; ID was not written".into()));
            }
            if read(bus, id, 40, 1)? != [0] || read(bus, id, 55, 1)? != [1] {
                return Err(BusError::Invalid(
                    "Disable output and verify the EEPROM lock is closed before changing ID".into(),
                ));
            }
            match bus.ping(new_id) {
                Err(BusError::Timeout) => {}
                Ok(_) => {
                    return Err(BusError::Invalid(
                        "New ID already responds; no identity write sent".into(),
                    ));
                }
                Err(e) => return Err(e),
            }
            if Instant::now() >= job.deadline {
                return Err(BusError::Invalid(
                    "Command expired before identity write".into(),
                ));
            }
            *attempted = true;
            // Relock even when an acknowledgement is lost. Never resend the ID write.
            let operation = (|| {
                let (error, _) = bus.write_identity(id, 55, 0)?;
                if error != 0 {
                    return Err(BusError::Invalid(format!("Unlock status {error}")));
                }
                if read(bus, id, 55, 1)? != [0] {
                    return Err(BusError::Invalid("EEPROM unlock did not read back".into()));
                }
                if Instant::now() >= job.deadline {
                    return Err(BusError::Invalid("Command expired before ID write".into()));
                }
                let ack = bus.write_identity(id, 5, new_id);
                std::thread::sleep(Duration::from_millis(20));
                // Devices may reply at the new ID; readback, not the write ACK, decides.
                if read(bus, new_id, 5, 1)? != [new_id] {
                    return Err(BusError::Invalid(format!(
                        "New ID readback failed; write ACK: {ack:?}"
                    )));
                }
                Ok(())
            })();
            let relock_id = if read(bus, new_id, 5, 1).is_ok_and(|v| v == [new_id]) {
                new_id
            } else {
                id
            };
            let lock = bus.write_identity(relock_id, 55, 1);
            let locked = lock.is_ok_and(|(error, _)| error == 0)
                && read(bus, relock_id, 55, 1).is_ok_and(|v| v == [1]);
            operation?;
            if !locked {
                return Err(BusError::Invalid("ID may have changed; EEPROM relock is unconfirmed. Inspect the servo without retrying the ID write".into()));
            }
            Ok(
                json!({"status":"readback_match","new_id":new_id,"eeprom_locked":true,"persistence_confirmed":false,"reason":"ID and lock read back; power-cycle persistence still requires operator verification"}),
            )
        }
        DeviceAction::Scan { .. } | DeviceAction::CancelScan => {
            unreachable!("scan is scheduled by the collector")
        }
    }
}
pub fn process(
    job: Job,
    bus: &mut Option<MaintenanceBus>,
    ids: &mut Vec<u8>,
    enabled: bool,
    seen: &mut HashSet<String>,
    state: &Arc<Mutex<State>>,
    scan_cursor: &mut Option<u16>,
) -> bool {
    let command = &job.command;
    let reason = if Instant::now() >= job.deadline {
        Some("Command expired")
    } else if command.operation.id().is_some_and(|id| id > 253) {
        Some("Unicast ID must be in 0..253")
    } else if command.operation.writes() && !enabled {
        Some("Bench control disabled")
    } else if command.operation.writes() && state.lock().unwrap().scan.active {
        Some("Scan active; finish or cancel before writing")
    } else if bus.is_none() {
        Some("Serial disconnected")
    } else if seen.contains(&command.command_id) {
        Some("Duplicate command; not executed again")
    } else if seen.len() >= 4096 {
        Some("Session command limit reached; restart explicitly")
    } else {
        None
    };
    if let Some(reason) = reason {
        let _ = job.reply.send(rejected(command, reason));
        return false;
    }
    seen.insert(command.command_id.clone());
    match command.operation {
        DeviceAction::Scan { start_id, end_id } => {
            let mut current = state.lock().unwrap();
            if start_id > end_id || end_id > 253 || current.scan.active {
                let _ = job
                    .reply
                    .send(rejected(command, "Invalid ID range or scan already active"));
                return false;
            }
            current.scan = duck_ipc_proto::maintenance::ScanState {
                active: true,
                start_id,
                end_id,
                completed: 0,
                found_ids: Vec::new(),
                status: "scanning".into(),
            };
            *scan_cursor = Some(u16::from(start_id));
            let _ = job
                .reply
                .send(json!({"command_id":command.command_id,"id":null,"status":"scan_started"}));
            return false;
        }
        DeviceAction::CancelScan => {
            *scan_cursor = None;
            let mut current = state.lock().unwrap();
            current.scan.active = false;
            current.scan.status = "cancelled".into();
            let _ = job
                .reply
                .send(json!({"command_id":command.command_id,"id":null,"status":"scan_cancelled"}));
            return false;
        }
        _ => {}
    }
    let mut attempted = false;
    let result = execute(bus.as_mut().unwrap(), &job, &mut attempted);
    let transport_lost = matches!(&result, Err(BusError::Transport(_)));
    if result.is_ok() {
        let id = command.operation.id().unwrap();
        if let DeviceAction::ChangeId { new_id, .. } = command.operation {
            ids.retain(|n| *n != id);
            if !ids.contains(&new_id) {
                ids.push(new_id);
            }
            state.lock().unwrap().scan.found_ids.retain(|n| *n != id);
        } else {
            ids.retain(|n| *n != id);
            ids.insert(0, id);
        }
    }
    let mut value = match result {
        Ok(value) => value,
        Err(error) => {
            json!({"status":if attempted {"unconfirmed"} else {"rejected"},"reason":error.to_string(),"motion_complete":false,"notice":"No automatic retry; if a write was attempted it may have been applied"})
        }
    };
    value["command_id"] = json!(command.command_id);
    value["id"] = json!(command.operation.id());
    value["received_unix_ms"] = json!(super::unix_ms());
    let _ = job.reply.send(value);
    transport_lost
}
