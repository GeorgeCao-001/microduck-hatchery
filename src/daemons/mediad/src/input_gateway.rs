//! Read-only view of the official padd tap. Never writes input or robot intents.
use duck_ipc_proto as proto;
use serde_json::{Value, json};
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
pub const PATH: &str = "/api/v1/maintenance/input";
#[derive(Clone)]
pub struct InputGateway(Arc<Mutex<State>>);
#[derive(Default)]
struct State {
    connected: bool,
    device: Option<proto::PadInputDevice>,
    frame: Option<proto::PadFrame>,
    at: Option<Instant>,
    touched: Option<Instant>,
    #[cfg(unix)]
    running: bool,
    session: u64,
    error: String,
}
impl State {
    #[cfg(any(unix, test))]
    fn reset(&mut self, error: &str) {
        self.connected = false;
        self.device = None;
        self.frame = None;
        self.at = None;
        self.session += 1;
        self.error = error.into();
    }
    #[cfg(any(unix, test))]
    fn accept(&mut self, line: &[u8]) -> Result<(), &'static str> {
        if line.len() > 65536 {
            return Err("input report exceeded limit");
        }
        let v: Value = serde_json::from_slice(line).map_err(|_| "invalid input report")?;
        if v["jsonrpc"] != "2.0" {
            return Err("invalid input protocol");
        }
        if v.get("method").is_none() {
            let r: proto::Response =
                serde_json::from_value(v).map_err(|_| "invalid input reply")?;
            if r.id != Some(proto::Id::Number(1)) || r.error.is_some() {
                return Err("padd refused subscription");
            }
            let result: proto::PadInputResult =
                serde_json::from_value(r.result.ok_or("missing input result")?)
                    .map_err(|_| "invalid input result")?;
            if !result.accepted {
                return Err("padd refused subscription");
            }
            self.connected = true;
            self.error.clear();
            return Ok(());
        }
        if !self.connected {
            return Err("input before subscription");
        }
        let r: proto::Request = serde_json::from_value(v).map_err(|_| "invalid input event")?;
        let Some(report) = r.as_pad_report() else {
            return Ok(());
        };
        match report {
            proto::PadReport::Attached { device } => {
                if device.axes.len() > 64 || device.buttons.len() > 256 {
                    return Err("input device exceeded limit");
                }
                self.session += 1;
                self.device = Some(*device);
                self.frame = None;
                self.at = Some(Instant::now());
            }
            proto::PadReport::Detached { why } => {
                self.device = None;
                self.frame = None;
                self.at = None;
                self.session += 1;
                self.error = why.chars().take(240).collect();
            }
            proto::PadReport::Frame(frame) => {
                if frame.events.len() > 1024 {
                    return Err("input events exceeded limit");
                }
                let device = self.device.as_mut().ok_or("input frame before device")?;
                if self.frame.as_ref().is_some_and(|old| frame.seq <= old.seq) {
                    return Err("input sequence restarted");
                }
                if frame.after_drop || frame.socket_dropped > 0 {
                    return Err("input reports dropped; resynchronizing");
                }
                for event in &frame.events {
                    if event.kind == proto::PadEvent::ABSOLUTE {
                        if let Some(a) = device.axes.iter_mut().find(|a| a.code == event.code) {
                            a.value = event.value;
                        }
                    } else if event.kind == proto::PadEvent::KEY {
                        if let Some(b) = device.buttons.iter_mut().find(|b| b.code == event.code) {
                            b.pressed = event.value != 0;
                        }
                    }
                }
                self.frame = Some(frame);
                self.at = Some(Instant::now());
            }
            _ => {} // Robot IMU migration remains explicitly deferred.
        }
        Ok(())
    }
}
impl InputGateway {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(State::default())))
    }
    pub fn snapshot(&self) -> Value {
        let mut s = self.0.lock().unwrap();
        s.touched = Some(Instant::now());
        #[cfg(unix)]
        if !s.running {
            s.running = true;
            let shared = self.0.clone();
            std::thread::spawn(move || worker(shared));
        }
        #[cfg(not(unix))]
        {
            s.error = "padd requires Radxa Linux".into();
        }
        json!({"protocol_version":"hatchery-input/1","source":"padd","session_id":format!("{}-{}",std::process::id(),s.session),"connected":s.connected,"fresh":s.connected&&s.at.is_some_and(|at|at.elapsed()<Duration::from_millis(1500)),"age_ms":s.at.map(|at|at.elapsed().as_millis()),"device":s.device,"frame":s.frame,"error":s.error})
    }
}
#[cfg(unix)]
fn worker(shared: Arc<Mutex<State>>) {
    loop {
        {
            let mut s = shared.lock().unwrap();
            if s.touched
                .is_none_or(|t| t.elapsed() > Duration::from_secs(6))
            {
                s.reset("input observer idle");
                s.running = false;
                return;
            }
            s.reset("connecting to padd");
        }
        let error = pump(&shared).err().unwrap_or("input observer idle");
        shared.lock().unwrap().reset(error);
        std::thread::sleep(Duration::from_secs(1));
    }
}
#[cfg(unix)]
fn pump(shared: &Arc<Mutex<State>>) -> Result<(), &'static str> {
    use std::{os::unix::net::UnixStream, path::PathBuf};
    // Match padd's actual --tap-socket default, rather than infer a path from robotd.
    let path = std::env::var_os("HATCHERY_PAD_SOCKET")
        .map(PathBuf::from)
        .unwrap_or_else(|| proto::socket::PAD.into());
    let stream = UnixStream::connect(path).map_err(|_| "padd socket unavailable")?;
    stream
        .set_read_timeout(Some(Duration::from_millis(250)))
        .map_err(|_| "input timeout unavailable")?;
    stream
        .set_write_timeout(Some(Duration::from_secs(1)))
        .map_err(|_| "input timeout unavailable")?;
    run_stream(stream, shared)
}
#[cfg(any(unix, test))]
fn run_stream(
    mut stream: impl std::io::Read + std::io::Write,
    shared: &Arc<Mutex<State>>,
) -> Result<(), &'static str> {
    use std::io::ErrorKind;
    let mut request = serde_json::to_vec(&proto::Request::call(
        proto::Id::Number(1),
        &proto::Call::PadInput,
    ))
    .unwrap();
    request.push(b'\n');
    stream
        .write_all(&request)
        .map_err(|_| "input subscription failed")?;
    let started = Instant::now();
    let mut pending = Vec::new();
    let mut block = [0; 4096];
    loop {
        {
            let s = shared.lock().unwrap();
            if s.touched
                .is_none_or(|t| t.elapsed() > Duration::from_secs(6))
            {
                return Ok(());
            }
            if !s.connected && started.elapsed() > Duration::from_secs(3) {
                return Err("padd subscription timed out");
            }
        }
        let n = match stream.read(&mut block) {
            Ok(0) => return Err("padd disconnected"),
            Ok(n) => n,
            Err(e) if matches!(e.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) => continue,
            Err(_) => return Err("input read failed"),
        };
        pending.extend_from_slice(&block[..n]);
        while let Some(end) = pending.iter().position(|b| *b == b'\n') {
            shared.lock().unwrap().accept(&pending[..end])?;
            pending.drain(..=end);
        }
        if pending.len() > 65536 {
            return Err("input report exceeded limit");
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn send(s: &mut State, v: Value) -> Result<(), &'static str> {
        s.accept(&serde_json::to_vec(&v).unwrap())
    }
    #[test]
    fn official_reports_accumulate_and_disconnect_clears_pressed_buttons() {
        let mut s = State::default();
        send(
            &mut s,
            json!({"jsonrpc":"2.0","id":1,"result":{"accepted":true}}),
        )
        .unwrap();
        send(&mut s,json!({"jsonrpc":"2.0","method":"pad.report","params":{"report":"attached","device":{"name":"Pad","node":"/dev/input/event2","bus":3,"vendor":1,"product":2,"axes":[{"code":0,"name":"ABS_X","min":-100,"max":100,"flat":2,"fuzz":1,"value":0}],"buttons":[{"code":304,"name":"BTN_SOUTH","pressed":false}]}}})).unwrap();
        send(&mut s,json!({"jsonrpc":"2.0","method":"pad.report","params":{"report":"frame","seq":1,"at_us":123,"events":[{"kind":1,"code":304,"name":"BTN_SOUTH","value":1}]}})).unwrap();
        assert!(s.device.as_ref().unwrap().buttons[0].pressed);
        s.reset("disconnected");
        assert!(s.device.is_none());
        assert!(s.frame.is_none());
        assert!(!s.connected);
    }
    #[test]
    fn refuses_reports_before_identity_and_oversized_or_non_rpc_input() {
        let mut s = State::default();
        assert!(s.accept(&vec![b' '; 65537]).is_err());
        assert!(send(&mut s, json!({"jsonrpc":"1.0"})).is_err());
        assert!(send(&mut s,json!({"jsonrpc":"2.0","method":"pad.report","params":{"report":"detached","why":"gone"}})).is_err());
    }
    #[test]
    fn actual_stream_sends_only_pad_input_and_accepts_fragmented_reports() {
        use std::{
            io::{BufRead, BufReader, Write},
            net::{TcpListener, TcpStream},
        };
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut writer, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(writer.try_clone().unwrap());
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            let request: proto::Request = serde_json::from_str(&line).unwrap();
            assert!(matches!(request.as_call().unwrap(), proto::Call::PadInput));
            writeln!(
                writer,
                "{}",
                serde_json::to_string(&proto::Response::ok(
                    request.id,
                    &proto::PadInputResult {
                        accepted: true,
                        reason: None
                    }
                ))
                .unwrap()
            )
            .unwrap();
            let device = proto::PadInputDevice {
                name: "USB pad".into(),
                node: "/dev/input/event3".into(),
                unique: None,
                bus: 3,
                vendor: 1,
                product: 2,
                axes: vec![],
                buttons: vec![],
            };
            let bytes = serde_json::to_vec(&proto::Request::notify_pad_report(
                &proto::PadReport::Attached {
                    device: Box::new(device),
                },
            ))
            .unwrap();
            let split = bytes.len() / 2;
            writer.write_all(&bytes[..split]).unwrap();
            writer.write_all(&bytes[split..]).unwrap();
            writer.write_all(b"\n").unwrap();
        });
        let stream = TcpStream::connect(address).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_millis(250)))
            .unwrap();
        let gateway = InputGateway::new();
        gateway.0.lock().unwrap().touched = Some(Instant::now());
        assert_eq!(run_stream(stream, &gateway.0), Err("padd disconnected"));
        server.join().unwrap();
        assert_eq!(
            gateway.0.lock().unwrap().device.as_ref().unwrap().name,
            "USB pad"
        );
    }
    #[test]
    fn dropped_reports_refuse_to_replay_a_pressed_key() {
        let mut s = State::default();
        s.connected = true;
        s.device = Some(proto::PadInputDevice {
            name: "pad".into(),
            node: "event0".into(),
            unique: None,
            bus: 3,
            vendor: 0,
            product: 0,
            axes: vec![],
            buttons: vec![proto::PadKey {
                code: 304,
                name: "BTN_SOUTH".into(),
                pressed: false,
            }],
        });
        let bad = json!({"jsonrpc":"2.0","method":"pad.report","params":{"report":"frame","seq":1,"at_us":1,"socket_dropped":1,"events":[{"kind":1,"code":304,"name":"BTN_SOUTH","value":1}]}});
        assert!(send(&mut s, bad).is_err());
        assert!(!s.device.as_ref().unwrap().buttons[0].pressed);
        s.reset("resynchronizing");
        assert!(s.device.is_none());
    }
}
