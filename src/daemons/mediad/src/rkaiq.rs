// Copyright (c) 2019-2021 Rockchip Electronics Co., Ltd.
// SPDX-License-Identifier: Apache-2.0
// Wire format/hash adapted from Rockchip MessageParser.cpp and socket_server.cpp.
// Sources and pinned revisions: docs/RKAIQ_IMPORT.json. No ISP algorithms reimplemented.
use duck_ipc_proto::maintenance::CameraParameter;
use serde_json::{Value, json};
use std::{
    io::{Read, Write},
    path::PathBuf,
    time::Duration,
};

const MODE: &str = "/uapi/0/awb_uapi/mode";
const GAIN: &str = "/uapi/0/awb_uapi/wbgain";
const CPROC_SET: i32 = 0x1d01;
const CPROC_GET: i32 = 0x1d02;
const LIMIT: usize = 16384;

pub struct Client {
    path: PathBuf,
    io: std::sync::Mutex<()>,
    advanced: crate::rkaiq_control::Client,
}
impl Client {
    pub fn new() -> Self {
        Self {
            io: std::sync::Mutex::new(()),
            advanced: crate::rkaiq_control::Client::new(),
            path: std::env::var_os("HATCHERY_RKAIQ_SOCKET")
                .map(PathBuf::from)
                .unwrap_or_else(|| "/tmp/UNIX.domain0".into()),
        }
    }
    pub fn parameters(&self) -> Vec<CameraParameter> {
        let Ok(_one) = self.io.try_lock() else {
            return Vec::new();
        };
        // One failed probe must not hide controls provided by another interface.
        let mut out = Vec::new();
        if let Ok(controls) = self.advanced.parameters() {
            return controls;
        }
        if let Ok(data) = self.legacy(CPROC_GET, &[]) {
            if let Ok(offset) = cproc_offset(&data) {
                for (i, key) in ["brightness", "contrast", "saturation"].iter().enumerate() {
                    out.push(parameter(key, 0, 255, data[offset + i].into(), true, ""));
                }
            }
        }
        if let Ok(mode) = self.get(MODE) {
            if let Some(auto) = wb_auto(&mode) {
                let mut p = parameter("auto_white_balance", 0, 1, i64::from(auto), true, "");
                p.choices = vec![(0, "手动".into()), (1, "自动".into())];
                out.push(p);
                if let Ok(gain) = self.get(GAIN) {
                    for (key, field) in [("red_balance", "rgain"), ("blue_balance", "bgain")] {
                        if let Some(n) = gain[field]
                            .as_f64()
                            .filter(|v| v.is_finite() && (0.0..=8.0).contains(v))
                        {
                            out.push(parameter(
                                key,
                                0,
                                8000,
                                (n * 1000.0).round() as i64,
                                !auto,
                                "×0.001",
                            ));
                        }
                    }
                }
            }
        }
        out
    }
    pub fn set(&self, key: &str, value: i64) -> Result<(), String> {
        let _one = self.io.try_lock().map_err(|_| "ISP controls are busy")?;
        // Decide the target before writing. A failed advanced write is never retried
        // through legacy IPC, because its result may already have reached the ISP.
        if self
            .advanced
            .parameters()
            .is_ok_and(|p| p.iter().any(|p| p.key == key))
        {
            return self.advanced.set(key, value);
        }
        match key {
            "brightness" | "contrast" | "saturation" if (0..=255).contains(&value) => {
                let mut data = self.legacy(CPROC_GET, &[])?;
                let offset = cproc_offset(&data)?;
                if offset == 8 {
                    data[..8].fill(0);
                } // synchronous default; preserve hue and other controls
                data[offset
                    + match key {
                        "brightness" => 0,
                        "contrast" => 1,
                        _ => 2,
                    }] = value as u8;
                self.legacy(CPROC_SET, &data)?;
                let readback = self.legacy(CPROC_GET, &[])?;
                let at = cproc_offset(&readback)?
                    + match key {
                        "brightness" => 0,
                        "contrast" => 1,
                        _ => 2,
                    };
                if readback[at] != value as u8 {
                    return Err("ISP readback did not match; refresh current value".into());
                }
            }
            "auto_white_balance" if [0, 1].contains(&value) => {
                let mut mode = self.get(MODE)?;
                let old = mode.get_mut("mode").ok_or("Unknown white balance schema")?;
                // RKAIQ JSON enums are normally names; preserve the probed representation.
                *old = if old.is_string() {
                    json!(if value == 1 { "OP_AUTO" } else { "OP_MANUAL" })
                } else {
                    json!(if value == 1 { 0 } else { 1 })
                };
                self.replace(MODE, mode)?;
                if wb_auto(&self.get(MODE)?) != Some(value == 1) {
                    return Err("White balance mode readback did not match".into());
                }
            }
            "red_balance" | "blue_balance" if (0..=8000).contains(&value) => {
                if wb_auto(&self.get(MODE)?) != Some(false) {
                    return Err("Select manual white balance first".into());
                }
                let mut gain = self.get(GAIN)?;
                let field = if key == "red_balance" {
                    "rgain"
                } else {
                    "bgain"
                };
                // Validate all channels before round-tripping the manufacturer's structure.
                if !["rgain", "grgain", "gbgain", "bgain"].iter().all(|k| {
                    gain[*k]
                        .as_f64()
                        .is_some_and(|n| n.is_finite() && (0.0..=8.0).contains(&n))
                }) {
                    return Err("Unknown white balance gain schema".into());
                }
                gain[field] = json!(value as f64 / 1000.0);
                self.replace(GAIN, gain)?;
                let got = self.get(GAIN)?[field]
                    .as_f64()
                    .ok_or("Missing gain readback")?;
                if (got * 1000.0 - value as f64).abs() > 1.0 {
                    return Err("White balance gain readback did not match".into());
                }
            }
            _ => return Err("Unsupported ISP control or value".into()),
        }
        Ok(())
    }
    fn get(&self, path: &str) -> Result<Value, String> {
        let mut stream = self.connect()?;
        let payload = serde_json::to_vec(&json!([{"op":"get","path":path}]))
            .map_err(|_| "Invalid ISP query")?;
        stream
            .write_all(&packet(1, &payload))
            .map_err(|_| "ISP query failed")?;
        let mut header = [0; 24];
        stream
            .read_exact(&mut header)
            .map_err(|_| "ISP query timed out")?;
        if header[..4] != [b'R', 0xaa, 0xff, b'K']
            || number(&header[4..8]) != 1
            || number(&header[8..12]) != 0
        {
            return Err("Unrecognized RKAIQ JSON reply".into());
        }
        let size = number(&header[16..20]) as usize;
        if size == 0 || size > LIMIT {
            return Err("Invalid RKAIQ reply length".into());
        }
        let mut data = vec![0; size];
        stream
            .read_exact(&mut data)
            .map_err(|_| "Incomplete RKAIQ reply")?;
        // This SDK's JSON reply leaves the trailing hash uninitialized. Do not treat it as a checksum.
        let reply: Value = serde_json::from_slice(data.strip_suffix(&[0]).unwrap_or(&data))
            .map_err(|_| "Invalid ISP JSON")?;
        reply
            .as_array()
            .and_then(|a| a.iter().find(|v| v["path"] == path))
            .and_then(|v| v.get("value"))
            .filter(|v| !v.is_null())
            .cloned()
            .ok_or("ISP parameter unavailable".into())
    }
    fn replace(&self, path: &str, value: Value) -> Result<(), String> {
        let mut stream = self.connect()?;
        let payload = serde_json::to_vec(&json!([{"op":"replace","path":path,"value":value}]))
            .map_err(|_| "Invalid ISP write")?;
        stream
            .write_all(&packet(0, &payload))
            .map_err(|_| "ISP write result unknown; refresh state")?;
        // The SDK sends no write acknowledgement. Drain a follow-up read on this
        // connection, then the caller verifies the requested field by a fresh read.
        // An unconfirmed write is never replayed.
        let payload = serde_json::to_vec(&json!([{"op":"get","path":path}])).unwrap();
        stream
            .write_all(&packet(1, &payload))
            .map_err(|_| "ISP write result unknown; refresh state")?;
        let mut header = [0; 24];
        stream
            .read_exact(&mut header)
            .map_err(|_| "ISP write result unknown; refresh state")?;
        if header[..4] != [b'R', 0xaa, 0xff, b'K']
            || number(&header[4..8]) != 1
            || number(&header[8..12]) != 0
        {
            return Err("Invalid ISP write readback".into());
        }
        let size = number(&header[16..20]) as usize;
        if size == 0 || size > LIMIT {
            return Err("Invalid ISP write readback length".into());
        }
        let mut data = vec![0; size];
        stream
            .read_exact(&mut data)
            .map_err(|_| "Incomplete ISP write readback")?;
        Ok(())
    }
    fn legacy(&self, command: i32, data: &[u8]) -> Result<Vec<u8>, String> {
        let mut stream = self.connect()?;
        let mut bytes = b"RK".to_vec();
        bytes.extend_from_slice(&((22 + data.len()) as u32).to_le_bytes());
        bytes.extend_from_slice(&command.to_le_bytes());
        bytes.extend_from_slice(&0i32.to_le_bytes());
        bytes.extend_from_slice(&(data.len() as u32).to_le_bytes());
        bytes.extend_from_slice(data);
        bytes.extend_from_slice(&hash(data).to_le_bytes());
        stream
            .write_all(&bytes)
            .map_err(|_| "ISP request result unknown")?;
        let mut header = [0; 18];
        stream
            .read_exact(&mut header)
            .map_err(|_| "ISP control unavailable")?;
        let size = number(&header[14..18]) as usize;
        if header[..2] != *b"RK"
            || number(&header[6..10]) != command as u32
            || number(&header[10..14]) != 0
            || size > LIMIT
            || number(&header[2..6]) as usize != 22 + size
        {
            return Err("Invalid RKAIQ control reply".into());
        }
        let mut payload = vec![0; size];
        stream
            .read_exact(&mut payload)
            .map_err(|_| "Incomplete ISP reply")?;
        let mut checksum = [0; 4];
        stream
            .read_exact(&mut checksum)
            .map_err(|_| "Missing ISP checksum")?;
        if number(&checksum)
            != if payload.is_empty() {
                0
            } else {
                hash(&payload)
            }
        {
            return Err("Invalid ISP checksum".into());
        }
        Ok(payload)
    }
    #[cfg(unix)]
    fn connect(&self) -> Result<std::os::unix::net::UnixStream, String> {
        let stream = std::os::unix::net::UnixStream::connect(&self.path)
            .map_err(|_| "RKAIQ socket unavailable or permission denied")?;
        stream
            .set_read_timeout(Some(Duration::from_millis(300)))
            .map_err(|_| "Cannot bound ISP request")?;
        stream
            .set_write_timeout(Some(Duration::from_millis(300)))
            .map_err(|_| "Cannot bound ISP request")?;
        Ok(stream)
    }
    #[cfg(not(unix))]
    fn connect(&self) -> Result<std::fs::File, String> {
        let _ = (&self.path, Duration::ZERO);
        Err("RKAIQ requires Linux".into())
    }
}
fn parameter(
    key: &str,
    min: i64,
    max: i64,
    value: i64,
    writable: bool,
    unit: &str,
) -> CameraParameter {
    CameraParameter {
        key: key.into(),
        min,
        max,
        step: 1,
        value: Some(value),
        writable,
        source: "isp".into(),
        unit: unit.into(),
        choices: Vec::new(),
    }
}
fn cproc_offset(data: &[u8]) -> Result<usize, String> {
    // v1: four uint8s; v2: rk_aiq_uapi_sync_t (8 bytes), then four uint8s.
    match data.len() {
        4 => Ok(0),
        12 => Ok(8),
        _ => Err("Unsupported RKAIQ color-control ABI".into()),
    }
}
fn wb_auto(value: &Value) -> Option<bool> {
    match &value["mode"] {
        Value::String(s) if s == "OP_AUTO" => Some(true),
        Value::String(s) if s == "OP_MANUAL" => Some(false),
        v if v.as_i64() == Some(0) => Some(true),
        v if v.as_i64() == Some(1) => Some(false),
        _ => None,
    }
}
fn number(data: &[u8]) -> u32 {
    u32::from_le_bytes(data.try_into().unwrap())
}
fn packet(command: i32, json: &[u8]) -> Vec<u8> {
    let mut data = json.to_vec();
    data.push(0);
    let mut bytes = vec![b'R', 0xaa, 0xff, b'K'];
    for n in [
        command as u32,
        0,
        0,
        data.len() as u32,
        (28 + data.len()) as u32,
    ] {
        bytes.extend_from_slice(&n.to_le_bytes());
    }
    bytes.extend_from_slice(&data);
    bytes.extend_from_slice(&hash(&data).to_le_bytes());
    bytes
}
fn hash(data: &[u8]) -> u32 {
    let m = 0x5bd1e995u32;
    let mut h = 97 ^ data.len() as u32;
    let mut chunks = data.chunks_exact(4);
    for word in &mut chunks {
        let mut k = number(word).wrapping_mul(m);
        k ^= k >> 24;
        k = k.wrapping_mul(m);
        h = h.wrapping_mul(m) ^ k;
    }
    let tail = chunks.remainder();
    for (i, n) in tail.iter().enumerate() {
        h ^= u32::from(*n) << (8 * i);
    }
    if !tail.is_empty() {
        h = h.wrapping_mul(m);
    }
    h ^= h >> 13;
    h = h.wrapping_mul(m);
    h ^ (h >> 15)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn packet_uses_sdk_offsets_and_null_terminated_json() {
        let p = packet(1, b"[]");
        assert_eq!(&p[..4], &[b'R', 0xaa, 0xff, b'K']);
        assert_eq!(number(&p[16..20]), 3);
        assert_eq!(number(&p[20..24]) as usize, p.len());
        assert_eq!(&p[24..27], b"[]\0");
        assert_eq!(number(&p[27..]), hash(b"[]\0"));
    }
    #[test]
    fn only_known_color_layouts_and_white_balance_modes_are_accepted() {
        assert_eq!(cproc_offset(&[0; 4]).unwrap(), 0);
        assert_eq!(cproc_offset(&[0; 12]).unwrap(), 8);
        assert!(cproc_offset(&[0; 8]).is_err());
        assert_eq!(wb_auto(&json!({"mode":"OP_AUTO"})), Some(true));
        assert_eq!(wb_auto(&json!({"mode":"OP_MANUAL"})), Some(false));
        assert_eq!(wb_auto(&json!({"mode":0})), Some(true));
        assert_eq!(wb_auto(&json!({"mode":1})), Some(false));
        assert_eq!(wb_auto(&json!({"mode":99})), None);
    }
    #[test]
    fn arbitrary_controls_never_reach_the_socket() {
        assert!(Client::new().set("system/reset", 1).is_err());
        assert!(Client::new().set("contrast", 256).is_err());
    }
}
