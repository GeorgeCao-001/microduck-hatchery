//! Desktop maintenance subset. Never starts a policy, camera or motor writes.
use duck_control::{
    bus::{BusError, ReadOnlyBus},
    io::{REFERENCE_PROFILE, decode_reference},
};
use duck_ipc_proto::{
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

fn response(request: Request, token: &str, state: &Arc<Mutex<State>>) -> Value {
    if request.jsonrpc != "2.0" || request.token != token {
        return json!({"jsonrpc":"2.0","id":request.id,"error":{"code":-32001,"message":"Unauthorized or unsupported RPC version"}});
    }
    let result = match request.method.as_str() {
        "maintenance.state" => serde_json::to_value(state.lock().unwrap().clone()).unwrap(),
        "maintenance.ports" => ports(),
        _ => {
            return json!({"jsonrpc":"2.0","id":request.id,"error":{"code":-32601,"message":"Read-only maintenance method not found"}});
        }
    };
    json!({"jsonrpc":"2.0","id":request.id,"result":result})
}
fn serve(mut stream: TcpStream, token: &str, state: &Arc<Mutex<State>>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let mut frame = Vec::new();
    let read =
        BufReader::new((&mut stream).take((MAX_FRAME + 1) as u64)).read_until(b'\n', &mut frame);
    if read.is_err() || frame.len() > MAX_FRAME || !frame.ends_with(b"\n") {
        return;
    }
    let reply = match serde_json::from_slice::<Request>(&frame) {
        Ok(request) => response(request, token, state),
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
    mut bus: Option<ReadOnlyBus>,
    fixture: bool,
    ids: Vec<u8>,
    feedback: bool,
) {
    let start = Instant::now();
    let mut disconnected = false;
    loop {
        let reason = if disconnected {
            "Serial disconnected; restart explicitly to reconnect"
        } else if !fixture && bus.is_none() {
            "Serial not connected"
        } else {
            "ID not requested"
        };
        let mut rows = empty_readings(reason);
        let mut unassigned = empty_unassigned_readings(&ids, reason);
        for &id in &ids {
            if disconnected {
                continue;
            }
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
                if feedback {
                    bus.reference_feedback(row.id)
                } else {
                    bus.ping(row.id)
                }
            } else {
                continue;
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
                        "HD firmware/register mapping and physical calibration unconfirmed".into(),
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
            if let Some(joint) = rows.iter_mut().find(|joint| joint.id == id) {
                joint.apply_reading(row);
            } else if let Some(device) = unassigned.iter_mut().find(|device| device.id == id) {
                *device = row;
            }
        }
        let mut current = state.lock().unwrap();
        current.generated_unix_ms = unix_ms();
        current.collected_monotonic_ms = start.elapsed().as_millis() as u64;
        current.joints = rows;
        current.unassigned_devices = unassigned;
        if disconnected {
            current.joints = empty_readings("Serial disconnected; restart explicitly to reconnect");
            current.unassigned_devices = empty_unassigned_readings(
                &ids,
                "Serial disconnected; restart explicitly to reconnect",
            );
            current.connection = "disconnected".into();
            current.bus_owner = "none".into();
        }
        drop(current);
        thread::sleep(Duration::from_millis(300));
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
            "robotd --list-ports\nrobotd --rpc 127.0.0.1:8871 [--fixture | --port PATH --ids 20,21,... [--reference-feedback]] [--baud 1000000]\nDefault: disconnected. HATCHERY_RPC_TOKEN required for RPC. No write or automatic reconnect."
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
    ];
    let mut i = 0;
    while i < args.len() {
        let flag = &args[i];
        if !allowed.contains(&flag.as_str()) {
            return Err(format!("unknown option: {flag}").into());
        }
        if flag == "--fixture" || flag == "--reference-feedback" {
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
    let port = value("--port").map(str::to_owned);
    if fixture && port.is_some() {
        return Err("fixture cannot open a hardware port".into());
    }
    if feedback && port.is_none() {
        return Err("reference feedback requires an explicit hardware port".into());
    }
    let ids = match value("--ids") {
        Some(s) => {
            let mut ids = Vec::new();
            for id in s.split(',') {
                let n = id.parse::<u8>()?;
                if n > 253 || ids.contains(&n) || ids.len() >= 32 {
                    return Err(
                        "IDs must be unique unicast IDs in 0..253, up to 32 per session".into(),
                    );
                }
                ids.push(n);
            }
            ids
        }
        None if port.is_some() => {
            return Err("hardware port requires explicit --ids; no automatic scan".into());
        }
        None => duck_ipc_proto::DISPLAY_IDS.to_vec(),
    };
    let baud = value("--baud").unwrap_or("1000000").parse::<u32>()?;
    if !(38_400..=1_000_000).contains(&baud) {
        return Err("baud outside reviewed interface range".into());
    }
    // Bind first so a second robotd with the same endpoint never opens the bus.
    let listener = TcpListener::bind(address)?;
    let bus = port
        .as_ref()
        .map(|p| ReadOnlyBus::open(p, baud, Duration::from_millis(30)))
        .transpose()
        .map_err(|error| std::io::Error::other(format!("Cannot open {}: {error}. Close the port in FD1985 or other serial tools before retrying.", port.as_deref().unwrap_or("serial port"))))?;
    let state=Arc::new(Mutex::new(State {
        protocol_version:VERSION.into(), session_id:format!("robotd-{}-{}",std::process::id(),unix_ms()),
        source:if fixture {Source::Fixture} else if bus.is_some() {Source::Hardware} else {Source::Disconnected},
        fake:fixture,simulated:false,hardware_confirmed:false,read_only:true,control_enabled:false,
        bus_owner:if bus.is_some() {"robotd-maintenance"} else {"none"}.into(),
        connection:if fixture {"fixture"} else if bus.is_some() {"open"} else {"disconnected"}.into(),
        baud:port.as_ref().map(|_| baud),port,profile_id:if fixture||feedback {Some(REFERENCE_PROFILE.into())} else {None},
        register_profile_confirmed:false,calibration_version:None,
        generated_unix_ms:unix_ms(),collected_monotonic_ms:0,max_age_ms:1500,
        joints:empty_readings("No sample received"),
        unassigned_devices:empty_unassigned_readings(&ids,"No sample received"),
        notice:"Read-only maintenance subset. No motion, configuration writes, calibration or automatic reconnect.".into(),
    }));
    let copy = state.clone();
    thread::spawn(move || collector(copy, bus, fixture, ids, feedback));
    println!("robotd read-only RPC on {address}; fixture={fixture}; control disabled");
    let active = Arc::new(AtomicUsize::new(0));
    for stream in listener.incoming().flatten() {
        if active.fetch_add(1, Ordering::SeqCst) >= 8 {
            active.fetch_sub(1, Ordering::SeqCst);
            continue;
        }
        let state = state.clone();
        let token = token.clone();
        let active = active.clone();
        thread::spawn(move || {
            serve(stream, &token, &state);
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
            notice: "".into(),
        }));
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
                },
                "secret",
                &state,
            );
            assert_eq!(r["error"]["code"], -32601);
        }
        let r = response(
            Request {
                jsonrpc: "2.0".into(),
                id: 2,
                token: "wrong".into(),
                method: "maintenance.state".into(),
            },
            "secret",
            &state,
        );
        assert_eq!(r["error"]["code"], -32001);
    }
}
