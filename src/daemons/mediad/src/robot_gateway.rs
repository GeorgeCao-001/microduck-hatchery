//! Read-only cache of the official robotd subscription. No motor or intent calls.
use duck_ipc_proto as proto;
use serde_json::{Value, json};
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

pub const PATH: &str = "/api/v1/maintenance/runtime";
#[cfg(any(unix, test))]
const MAX_LINE: usize = 65536;
#[cfg(any(unix, test))]
const LEASE: Duration = Duration::from_secs(6);

#[derive(Clone)]
pub struct RobotGateway(Arc<Mutex<Cache>>);
struct Cache {
    prefix: String,
    session: u64,
    touched: Instant,
    #[cfg(unix)]
    running: bool,
    hello: Option<proto::HelloResult>,
    health: Option<proto::HealthResult>,
    subscription: Option<proto::SubscribeResult>,
    frame: Option<proto::RobotState>,
    health_at: Option<Instant>,
    frame_at: Option<Instant>,
    error: &'static str,
}
impl Cache {
    #[cfg(any(unix, test))]
    fn reset(&mut self, error: &'static str) {
        self.session += 1;
        self.hello = None;
        self.health = None;
        self.subscription = None;
        self.frame = None;
        self.health_at = None;
        self.frame_at = None;
        self.error = error;
    }
    fn view(&self) -> Value {
        json!({"protocol_version":"hatchery-runtime/1","source":"robotd","capture_mode":"unreported",
            "session_id":format!("{}-{}", self.prefix, self.session),
            "connected":self.hello.is_some(),"fresh":self.frame_at.is_some_and(|t|t.elapsed()<Duration::from_millis(1500)),
            "health_fresh":self.health_at.is_some_and(|t|t.elapsed()<Duration::from_secs(4)),
            "frame_age_ms":self.frame_at.map(|t|t.elapsed().as_millis()),
            "device_mono_ns":self.frame.as_ref().filter(|f|f.t_ns>0).map(|f|f.t_ns.to_string()),
            "hello":self.hello,"health":self.health,"subscription":self.subscription,
            "joint_names":proto::JOINT_NAMES,"joint_unit":"rad",
            "state":self.frame,"error":self.error})
    }
}
impl RobotGateway {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(Cache {
            prefix: format!(
                "runtime-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            ),
            session: 0,
            touched: Instant::now(),
            #[cfg(unix)]
            running: false,
            hello: None,
            health: None,
            subscription: None,
            frame: None,
            health_at: None,
            frame_at: None,
            error: "robotd not connected",
        })))
    }
    pub fn snapshot(&self) -> Value {
        let mut cache = self.0.lock().unwrap();
        cache.touched = Instant::now();
        #[cfg(unix)]
        if !cache.running {
            cache.running = true;
            let shared = self.0.clone();
            std::thread::spawn(move || worker(shared));
        }
        #[cfg(not(unix))]
        {
            cache.error = "formal robotd requires Radxa Linux";
        }
        cache.view()
    }
}

// Request::call and the result types are the existing official contract.
#[cfg(any(unix, test))]
fn request(id: u64, call: proto::Call) -> Vec<u8> {
    let mut bytes =
        serde_json::to_vec(&proto::Request::call(proto::Id::Number(id), &call)).unwrap();
    bytes.push(b'\n');
    bytes
}
#[cfg(any(unix, test))]
fn accept(cache: &mut Cache, line: &[u8]) -> Result<bool, &'static str> {
    if line.len() > MAX_LINE {
        return Err("robotd frame exceeded limit");
    }
    let value: Value = serde_json::from_slice(line).map_err(|_| "invalid robotd JSON")?;
    if value["jsonrpc"] != "2.0" {
        return Err("invalid robotd protocol");
    }
    if value.get("method").is_some() {
        let event: proto::Request =
            serde_json::from_value(value).map_err(|_| "invalid robotd event")?;
        if event.method != proto::method::ROBOT_STATE {
            return Ok(false);
        }
        if cache.subscription.is_none() {
            return Err("robotd state before subscription");
        }
        let frame = event.as_state().ok_or("invalid robotd state")?;
        if frame.t < 0.0
            || frame.control_loop.hz < 0.0
            || [
                &frame.joints,
                &frame.targets,
                &frame.velocities,
                &frame.currents_ma,
            ]
            .iter()
            .any(|v| v.len() > 32)
            || frame.skeleton.len() > 64
        {
            return Err("invalid robotd state bounds");
        }
        if cache.frame.as_ref().is_some_and(|old| {
            frame.t < old.t || (frame.t_ns > 0 && old.t_ns > 0 && frame.t_ns < old.t_ns)
        }) {
            return Err("robotd clock restarted");
        }
        cache.frame = Some(frame);
        cache.frame_at = Some(Instant::now());
        return Ok(false);
    }
    let reply: proto::Response =
        serde_json::from_value(value).map_err(|_| "invalid robotd response")?;
    if reply.error.is_some() {
        return Err("robotd rejected read-only subscription");
    }
    let result = reply.result.ok_or("missing robotd result")?;
    match reply.id {
        Some(proto::Id::Number(1)) => {
            let hello: proto::HelloResult =
                serde_json::from_value(result).map_err(|_| "invalid robotd identity")?;
            if !(37..=proto::API_VERSION).contains(&hello.api_version) {
                return Err("unsupported robotd API");
            }
            cache.hello = Some(hello);
            cache.error = "";
            return Ok(true);
        }
        Some(proto::Id::Number(2)) => {
            if cache.hello.is_none() {
                return Err("robotd identity not received");
            }
            let subscription: proto::SubscribeResult =
                serde_json::from_value(result).map_err(|_| "invalid subscription result")?;
            if !subscription.accepted {
                return Err("robotd subscription refused");
            }
            cache.subscription = Some(subscription);
        }
        Some(proto::Id::Number(3)) => {
            if cache.hello.is_none() {
                return Err("robotd identity not received");
            }
            cache.health =
                Some(serde_json::from_value(result).map_err(|_| "invalid robotd health")?);
            cache.health_at = Some(Instant::now());
        }
        _ => return Err("unexpected robotd response"),
    }
    Ok(false)
}

#[cfg(unix)]
fn worker(shared: Arc<Mutex<Cache>>) {
    loop {
        {
            let mut cache = shared.lock().unwrap();
            if cache.touched.elapsed() > LEASE {
                cache.reset("subscription idle");
                cache.running = false;
                return;
            }
            cache.reset("connecting to robotd");
        }
        let error = pump(&shared).err().unwrap_or("robotd disconnected");
        shared.lock().unwrap().reset(error);
        std::thread::sleep(Duration::from_secs(1));
    }
}
#[cfg(unix)]
fn pump(shared: &Arc<Mutex<Cache>>) -> Result<(), &'static str> {
    use std::{os::unix::net::UnixStream, path::PathBuf};
    let path = std::env::var_os("HATCHERY_ROBOT_SOCKET")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            if let Some(dir) = std::env::var_os("DUCK_RUNTIME_DIR") {
                return PathBuf::from(dir).join("robotd.sock");
            }
            if std::env::var_os("INVOCATION_ID").is_some() {
                // Match the retained Hatchery run-radxa.py service layout.
                return PathBuf::from("/run/robot/robotd.sock");
            }
            std::env::var_os("HOME")
                .map(|p| PathBuf::from(p).join(".local/state/microduck-hatchery/run/robotd.sock"))
                .unwrap_or_else(|| proto::socket::ROBOT.into())
        });
    let stream = UnixStream::connect(path).map_err(|_| "robotd socket unavailable")?;
    stream
        .set_read_timeout(Some(Duration::from_millis(250)))
        .map_err(|_| "robotd socket timeout unavailable")?;
    stream
        .set_write_timeout(Some(Duration::from_secs(1)))
        .map_err(|_| "robotd socket timeout unavailable")?;
    run_stream(stream, shared)
}
#[cfg(any(unix, test))]
fn run_stream(
    mut stream: impl std::io::Read + std::io::Write,
    shared: &Arc<Mutex<Cache>>,
) -> Result<(), &'static str> {
    use std::io::ErrorKind;
    stream
        .write_all(&request(
            1,
            proto::Call::Hello(proto::HelloParams {
                api_version: proto::API_VERSION,
            }),
        ))
        .map_err(|_| "robotd handshake failed")?;
    let mut pending = Vec::new();
    let mut block = [0; 4096];
    let mut last_health = Instant::now();
    let started = Instant::now();
    loop {
        {
            let cache = shared.lock().unwrap();
            if cache.touched.elapsed() > LEASE {
                return Ok(());
            }
            if cache.hello.is_none() && started.elapsed() > Duration::from_secs(3) {
                return Err("robotd handshake timed out");
            }
            if cache.hello.is_some() && last_health.elapsed() > Duration::from_secs(2) {
                drop(cache);
                stream
                    .write_all(&request(3, proto::Call::RobotHealth))
                    .map_err(|_| "robotd health request failed")?;
                last_health = Instant::now();
            }
        }
        let n = match stream.read(&mut block) {
            Ok(0) => return Err("robotd disconnected"),
            Ok(n) => n,
            Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => continue,
            Err(_) => return Err("robotd stream failed"),
        };
        pending.extend_from_slice(&block[..n]);
        while let Some(end) = pending.iter().position(|c| *c == b'\n') {
            let hello = accept(&mut shared.lock().unwrap(), &pending[..end])?;
            pending.drain(..=end);
            if hello {
                stream
                    .write_all(&request(
                        2,
                        proto::Call::RobotSubscribe(proto::SubscribeParams { hz: Some(5) }),
                    ))
                    .map_err(|_| "robotd subscribe failed")?;
                stream
                    .write_all(&request(3, proto::Call::RobotHealth))
                    .map_err(|_| "robotd health request failed")?;
                last_health = Instant::now();
            }
        }
        if pending.len() > MAX_LINE {
            return Err("robotd frame exceeded limit");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ready() -> Cache {
        let gateway = RobotGateway::new();
        let mut cache = gateway.0.lock().unwrap();
        accept(&mut cache,br#"{"jsonrpc":"2.0","id":1,"result":{"api_version":44,"daemon_version":"0.17.6","revision":null}}"#).unwrap();
        accept(
            &mut cache,
            br#"{"jsonrpc":"2.0","id":2,"result":{"accepted":true}}"#,
        )
        .unwrap();
        // A standalone cache keeps the tests independent of Unix sockets.
        Cache {
            prefix: cache.prefix.clone(),
            session: 0,
            touched: Instant::now(),
            #[cfg(unix)]
            running: false,
            hello: cache.hello.clone(),
            health: None,
            subscription: cache.subscription.clone(),
            frame: None,
            health_at: None,
            frame_at: None,
            error: "",
        }
    }
    fn frame(t: f64) -> Vec<u8> {
        serde_json::to_vec(&json!({"jsonrpc":"2.0","method":"robot.state","params":{"t":t,"move":{"requested":[0,0,0],"applied":[0,0,0],"limited_by":[]},"head":[0,0,0,0],"policy":"held","safety":{"fallen":false,"limp":false},"loop":{"hz":50.0,"missed":2},"joints":[],"targets":[]}})).unwrap()
    }
    #[test]
    fn only_official_read_only_methods_are_encoded() {
        for (id, call) in [
            (
                1,
                proto::Call::Hello(proto::HelloParams { api_version: 44 }),
            ),
            (
                2,
                proto::Call::RobotSubscribe(proto::SubscribeParams { hz: Some(5) }),
            ),
            (3, proto::Call::RobotHealth),
        ] {
            let parsed: proto::Request =
                serde_json::from_slice(&request(id, call.clone())).unwrap();
            assert_eq!(parsed.as_call().unwrap(), call);
        }
    }
    #[test]
    fn subscription_state_is_shared_and_cleared_on_disconnect() {
        let mut cache = ready();
        accept(&mut cache, &frame(4.0)).unwrap();
        assert_eq!(cache.view()["fresh"], true);
        assert_eq!(cache.view()["state"]["joints"], json!([]));
        let old = cache.view()["session_id"].clone();
        cache.reset("disconnected");
        assert_ne!(old, cache.view()["session_id"]);
        assert_eq!(cache.view()["fresh"], false);
        assert!(cache.frame.is_none());
    }
    #[test]
    fn bad_frames_and_clock_reversal_do_not_replace_the_last_frame() {
        let mut cache = ready();
        accept(&mut cache, &frame(4.0)).unwrap();
        assert!(accept(&mut cache, &frame(3.0)).is_err());
        assert!(accept(&mut cache, b"{broken").is_err());
        assert_eq!(cache.frame.as_ref().unwrap().t, 4.0);
        assert!(accept(&mut cache, &vec![b' '; MAX_LINE + 1]).is_err());
    }
    #[test]
    fn stale_frames_are_not_reported_live() {
        let mut cache = ready();
        accept(&mut cache, &frame(4.0)).unwrap();
        cache.frame_at = Some(Instant::now() - Duration::from_secs(2));
        assert_eq!(cache.view()["fresh"], false);
    }
    #[test]
    fn real_stream_exchanges_only_read_calls_and_accepts_fragmented_notifications() {
        use std::{
            io::{BufRead, BufReader, Write},
            net::{TcpListener, TcpStream},
        };
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut writer, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(writer.try_clone().unwrap());
            let mut observed = Vec::new();
            for id in 1..=3 {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                let r: proto::Request = serde_json::from_str(&line).unwrap();
                observed.push(r.method.clone());
                let result = match id {
                    1 => json!({"api_version":44,"daemon_version":"0.17.6","revision":null}),
                    2 => json!({"accepted":true}),
                    _ => json!({"healthy":false,"reason":"no motor power"}),
                };
                writeln!(
                    writer,
                    "{}",
                    json!({"jsonrpc":"2.0","id":id,"result":result})
                )
                .unwrap();
            }
            let frame = frame(7.0);
            let split = frame.len() / 2;
            writer.write_all(&frame[..split]).unwrap();
            writer.write_all(&frame[split..]).unwrap();
            writer.write_all(b"\n").unwrap();
            observed
        });
        let stream = TcpStream::connect(address).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_millis(250)))
            .unwrap();
        let gateway = RobotGateway::new();
        assert_eq!(run_stream(stream, &gateway.0), Err("robotd disconnected"));
        assert_eq!(
            server.join().unwrap(),
            ["hello", "robot.subscribe", "robot.health"]
        );
        let cache = gateway.0.lock().unwrap();
        assert_eq!(cache.frame.as_ref().unwrap().t, 7.0);
        assert_eq!(cache.health.as_ref().unwrap().healthy, false);
    }
}
