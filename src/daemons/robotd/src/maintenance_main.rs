//! Desktop maintenance subset; explicitly enabled bounded bench operations.
mod maintenance;
use duck_control::{
    bus::{BusError, MaintenanceBus},
    io::{REFERENCE_PROFILE, decode_reference},
};
use duck_ipc_proto::maintenance::{
    DeviceReading, MAX_FRAME, Request, Source, State, VERSION, empty_readings,
    empty_unassigned_readings,
};
use serde_json::{Value, json};
use std::{
    env,
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn ports() -> Value {
    match serialport::available_ports() {
        Ok(ports) => json!({"ports": ports.into_iter().map(|p| {
            let usb = match p.port_type {
                serialport::SerialPortType::UsbPort(u) => json!({"vid":u.vid,"pid":u.pid,"serial_number":u.serial_number,"manufacturer":u.manufacturer,"product":u.product}),
                _ => Value::Null,
            };
            json!({"path":p.port_name,"usb":usb,"opened":false})
        }).collect::<Vec<_>>(),"notice":"Enumeration only; no port opened. USB identity is not servo identity."}),
        Err(e) => json!({"ports":[],"error":e.to_string()}),
    }
}

fn response(
    request: Request,
    token: &str,
    state: &Arc<Mutex<State>>,
    queue: &maintenance::Queue,
) -> Value {
    if request.jsonrpc != "2.0" || request.token != token {
        return json!({"jsonrpc":"2.0","id":request.id,"error":{"code":-32001,"message":"Unauthorized or unsupported RPC version"}});
    }
    let result = match request.method.as_str() {
        "maintenance.state" => serde_json::to_value(state.lock().unwrap().clone()).unwrap(),
        "maintenance.ports" => ports(),
        "maintenance.command" => match request.params {
            Some(command) => maintenance::dispatch(command, state, queue),
            None => {
                return json!({"jsonrpc":"2.0","id":request.id,"error":{"code":-32602,"message":"Command parameters required"}});
            }
        },
        _ => {
            return json!({"jsonrpc":"2.0","id":request.id,"error":{"code":-32601,"message":"Maintenance method not found"}});
        }
    };
    json!({"jsonrpc":"2.0","id":request.id,"result":result})
}
fn serve(
    mut stream: TcpStream,
    token: &str,
    state: &Arc<Mutex<State>>,
    queue: &maintenance::Queue,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let mut frame = Vec::new();
    let read =
        BufReader::new((&mut stream).take((MAX_FRAME + 1) as u64)).read_until(b'\n', &mut frame);
    if read.is_err() || frame.len() > MAX_FRAME || !frame.ends_with(b"\n") {
        return;
    }
    let reply = match serde_json::from_slice::<Request>(&frame) {
        Ok(request) => response(request, token, state, queue),
        Err(_) => {
            json!({"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Invalid request"}})
        }
    };
    if let Ok(mut encoded) = serde_json::to_vec(&reply) {
        encoded.push(b'\n');
        let _ = stream.write_all(&encoded);
    }
}

fn collector(
    state: Arc<Mutex<State>>,
    mut bus: Option<MaintenanceBus>,
    fixture: bool,
    mut ids: Vec<u8>,
    feedback: bool,
    enabled: bool,
    commands: mpsc::Receiver<maintenance::Job>,
) {
    let start = Instant::now();
    let mut disconnected = false;
    let mut seen = std::collections::HashSet::new();
    let mut scan_cursor: Option<u16> = None;
    let mut poll_cursor = 0usize;
    loop {
        for _ in 0..8 {
            let Ok(job) = commands.try_recv() else {
                break;
            };
            if maintenance::process(
                job,
                &mut bus,
                &mut ids,
                enabled,
                &mut seen,
                &state,
                &mut scan_cursor,
            ) {
                disconnected = true;
                bus = None;
            }
        }
        let reason = if disconnected {
            "Serial disconnected; restart explicitly to reconnect"
        } else if !fixture && bus.is_none() {
            "Serial not connected"
        } else {
            "ID not requested"
        };
        let previous = state.lock().unwrap().clone();
        let mut rows = previous.joints;
        let mut unassigned = empty_unassigned_readings(&ids, reason);
        for row in &mut unassigned {
            if let Some(old) = previous
                .unassigned_devices
                .iter()
                .find(|old| old.id == row.id)
            {
                *row = old.clone();
            }
        }
        // Round-robin reads keep HTTP / command dispatch responsive during a full scan.
        // The first configured / explicitly selected device receives every other poll.
        let scanning = scan_cursor.is_some();
        let next_id = scan_cursor.map(|id| id as u8).or_else(|| {
            if ids.is_empty() {
                None
            } else {
                let id = if poll_cursor % 2 == 0 {
                    ids[0]
                } else {
                    ids[(poll_cursor / 2) % ids.len()]
                };
                poll_cursor = poll_cursor.wrapping_add(1);
                Some(id)
            }
        });
        if let Some(id) = next_id {
            if disconnected {
                scan_cursor = None;
            } else {
                let mut row = DeviceReading::missing(id, reason);
                let result = if fixture {
                    let mut bytes = vec![0u8; 15];
                    let value = 2048u16 + u16::from(row.id % 5) * 32;
                    bytes[0..2].copy_from_slice(&value.to_le_bytes());
                    bytes[6] = 78;
                    bytes[7] = 32;
                    bytes[11..13].copy_from_slice(&2048u16.to_le_bytes());
                    Ok((0, bytes))
                } else if let Some(bus) = bus.as_mut() {
                    if feedback && !scanning {
                        bus.reference_feedback(row.id)
                    } else {
                        bus.ping(row.id)
                    }
                } else {
                    Err(BusError::Invalid("Serial not connected".into()))
                };
                match result {
                    Ok((error, bytes)) => {
                        row.received_unix_ms = Some(unix_ms());
                        row.received_monotonic_ms = Some(start.elapsed().as_millis() as u64);
                        row.status = if error == 0 {
                            if fixture { "fixture" } else { "response" }
                        } else {
                            "device_error"
                        }
                        .into();
                        row.device_error = Some(error);
                        // Retain original bytes even when the device reports a fault.
                        row.decoded_reference = if error == 0 {
                            decode_reference(&bytes)
                        } else {
                            None
                        };
                        row.raw_bytes = Some(bytes);
                        row.reason = Some(
                            "HD firmware/register mapping and physical calibration unconfirmed"
                                .into(),
                        );
                    }
                    Err(e) => {
                        row.status = "missing".into();
                        row.reason = Some(e.to_string());
                        if matches!(e, BusError::Transport(_)) {
                            disconnected = true;
                            bus = None;
                        }
                    }
                }
                if scanning {
                    let mut current = state.lock().unwrap();
                    current.scan.completed += 1;
                    if row.status != "missing" {
                        current.scan.found_ids.push(id);
                        if !ids.contains(&id) {
                            ids.push(id);
                        }
                    }
                    if id == current.scan.end_id || disconnected {
                        scan_cursor = None;
                        current.scan.active = false;
                        current.scan.status = if disconnected {
                            "disconnected"
                        } else {
                            "complete"
                        }
                        .into();
                    } else {
                        scan_cursor = Some(u16::from(id) + 1);
                    }
                }
                if let Some(joint) = rows.iter_mut().find(|joint| joint.id == id) {
                    joint.apply_reading(row);
                } else if let Some(device) = unassigned.iter_mut().find(|device| device.id == id) {
                    *device = row;
                } else if row.status != "missing" {
                    unassigned.push(row);
                }
            }
        }
        let mut current = state.lock().unwrap();
        current.generated_unix_ms = unix_ms();
        current.collected_monotonic_ms = start.elapsed().as_millis() as u64;
        for row in &mut rows {
            if !ids.contains(&row.id) {
                row.apply_reading(DeviceReading::missing(row.id, reason));
            }
        }
        current.joints = rows;
        current.unassigned_devices = unassigned;
        if disconnected {
            current.joints = empty_readings("Serial disconnected; restart explicitly to reconnect");
            current.unassigned_devices = empty_unassigned_readings(
                &ids,
                "Serial disconnected; restart explicitly to reconnect",
            );
            current.scan.active = false;
            current.scan.status = "disconnected".into();
            scan_cursor = None;
            current.connection = "disconnected".into();
            current.bus_owner = "none".into();
            current.control_enabled = false;
            current.read_only = true;
        }
        drop(current);
        thread::sleep(Duration::from_millis(if scan_cursor.is_some() {
            1
        } else {
            10
        }));
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().skip(1).collect();
    if args == ["--list-ports"] {
        println!("{}", serde_json::to_string_pretty(&ports())?);
        return Ok(());
    }
    if args.iter().any(|a| a == "--help") {
        println!(
            "robotd --list-ports\nrobotd --rpc 127.0.0.1:8871 [--fixture | --port PATH [--ids 1,...] [--reference-feedback]] [--baud 1000000]\nOptional raw bench control: --bench-control --profile fd-hlsxx --reference-feedback. Default read-only; no automatic reconnect."
        );
        return Ok(());
    }
    let value = |name: &str| {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1))
            .map(String::as_str)
    };
    let allowed = [
        "--rpc",
        "--port",
        "--ids",
        "--baud",
        "--fixture",
        "--reference-feedback",
        "--bench-control",
        "--profile",
    ];
    let mut i = 0;
    while i < args.len() {
        let flag = &args[i];
        if !allowed.contains(&flag.as_str()) {
            return Err(format!("unknown option: {flag}").into());
        }
        if ["--fixture", "--reference-feedback", "--bench-control"].contains(&flag.as_str()) {
            i += 1;
        } else {
            if args.get(i + 1).is_none_or(|v| v.starts_with("--")) {
                return Err(format!("missing value for {flag}").into());
            }
            i += 2;
        }
    }
    let address: SocketAddr = value("--rpc").unwrap_or("127.0.0.1:8871").parse()?;
    if !address.ip().is_loopback() {
        return Err("RPC must bind to loopback".into());
    }
    let token = env::var("HATCHERY_RPC_TOKEN")?;
    if token.len() < 32 {
        return Err("RPC token must contain at least 32 characters".into());
    }
    let fixture = args.iter().any(|a| a == "--fixture");
    let feedback = args.iter().any(|a| a == "--reference-feedback");
    let enabled = args.iter().any(|a| a == "--bench-control");
    let port = value("--port").map(str::to_owned);
    if fixture && port.is_some() {
        return Err("fixture cannot open a hardware port".into());
    }
    if feedback && port.is_none() {
        return Err("reference feedback requires an explicit hardware port".into());
    }
    if enabled && (port.is_none() || !feedback || value("--profile") != Some("fd-hlsxx")) {
        return Err("bench control requires an explicit hardware port, --reference-feedback and --profile fd-hlsxx; operator must verify this reference profile on the bench".into());
    }
    if value("--profile").is_some_and(|p| p != "fd-hlsxx") {
        return Err("unsupported profile".into());
    }
    let ids = match value("--ids") {
        Some(s) => {
            let mut ids = Vec::new();
            for id in s.split(',') {
                let n = id.parse::<u8>()?;
                if n > 253 || ids.contains(&n) || ids.len() >= 254 {
                    return Err(
                        "IDs must be unique unicast IDs in 0..253, up to 254 per session".into(),
                    );
                }
                ids.push(n);
            }
            ids
        }
        None if port.is_some() => Vec::new(),
        None => duck_ipc_proto::maintenance::DISPLAY_IDS.to_vec(),
    };
    let baud = value("--baud").unwrap_or("1000000").parse::<u32>()?;
    if !(38_400..=1_000_000).contains(&baud) {
        return Err("baud outside reviewed interface range".into());
    }
    // Bind first so a second robotd with the same endpoint never opens the bus.
    let listener = TcpListener::bind(address)?;
    let bus = port
        .as_ref()
        .map(|p| MaintenanceBus::open(p, baud, Duration::from_millis(30)))
        .transpose()
        .map_err(|error| std::io::Error::other(format!("Cannot open {}: {error}. Close the port in FD1985 or other serial tools before retrying.", port.as_deref().unwrap_or("serial port"))))?;
    let state=Arc::new(Mutex::new(State {
        protocol_version:VERSION.into(), session_id:format!("robotd-{}-{}",std::process::id(),unix_ms()),
        source:if fixture {Source::Fixture} else if bus.is_some() {Source::Hardware} else {Source::Disconnected},
        fake:fixture,simulated:false,hardware_confirmed:false,read_only:!enabled,control_enabled:enabled,
        bus_owner:if bus.is_some() {"robotd-maintenance"} else {"none"}.into(),
        connection:if fixture {"fixture"} else if bus.is_some() {"open"} else {"disconnected"}.into(),
        baud:port.as_ref().map(|_| baud),port,profile_id:if enabled {Some("fd-hlsxx-bench-reference-v1".into())} else if fixture||feedback {Some(REFERENCE_PROFILE.into())} else {None},
        register_profile_confirmed:false,calibration_version:None,
        generated_unix_ms:unix_ms(),collected_monotonic_ms:0,max_age_ms:1500,
        joints:empty_readings("No sample received"),
        unassigned_devices:empty_unassigned_readings(&ids,"No sample received"),scan:Default::default(),
        notice:if enabled {"Raw bench control enabled by operator. FD HLS reference is not a verified HD firmware profile; no authoritative joint calibration or automatic reconnect; ID changes require FD firmware identity checks."} else {"Read-only maintenance. No automatic reconnect."}.into(),
    }));
    let copy = state.clone();
    let (queue, commands) = mpsc::sync_channel(8);
    thread::spawn(move || collector(copy, bus, fixture, ids, feedback, enabled, commands));
    println!("robotd maintenance RPC on {address}; fixture={fixture}; bench_control={enabled}");
    let active = Arc::new(AtomicUsize::new(0));
    for stream in listener.incoming().flatten() {
        if active.fetch_add(1, Ordering::SeqCst) >= 8 {
            active.fetch_sub(1, Ordering::SeqCst);
            continue;
        }
        let state = state.clone();
        let token = token.clone();
        let active = active.clone();
        let queue = queue.clone();
        thread::spawn(move || {
            serve(stream, &token, &state, &queue);
            active.fetch_sub(1, Ordering::SeqCst);
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejected_rpc_cannot_become_a_control_or_port_opening_entry() {
        let state = Arc::new(Mutex::new(State {
            protocol_version: VERSION.into(),
            session_id: "test".into(),
            source: Source::Disconnected,
            fake: false,
            simulated: false,
            hardware_confirmed: false,
            read_only: true,
            control_enabled: false,
            bus_owner: "none".into(),
            connection: "disconnected".into(),
            port: None,
            baud: None,
            profile_id: None,
            register_profile_confirmed: false,
            calibration_version: None,
            generated_unix_ms: 0,
            collected_monotonic_ms: 0,
            max_age_ms: 1500,
            joints: empty_readings("offline"),
            unassigned_devices: Vec::new(),
            scan: Default::default(),
            notice: "".into(),
        }));
        let (queue, _commands) = mpsc::sync_channel(8);
        for method in [
            "goal",
            "goals_verify",
            "torque",
            "release",
            "open_port",
            "firmware",
        ] {
            let r = response(
                Request {
                    jsonrpc: "2.0".into(),
                    id: 1,
                    token: "secret".into(),
                    method: method.into(),
                    params: None,
                },
                "secret",
                &state,
                &queue,
            );
            assert_eq!(r["error"]["code"], -32601);
        }
        let r = response(
            Request {
                jsonrpc: "2.0".into(),
                id: 2,
                token: "wrong".into(),
                method: "maintenance.state".into(),
                params: None,
            },
            "secret",
            &state,
            &queue,
        );
        assert_eq!(r["error"]["code"], -32001);
    }
}
