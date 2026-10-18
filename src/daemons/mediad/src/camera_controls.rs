//! Live camera controls owned by mediad. No capture-format or frame-rate writes.
use duck_ipc_proto::maintenance::{CAMERA_VERSION, CameraChange, CameraParameter, CameraState};
use std::{
    collections::VecDeque,
    io::Read,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const KEYS: &[&str] = &[
    "exposure",
    "analogue_gain",
    "brightness",
    "gain",
    "digital_gain",
    "contrast",
    "saturation",
    "sharpness",
    "gamma",
    "white_balance_automatic",
    "auto_white_balance",
    "white_balance_temperature",
    "red_balance",
    "blue_balance",
    "noise_reduction",
    "temporal_noise_reduction",
    "auto_gamma",
];

#[derive(Clone, Debug)]
pub struct ExposureRuntime {
    pub enabled: bool,
    pub target: f64,
    pub revision: u64,
    pub seed: u32,
    pub gain_seed: u32,
    pub min: u32,
    pub max: u32,
    pub step: u32,
    pub shutter_only: bool,
    pub available: bool,
}
impl Default for ExposureRuntime {
    fn default() -> Self {
        Self {
            enabled: false,
            target: 90.0,
            revision: 0,
            seed: 600,
            gain_seed: 1024,
            min: 4,
            max: 1200,
            step: 1,
            shutter_only: true,
            available: false,
        }
    }
}
pub type ExposureGate = Arc<Mutex<ExposureRuntime>>;

#[derive(Clone)]
pub struct CameraControls(Arc<Inner>);
struct Inner {
    device: Option<String>,
    isp_device: Option<String>,
    isp: crate::rkaiq::Client,
    source: String,
    width: u32,
    height: u32,
    fps: u32,
    session: String,
    gate: ExposureGate,
    requests: Mutex<VecDeque<String>>,
}
impl CameraControls {
    pub fn new(
        device: Option<String>,
        source: &str,
        width: u32,
        height: u32,
        fps: u32,
        gate: ExposureGate,
    ) -> Self {
        Self(Arc::new(Inner {
            device,
            isp_device: std::env::var("HATCHERY_CAMERA_ISP_DEVICE")
                .ok()
                .filter(|s| !s.trim().is_empty()),
            isp: crate::rkaiq::Client::new(),
            source: source.into(),
            width,
            height,
            fps,
            session: format!(
                "camera-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            ),
            gate,
            requests: Mutex::new(VecDeque::new()),
        }))
    }
    fn parameters(&self) -> Result<Vec<CameraParameter>, String> {
        self.probe().map(|(controls, _)| controls)
    }
    fn probe(
        &self,
    ) -> Result<
        (
            Vec<CameraParameter>,
            std::collections::HashMap<String, String>,
        ),
        String,
    > {
        let mut controls = Vec::new();
        let mut targets = std::collections::HashMap::new();
        let Some(device) = self.0.device.as_ref() else {
            return Ok((controls, targets));
        };
        for (path, isp) in std::iter::once((device, false)).chain(
            self.0
                .isp_device
                .as_ref()
                .filter(|p| *p != device)
                .map(|p| (p, true)),
        ) {
            let output = tool(&["-d", path, "--list-ctrls-menus"])?;
            for mut parameter in parse_controls(&output) {
                if targets.contains_key(&parameter.key) {
                    continue;
                }
                if isp {
                    parameter.source = "isp".into();
                }
                targets.insert(parameter.key.clone(), path.clone());
                controls.push(parameter);
            }
        }
        for parameter in self.0.isp.parameters() {
            if !targets.contains_key(&parameter.key) {
                targets.insert(parameter.key.clone(), "rkaiq".into());
                controls.push(parameter);
            }
        }
        Ok((controls, targets))
    }
    fn acquire_gate(&self) -> Result<std::sync::MutexGuard<'_, ExposureRuntime>, String> {
        let deadline = Instant::now() + Duration::from_millis(250);
        loop {
            match self.0.gate.try_lock() {
                Ok(gate) => return Ok(gate),
                Err(std::sync::TryLockError::WouldBlock) if Instant::now() < deadline => {
                    thread::sleep(Duration::from_millis(5))
                }
                _ => return Err("Camera is busy".into()),
            }
        }
    }
    pub fn state(&self) -> Result<CameraState, String> {
        let parameters = self.parameters()?;
        let gate = self.acquire_gate()?;
        Ok(self.assemble(parameters, &gate))
    }
    fn assemble(&self, mut controls: Vec<CameraParameter>, gate: &ExposureRuntime) -> CameraState {
        let auto = controls
            .iter()
            .find(|p| p.key == "exposure" && p.writable && gate.available)
            .map(|_| gate.enabled);
        // In auto mode brightness is the existing exposure meter's target. In manual
        // mode use an ISP brightness control only when the device actually exposes one.
        if auto.is_some() && (gate.enabled || !controls.iter().any(|p| p.key == "brightness")) {
            controls.retain(|p| p.key != "brightness");
            controls.push(CameraParameter {
                key: "brightness".into(),
                min: 30,
                max: 200,
                step: 1,
                value: Some(gate.target.round() as i64),
                writable: gate.enabled,
                unit: "".into(),
                source: "ae-target".into(),
                choices: Vec::new(),
            });
        }
        CameraState {
            protocol_version: CAMERA_VERSION.into(),
            session_id: self.0.session.clone(),
            source: self.0.source.clone(),
            width: self.0.width,
            height: self.0.height,
            target_fps: self.0.fps,
            mode: if self.0.device.is_some() {
                "UYVY".into()
            } else {
                self.0.source.clone()
            },
            auto_exposure: auto,
            controls,
        }
    }
    pub fn change(&self, change: CameraChange) -> Result<CameraState, String> {
        if change.session_id != self.0.session
            || change.request_id.is_empty()
            || change.request_id.len() > 80
        {
            return Err("Camera session changed".into());
        }
        self.0.device.as_ref().ok_or("No physical camera")?;
        let mut seen = self.0.requests.try_lock().map_err(|_| "Camera is busy")?;
        if seen.contains(&change.request_id) {
            return Err("Duplicate camera request".into());
        }
        let (controls, targets) = self.probe()?;
        let mut gate = self.acquire_gate()?;
        if change.key == "auto_exposure" && change.value == 0 {
            gate.enabled = false;
            gate.revision += 1;
            remember(&mut seen, change.request_id);
            let state = self.assemble(self.parameters()?, &gate);
            drop(gate);
            drop(seen);
            return Ok(state);
        }
        // Validate before remembering or writing. Never accept arbitrary V4L2 names.
        if change.key == "auto_exposure" {
            if ![0, 1].contains(&change.value) {
                return Err("Invalid exposure mode".into());
            }
            let exposure = controls
                .iter()
                .find(|p| p.key == "exposure" && p.writable)
                .ok_or("Exposure control unavailable")?;
            if !gate.available {
                return Err("Exposure loop unavailable".into());
            }
            gate.enabled = change.value == 1;
            gate.seed = exposure
                .value
                .unwrap_or(exposure.min)
                .clamp(exposure.min, exposure.max) as u32;
            gate.gain_seed = controls
                .iter()
                .find(|p| p.key == "analogue_gain")
                .and_then(|p| p.value)
                .unwrap_or(256) as u32;
            gate.min = exposure.min.max(1) as u32;
            gate.max = exposure.max.min(1200).max(i64::from(gate.min)) as u32;
            gate.step = exposure.step as u32;
            gate.revision += 1;
        } else if change.key == "brightness" && gate.enabled {
            if !(30..=200).contains(&change.value) {
                return Err("Brightness outside range".into());
            }
            gate.target = change.value as f64;
        } else {
            let parameter = controls
                .iter()
                .find(|p| p.key == change.key)
                .ok_or("Unsupported camera parameter")?;
            validate_value(parameter, change.value)?;
            if ["exposure", "analogue_gain", "gain", "digital_gain"].contains(&change.key.as_str())
                && gate.enabled
            {
                return Err("Select manual exposure first".into());
            }
            // Remember before the write: a timeout is not permission to repeat it.
            remember(&mut seen, change.request_id.clone());
            let target = targets
                .get(&change.key)
                .ok_or("Camera parameter target unavailable")?;
            if target == "rkaiq" {
                self.0.isp.set(&change.key, change.value)?;
            } else {
                tool(&[
                    "-d",
                    target,
                    &format!("--set-ctrl={}={}", change.key, change.value),
                ])?;
            }
            let readback = self.parameters()?;
            if !readback
                .iter()
                .find(|p| p.key == change.key)
                .and_then(|p| p.value)
                .is_some_and(|actual| {
                    if target == "rkaiq" {
                        crate::rkaiq_control::matches(&change.key, change.value, actual)
                    } else {
                        actual == change.value
                    }
                })
            {
                return Err("Camera readback did not match; refresh current value".into());
            }
            if let Some(exposure) = readback
                .iter()
                .find(|p| p.key == "exposure")
                .and_then(|p| p.value)
            {
                gate.seed = exposure as u32;
            }
            if let Some(gain) = readback
                .iter()
                .find(|p| p.key == "analogue_gain")
                .and_then(|p| p.value)
            {
                gate.gain_seed = gain as u32;
            }
            gate.revision += 1;
            let state = self.assemble(readback, &gate);
            drop(gate);
            drop(seen);
            return Ok(state);
        }
        remember(&mut seen, change.request_id);
        let state = self.assemble(controls, &gate);
        drop(gate);
        drop(seen);
        Ok(state)
    }
}
fn remember(seen: &mut VecDeque<String>, id: String) {
    seen.push_back(id);
    if seen.len() > 64 {
        seen.pop_front();
    }
}
fn validate_value(parameter: &CameraParameter, value: i64) -> Result<(), String> {
    if !parameter.writable
        || value < parameter.min
        || value > parameter.max
        || (value - parameter.min) % parameter.step != 0
        || (!parameter.choices.is_empty() && !parameter.choices.iter().any(|c| c.0 == value))
    {
        return Err("Camera parameter is read-only or outside its supported range".into());
    }
    Ok(())
}

/// Bounded fixed-tool invocation. No shell, caller-supplied executable or retries.
pub(crate) fn tool(args: &[&str]) -> Result<String, String> {
    let mut child = Command::new("v4l2-ctl")
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "v4l2-ctl unavailable")?;
    // Drain concurrently: control enumeration can exceed the OS pipe capacity.
    let stdout = child
        .stdout
        .take()
        .ok_or("Camera tool output unavailable")?;
    let reader = thread::spawn(move || {
        let mut output = String::new();
        stdout
            .take(32_769)
            .read_to_string(&mut output)
            .map(|_| output)
    });
    let deadline = Instant::now() + Duration::from_millis(650);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(5)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return Err("Camera control timed out".into());
            }
        }
    };
    let output = reader
        .join()
        .map_err(|_| "Camera tool failed")?
        .map_err(|_| "Camera tool output failed")?;
    if !status.success() || output.len() > 32_768 {
        return Err("Camera control rejected or unavailable".into());
    }
    Ok(output)
}
pub(crate) fn parse_controls(text: &str) -> Vec<CameraParameter> {
    let mut controls: Vec<CameraParameter> = Vec::new();
    let mut menu_key = None;
    for line in text.lines() {
        let line = line.trim();
        if let Some((head, tail)) = line.split_once(" : ") {
            let name = head.split_whitespace().next().unwrap_or("");
            menu_key = None;
            if !KEYS.contains(&name) {
                continue;
            }
            let numeric = head.contains("(int)")
                || head.contains("(bool)")
                || head.contains("(menu)")
                || head.contains("(intmenu)");
            if !numeric {
                continue;
            }
            let field = |key: &str| {
                tail.split_whitespace()
                    .find_map(|part| part.strip_prefix(&format!("{key}=")))?
                    .trim_end_matches(',')
                    .parse::<i64>()
                    .ok()
            };
            let boolean = head.contains("(bool)");
            let Some(min) = field("min").or(boolean.then_some(0)) else {
                continue;
            };
            let Some(max) = field("max").or(boolean.then_some(1)) else {
                continue;
            };
            let step = field("step").unwrap_or(1);
            if step < 1 || min > max || min < -1_000_000 || max > 1_000_000_000 {
                continue;
            }
            let value = field("value").filter(|v| *v >= min && *v <= max);
            let writable = !["read-only", "inactive", "grabbed", "disabled"]
                .iter()
                .any(|flag| tail.contains(flag));
            controls.push(CameraParameter {
                key: name.into(),
                min,
                max,
                step,
                value,
                writable,
                unit: if name == "exposure" {
                    "lines"
                } else if name == "white_balance_temperature" {
                    "K"
                } else if boolean {
                    ""
                } else {
                    "raw"
                }
                .into(),
                source: if ["exposure", "analogue_gain", "digital_gain"].contains(&name) {
                    "sensor"
                } else {
                    "isp"
                }
                .into(),
                choices: Vec::new(),
            });
            if head.contains("(menu)") || head.contains("(intmenu)") {
                menu_key = Some(controls.len() - 1);
            }
        } else if let Some(index) = menu_key {
            if let Some((id, label)) = line.split_once(':') {
                if let Ok(id) = id.trim().parse::<i64>() {
                    controls[index].choices.push((id, label.trim().to_owned()));
                }
            }
        }
    }
    controls
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn polling_waits_out_a_brief_exposure_write() {
        let gate = Arc::new(Mutex::new(ExposureRuntime::default()));
        let camera = CameraControls::new(None, "test", 640, 360, 15, gate.clone());
        let (ready, waiting) = std::sync::mpsc::channel();
        let worker = thread::spawn(move || {
            let _guard = gate.lock().unwrap();
            ready.send(()).unwrap();
            thread::sleep(Duration::from_millis(40));
        });
        waiting.recv().unwrap();
        assert!(camera.state().is_ok());
        worker.join().unwrap();
    }

    #[test]
    fn controls_keep_signed_ranges_menus_and_read_only_flags() {
        let rows = parse_controls(
            "brightness 0x00980900 (int) : min=-64 max=64 step=1 default=0 value=-2\nexposure 0x009a0902 (int) : min=4 max=1762 step=1 value=600\nwhite_balance_automatic 0x0098090c (bool) : default=1 value=1\nwhite_balance_temperature 0x0098091a (int) : min=2000 max=8000 step=10 value=4000 flags=inactive\nmenu_unknown 0x00000001 (int) : min=0 max=1 value=1\ngain 0x00980913 (menu) : min=0 max=2 default=0 value=0\n    0: Low\n    2: High\n",
        );
        assert_eq!(rows.len(), 5);
        assert_eq!(rows[0].value, Some(-2));
        assert_eq!(rows[1].unit, "lines");
        assert_eq!(rows[2].max, 1);
        assert!(!rows[3].writable);
        assert!(validate_value(&rows[3], 4001).is_err());
        assert!(validate_value(&rows[4], 1).is_err());
        assert!(validate_value(&rows[4], 2).is_ok());
    }
    #[test]
    fn format_fps_and_arbitrary_controls_cannot_be_written() {
        assert!(parse_controls("fps 0x00000001 (int) : min=1 max=60 value=30\nexposure 0x1 (int) : min=20 max=4 step=1 value=10\n").is_empty());
        let gate = Arc::new(Mutex::new(ExposureRuntime::default()));
        let controls = CameraControls::new(None, "test", 640, 360, 15, gate);
        let state = controls.state().unwrap();
        assert_eq!(state.auto_exposure, None);
        assert!(state.controls.iter().all(|p| !p.writable));
        assert!(
            controls
                .change(CameraChange {
                    session_id: state.session_id,
                    request_id: "1".into(),
                    key: "fps".into(),
                    value: 30
                })
                .is_err()
        );
    }
}
