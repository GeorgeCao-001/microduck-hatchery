//! Fixed ISP21 API2 interface hosted inside the upstream 3A process.
//! The vendor's legacy IPC remains the fallback. No second ISP engine is started.
use duck_ipc_proto::maintenance::CameraParameter;
#[cfg(unix)]
use std::io::{Read, Write};
use std::{path::PathBuf, time::Duration};

const KEYS: &[(&str, i64, i64, &str)] = &[
    ("sharpness", 0, 100, "%"),
    ("noise_reduction", 0, 100, "%"),
    ("temporal_noise_reduction", 0, 100, "%"),
    ("auto_gamma", 0, 1, ""),
    ("gamma", 1, 10000, "×0.01"),
    ("white_balance_temperature", 2800, 7500, "K"),
    ("auto_white_balance", 0, 1, ""),
    ("red_balance", 0, 8000, "×0.001"),
    ("blue_balance", 0, 8000, "×0.001"),
    ("brightness", 0, 255, ""),
    ("contrast", 0, 255, ""),
    ("saturation", 0, 255, ""),
];

pub struct Client {
    path: Option<PathBuf>,
}
impl Client {
    pub fn new() -> Self {
        let path = std::env::var_os("HATCHERY_RKAIQ_CONTROL_SOCKET")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("DUCK_RUNTIME_DIR")
                    .map(|p| PathBuf::from(p).join("rkaiq-control.sock"))
            });
        Self { path }
    }
    pub fn parameters(&self) -> Result<Vec<CameraParameter>, String> {
        self.request(1, 0, 0)
    }
    pub fn set(&self, key: &str, value: i64) -> Result<(), String> {
        let index = KEYS
            .iter()
            .position(|p| p.0 == key)
            .ok_or("Unsupported ISP control")?;
        let (_, min, max, _) = KEYS[index];
        if !(min..=max).contains(&value) {
            return Err("ISP value outside range".into());
        }
        let controls = self.request(2, index as u32 + 1, value as i32)?;
        if !controls
            .iter()
            .any(|p| p.key == key && p.value.is_some_and(|v| matches(key, value, v)))
        {
            return Err("ISP write not confirmed; refresh current state".into());
        }
        Ok(())
    }
    #[cfg(unix)]
    fn request(&self, op: u32, key: u32, value: i32) -> Result<Vec<CameraParameter>, String> {
        use std::os::unix::net::UnixStream;
        let path = self
            .path
            .as_ref()
            .ok_or("ISP advanced interface not configured")?;
        let mut s = UnixStream::connect(path).map_err(|_| "ISP advanced interface unavailable")?;
        s.set_read_timeout(Some(Duration::from_millis(600)))
            .map_err(|_| "Cannot bound ISP query")?;
        s.set_write_timeout(Some(Duration::from_millis(300)))
            .map_err(|_| "Cannot bound ISP write")?;
        s.write_all(&packet(op, key, value))
            .map_err(|_| "ISP result unknown; refresh current state")?;
        let mut header = [0u8; 16];
        s.read_exact(&mut header)
            .map_err(|_| "ISP result unknown; refresh current state")?;
        let count = header_count(&header)?;
        let mut records = vec![0; count * 16];
        s.read_exact(&mut records)
            .map_err(|_| "Incomplete ISP readback")?;
        decode(&records)
    }
    #[cfg(not(unix))]
    fn request(&self, _op: u32, _key: u32, _value: i32) -> Result<Vec<CameraParameter>, String> {
        let _ = (&self.path, Duration::ZERO);
        Err("ISP advanced interface requires Linux".into())
    }
}
pub fn matches(key: &str, expected: i64, actual: i64) -> bool {
    (expected - actual).abs()
        <= if ["sharpness", "noise_reduction", "temporal_noise_reduction"].contains(&key) {
            1
        } else {
            0
        }
}
fn number(b: &[u8]) -> u32 {
    u32::from_le_bytes(b.try_into().unwrap())
}
fn packet(op: u32, key: u32, value: i32) -> Vec<u8> {
    let mut b = b"HIQ1".to_vec();
    for n in [op, key, value as u32] {
        b.extend_from_slice(&n.to_le_bytes());
    }
    b
}
fn header_count(h: &[u8; 16]) -> Result<usize, String> {
    if &h[..4] != b"HIQ1" || number(&h[4..8]) != 0 || number(&h[12..]) != 0 {
        return Err("ISP control unavailable or write not confirmed".into());
    }
    let count = number(&h[8..12]) as usize;
    if count > KEYS.len() {
        return Err("Invalid ISP capability count".into());
    }
    Ok(count)
}
fn decode(records: &[u8]) -> Result<Vec<CameraParameter>, String> {
    if records.len() % 16 != 0 || records.len() > KEYS.len() * 16 {
        return Err("Invalid ISP reply size".into());
    }
    let mut controls = Vec::new();
    for r in records.chunks_exact(16) {
        let id = number(&r[..4]) as usize;
        let &(key, min, max, unit) = id
            .checked_sub(1)
            .and_then(|i| KEYS.get(i))
            .ok_or("Unknown ISP capability")?;
        let flags = number(&r[8..12]);
        let raw = i64::from(number(&r[4..8]) as i32);
        if flags & !3 != 0
            || number(&r[12..]) != 0
            || (flags & 1 != 0 && !(min..=max).contains(&raw))
            || controls.iter().any(|p: &CameraParameter| p.key == key)
        {
            return Err("Invalid ISP capability".into());
        }
        controls.push(CameraParameter {
            key: key.into(),
            min,
            max,
            step: 1,
            value: (flags & 1 != 0).then_some(raw),
            writable: flags & 2 != 0,
            source: "isp".into(),
            unit: unit.into(),
            choices: if ["auto_gamma", "auto_white_balance"].contains(&key) {
                vec![(0, "手动".into()), (1, "自动".into())]
            } else {
                Vec::new()
            },
        });
    }
    Ok(controls)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn record(id: u32, value: i32, flags: u32) -> Vec<u8> {
        [id, value as u32, flags, 0]
            .into_iter()
            .flat_map(u32::to_le_bytes)
            .collect()
    }
    #[test]
    fn bounded_capabilities_preserve_units_and_unknown_curve_values() {
        let mut b = record(1, 50, 3);
        b.extend(record(5, 0, 2));
        b.extend(record(6, 4300, 3));
        let out = decode(&b).unwrap();
        assert_eq!(out[0].key, "sharpness");
        assert_eq!(out[0].value, Some(50));
        assert_eq!(out[1].unit, "×0.01");
        assert_eq!(out[1].value, None);
        assert!(out[1].writable);
        assert_eq!(out[2].unit, "K");
        for invalid in [
            record(0, 0, 3),
            record(13, 0, 3),
            record(1, 101, 3),
            record(5, -1, 3),
            record(6, 8000, 3),
            record(1, 0, 4),
        ] {
            assert!(decode(&invalid).is_err());
        }
        b = record(1, 50, 3);
        b.extend(record(1, 50, 3));
        assert!(decode(&b).is_err());
        assert!(decode(&[0; 15]).is_err());
    }
    #[test]
    fn invalid_counts_errors_and_arbitrary_writes_are_rejected() {
        let mut h = [0; 16];
        h[..4].copy_from_slice(b"HIQ1");
        h[8] = 12;
        assert_eq!(header_count(&h).unwrap(), 12);
        h[8] = 13;
        assert!(header_count(&h).is_err());
        h[8] = 0;
        h[4] = 1;
        assert!(header_count(&h).is_err());
        assert!(Client::new().set("system/reset", 1).is_err());
        assert!(Client::new().set("gamma", 0).is_err());
        assert!(
            Client::new()
                .set("white_balance_temperature", 8000)
                .is_err()
        );
        assert_eq!(
            packet(2, 5, 220),
            [
                b"HIQ1".as_slice(),
                &2u32.to_le_bytes(),
                &5u32.to_le_bytes(),
                &220i32.to_le_bytes()
            ]
            .concat()
        );
        #[cfg(not(unix))]
        assert!(Client::new().parameters().is_err());
    }
}
