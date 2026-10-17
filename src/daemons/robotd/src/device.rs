//! Read-only host information. No bus IO, network configuration or pairing.
use duck_ipc_proto::maintenance::{
    DEVICE_VERSION, DeviceBluetooth, DeviceIdentity, DeviceInterface, DeviceService,
    DeviceSnapshot, DeviceSystem, State,
};
use serde_json::Value;
use std::{
    env, fs,
    io::Read,
    path::Path,
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

static CPU_PREVIOUS: Mutex<Option<(u64, u64)>> = Mutex::new(None);

fn read(path: impl AsRef<Path>) -> Option<String> {
    let mut text = String::new();
    fs::File::open(path).ok()?.take(65_537).read_to_string(&mut text).ok()?;
    if text.len() > 65_536 { return None; }
    Some(text.trim_matches(|c: char| c == '\0' || c.is_whitespace()).to_owned())
}
fn setting(name: &str) -> Option<String> {
    env::var(name).ok().filter(|s| !s.trim().is_empty() && s.chars().count() <= 128)
        .map(|s| s.trim().to_owned())
}
fn machine_fingerprint(text: &str) -> String {
    // A stable display identifier, not an authentication secret or signature.
    let hash = text.bytes().fold(0xcbf29ce484222325u64, |h, b| (h ^ u64::from(b)).wrapping_mul(0x100000001b3));
    format!("host-{hash:016x}")
}
fn identity() -> DeviceIdentity {
    let hostname = read("/proc/sys/kernel/hostname").or_else(|| setting("COMPUTERNAME")).or_else(|| setting("HOSTNAME"));
    let (id, id_source) = if let Some(id) = setting("HATCHERY_DEVICE_ID") {
        (Some(id), "configured")
    } else if let Some(machine) = read("/etc/machine-id").filter(|s| s.len() == 32 && s.chars().all(|c| c.is_ascii_hexdigit())) {
        (Some(machine_fingerprint(&machine)), "machine-id-derived")
    } else { (None, "unavailable") };
    let os = read("/etc/os-release").and_then(|text| text.lines().find_map(|line| line.strip_prefix("PRETTY_NAME=").map(|v| v.trim_matches('"').to_owned())))
        .unwrap_or_else(|| env::consts::OS.into());
    DeviceIdentity {
        id, id_source: id_source.into(), name: setting("HATCHERY_DEVICE_NAME").or_else(|| hostname.clone()),
        hostname, os, architecture: env::consts::ARCH.into(), kernel: read("/proc/sys/kernel/osrelease"),
        model: read("/sys/firmware/devicetree/base/model").or_else(|| read("/proc/device-tree/model")),
    }
}
fn cpu_counts(text: &str) -> Option<(u64, u64)> {
    let mut fields = text.lines().next()?.split_whitespace();
    if fields.next()? != "cpu" { return None; }
    // guest / guest_nice are already included in user / nice; do not add twice.
    let values: Vec<u64> = fields.take(8).map(str::parse).collect::<Result<_, _>>().ok()?;
    if values.len() < 4 { return None; }
    let total = values.iter().try_fold(0u64, |sum, value| sum.checked_add(*value))?;
    Some((total, values[3].checked_add(*values.get(4).unwrap_or(&0))?))
}
fn usage(previous: (u64, u64), current: (u64, u64)) -> Option<f64> {
    let total = current.0.checked_sub(previous.0)?;
    let idle = current.1.checked_sub(previous.1)?;
    if total == 0 || idle > total { return None; }
    Some(100.0 * (total - idle) as f64 / total as f64)
}
fn memory(text: &str, key: &str) -> Option<u64> {
    let line = text.lines().find(|line| line.starts_with(key))?;
    let mut words = line.split_whitespace();
    words.next()?;
    let value = words.next()?.parse::<u64>().ok()?;
    if words.next()? != "kB" { return None; }
    value.checked_mul(1024)
}
fn system() -> DeviceSystem {
    let current = read("/proc/stat").and_then(|text| cpu_counts(&text));
    let mut previous = CPU_PREVIOUS.lock().unwrap();
    let cpu_percent = previous.and_then(|old| current.and_then(|now| usage(old, now)));
    *previous = current;
    drop(previous);
    let mem = read("/proc/meminfo");
    let first_number = |path| read(path).and_then(|text| text.split_whitespace().next()?.parse::<f64>().ok()).filter(|v| v.is_finite() && *v >= 0.0);
    DeviceSystem {
        cpu_percent, load_one: first_number("/proc/loadavg"),
        memory_total_bytes: mem.as_deref().and_then(|text| memory(text, "MemTotal:")),
        memory_available_bytes: mem.as_deref().and_then(|text| memory(text, "MemAvailable:")),
        uptime_seconds: first_number("/proc/uptime"),
        hottest_zone_celsius: crate::soc::hottest_zone_c().filter(|v| v.is_finite() && *v > 0.0 && *v <= 150.0),
    }
}
fn ip_addresses() -> Option<Value> {
    // iproute2 is already part of Armbian networking. Missing tools stay unknown.
    let mut child = Command::new("ip").args(["-j", "address", "show"]).stdin(Stdio::null())
        .stdout(Stdio::piped()).stderr(Stdio::null()).spawn().ok()?;
    let deadline = Instant::now() + Duration::from_millis(600);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(10)),
            _ => { let _ = child.kill(); let _ = child.wait(); return None; }
        }
    };
    if !status.success() { return None; }
    let mut output = String::new();
    child.stdout.take()?.take(65_537).read_to_string(&mut output).ok()?;
    if output.len() > 65_536 { return None; }
    serde_json::from_str(&output).ok()
}
fn interfaces() -> Option<Vec<DeviceInterface>> {
    let root = Path::new("/sys/class/net");
    let entries = fs::read_dir(root).ok()?;
    let addresses = ip_addresses();
    let mut result = Vec::new();
    for entry in entries.flatten().take(64) {
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = entry.path();
        let kind = if path.join("wireless").exists() || path.join("phy80211").exists() { "wifi" }
            else if name == "lo" { "loopback" }
            else if name.starts_with("usb") || name.starts_with("rndis") || path.join("device").canonicalize().is_ok_and(|p| p.to_string_lossy().contains("/usb")) { "usb-network" }
            else { "network" };
        let ips = addresses.as_ref().and_then(Value::as_array).and_then(|rows| rows.iter().find(|row| row["ifname"].as_str() == Some(&name)))
            .and_then(|row| row["addr_info"].as_array()).map(|rows| rows.iter().filter_map(|row| {
                let local = row["local"].as_str()?;
                let prefix = row["prefixlen"].as_u64()?;
                Some(format!("{local}/{prefix}"))
            }).take(16).collect());
        result.push(DeviceInterface { name, kind: kind.into(), state: read(path.join("operstate")).unwrap_or_else(|| "unknown".into()),
            carrier: read(path.join("carrier")).and_then(|s| match s.as_str() { "1" => Some(true), "0" => Some(false), _ => None }), addresses: ips });
    }
    result.sort_by(|a, b| a.name.cmp(&b.name)); Some(result)
}
fn bluetooth() -> Option<Vec<DeviceBluetooth>> {
    if !cfg!(target_os = "linux") { return None; }
    let mut result = Vec::new();
    let entries = match fs::read_dir("/sys/class/bluetooth") { Ok(entries) => entries, Err(_) => return Some(result) };
    for entry in entries.flatten().take(16) {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with("hci") || !name[3..].chars().all(|c| c.is_ascii_digit()) { continue; }
        let blocked = fs::read_dir(entry.path()).ok().and_then(|entries| entries.flatten().find_map(|e| {
            if !e.file_name().to_string_lossy().starts_with("rfkill") { return None; }
            match (read(e.path().join("soft")), read(e.path().join("hard"))) {
                (Some(soft), Some(hard)) if ["0", "1"].contains(&soft.as_str()) && ["0", "1"].contains(&hard.as_str()) => Some(soft == "1" || hard == "1"), _ => None,
            }
        }));
        result.push(DeviceBluetooth { name, address: read(entry.path().join("address")), blocked });
    }
    Some(result)
}
pub fn snapshot(state: &State) -> DeviceSnapshot {
    DeviceSnapshot {
        protocol_version: DEVICE_VERSION.into(), source: "host-system".into(), generated_unix_ms: crate::unix_ms(),
        identity: identity(), system: system(), interfaces: interfaces(), bluetooth: bluetooth(),
        services: Some(crate::services::snapshot()),
        service: DeviceService { name: "robotd-maintenance".into(), version: env!("CARGO_PKG_VERSION").into(),
            servo_source: state.source.clone(), servo_connection: state.connection.clone(), servo_fake: state.fake,
            serial_port: state.port.clone(), baud: state.baud, control_enabled: state.control_enabled, bus_owner: state.bus_owner.clone() },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cpu_excludes_guest_and_rejects_reset_or_empty_intervals() {
        assert_eq!(cpu_counts("cpu 10 2 3 30 4 2 1 0 99 88\n"), Some((52, 34)));
        assert_eq!(usage((100, 40), (200, 60)), Some(80.0));
        assert_eq!(usage((100, 40), (90, 50)), None);
        assert_eq!(usage((100, 40), (100, 40)), None);
    }
    #[test]
    fn memory_requires_kernel_units_and_identity_is_deterministic() {
        assert_eq!(memory("MemTotal: 2048 kB\n", "MemTotal:"), Some(2_097_152));
        assert_eq!(memory("MemTotal: 2048 MB\n", "MemTotal:"), None);
        assert_eq!(machine_fingerprint("a"), machine_fingerprint("a"));
        assert_ne!(machine_fingerprint("a"), machine_fingerprint("b"));
    }
}
