//! Read-only daemon observation. No start/stop, elevation, sockets or bus IO.
use duck_ipc_proto::{UnitState, maintenance::DeviceDaemon};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::Path,
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

const DAEMONS: &[&str] = &["robotd", "mediad", "configd", "btd", "padd", "updaterd"];
const MAINTENANCE: &[&str] = &["robotd-maintenance", "mediad-maintenance"];
static CACHE: Mutex<Option<(Instant, Vec<DeviceDaemon>)>> = Mutex::new(None);

fn empty() -> Vec<DeviceDaemon> {
    DAEMONS
        .iter()
        .chain(MAINTENANCE)
        .map(|name| DeviceDaemon {
            name: (*name).into(),
            unit: DAEMONS.contains(name).then(|| format!("{name}.service")),
            state: UnitState::Unknown,
            sub_state: None,
            main_pid: None,
            process_pid: None,
        })
        .collect()
}

fn unit_state(load: &str, active: &str, sub: &str) -> UnitState {
    // A query failure is unknown, never proof that a unit is absent.
    if load == "not-found" {
        return UnitState::Absent;
    }
    if load != "loaded" {
        return UnitState::Unknown;
    }
    match (active, sub) {
        ("activating", _) | (_, "auto-restart") => UnitState::Restarting,
        ("active", _) => UnitState::Active,
        ("failed", _) => UnitState::Failed,
        ("inactive", _) => UnitState::Inactive,
        _ => UnitState::Unknown,
    }
}

fn apply_units(rows: &mut [DeviceDaemon], output: &str) {
    for block in output.split("\n\n") {
        let fields: BTreeMap<_, _> = block
            .lines()
            .filter_map(|line| line.split_once('='))
            .collect();
        let Some(id) = fields.get("Id") else {
            continue;
        };
        let Some(row) = rows.iter_mut().find(|r| r.unit.as_deref() == Some(*id)) else {
            continue;
        };
        row.state = unit_state(
            fields.get("LoadState").copied().unwrap_or(""),
            fields.get("ActiveState").copied().unwrap_or(""),
            fields.get("SubState").copied().unwrap_or(""),
        );
        row.sub_state = fields
            .get("SubState")
            .filter(|s| !s.is_empty())
            .map(|s| (*s).into());
        row.main_pid = fields
            .get("MainPID")
            .and_then(|s| s.parse().ok())
            .filter(|pid| *pid > 0);
    }
}

fn systemd() -> Option<String> {
    if !cfg!(target_os = "linux") || !Path::new("/run/systemd/system").is_dir() {
        return None;
    }
    let units: Vec<_> = DAEMONS
        .iter()
        .map(|name| format!("{name}.service"))
        .collect();
    let mut child = Command::new("systemctl")
        .args([
            "show",
            "--no-pager",
            "--no-ask-password",
            "--property=Id,LoadState,ActiveState,SubState,MainPID",
            "--",
        ])
        .args(units)
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    // Six fixed units and five small systemd properties fit in the pipe. Never query
    // descriptions, environments, journals or arbitrary caller-supplied unit names.
    let deadline = Instant::now() + Duration::from_millis(400);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(10)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
    // systemctl may exit nonzero when one requested unit is missing. Its complete
    // named property blocks still report the other units and the not-found result.
    let mut output = String::new();
    child
        .stdout
        .take()?
        .take(8193)
        .read_to_string(&mut output)
        .ok()?;
    (output.len() <= 8192).then_some(output)
}

fn process_name(path: &Path) -> Option<&str> {
    let name = path.file_name()?.to_str()?;
    let name = name.strip_suffix(" (deleted)").unwrap_or(name);
    DAEMONS
        .iter()
        .chain(MAINTENANCE)
        .find(|&&candidate| candidate == name)
        .copied()
}

fn apply_processes(rows: &mut [DeviceDaemon], root: &Path) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    let deadline = Instant::now() + Duration::from_millis(100);
    for entry in entries.take(4096).flatten() {
        if Instant::now() >= deadline {
            break;
        }
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|s| s.parse::<u32>().ok())
            .filter(|p| *p > 0)
        else {
            continue;
        };
        // Exact executable name; do not inspect command-line arguments or count a
        // script, a build process, or robotd-maintenance as the runtime robotd.
        let Ok(exe) = fs::read_link(entry.path().join("exe")) else {
            continue;
        };
        let Some(name) = process_name(&exe) else {
            continue;
        };
        if let Some(row) = rows.iter_mut().find(|row| row.name == name) {
            row.process_pid = Some(row.process_pid.map_or(pid, |old| old.min(pid)));
        }
    }
}

pub fn snapshot() -> Vec<DeviceDaemon> {
    let mut cache = CACHE.lock().unwrap();
    if let Some((_, rows)) = cache
        .as_ref()
        .filter(|(at, _)| at.elapsed() < Duration::from_secs(1))
    {
        return rows.clone();
    }
    let mut rows = empty();
    if let Some(output) = systemd() {
        apply_units(&mut rows, &output);
    }
    if cfg!(target_os = "linux") {
        apply_processes(&mut rows, Path::new("/proc"));
    }
    // This executable can prove only its own presence on all supported platforms.
    rows.iter_mut()
        .find(|row| row.name == "robotd-maintenance")
        .unwrap()
        .process_pid = Some(std::process::id());
    *cache = Some((Instant::now(), rows.clone()));
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn systemd_distinguishes_crash_loop_failure_stopped_missing_and_unknown() {
        assert_eq!(unit_state("loaded", "active", "running"), UnitState::Active);
        assert_eq!(
            unit_state("loaded", "activating", "auto-restart"),
            UnitState::Restarting
        );
        assert_eq!(unit_state("loaded", "failed", "failed"), UnitState::Failed);
        assert_eq!(
            unit_state("loaded", "inactive", "dead"),
            UnitState::Inactive
        );
        assert_eq!(
            unit_state("not-found", "inactive", "dead"),
            UnitState::Absent
        );
        assert_eq!(unit_state("", "", ""), UnitState::Unknown);
        assert_eq!(unit_state("error", "active", "running"), UnitState::Unknown);
    }

    #[test]
    fn property_blocks_are_matched_by_id_and_preserve_unknown_rows() {
        let mut rows = empty();
        apply_units(
            &mut rows,
            "Id=mediad.service\nLoadState=loaded\nActiveState=activating\nSubState=auto-restart\nMainPID=0\n\nId=robotd.service\nLoadState=loaded\nActiveState=active\nSubState=running\nMainPID=42\n\nId=unrelated.service\nLoadState=loaded\nActiveState=active\n",
        );
        assert_eq!(rows[0].state, UnitState::Active);
        assert_eq!(rows[0].main_pid, Some(42));
        assert_eq!(rows[1].state, UnitState::Restarting);
        assert_eq!(rows[1].main_pid, None);
        assert_eq!(rows[2].state, UnitState::Unknown);
        assert_eq!(rows.len(), 8);
    }

    #[test]
    fn executable_matching_does_not_mix_maintenance_with_runtime() {
        assert_eq!(
            process_name(Path::new("/opt/hatchery/robotd-maintenance")),
            Some("robotd-maintenance")
        );
        assert_eq!(
            process_name(Path::new("/opt/hatchery/mediad (deleted)")),
            Some("mediad")
        );
        assert_eq!(process_name(Path::new("/usr/bin/python3")), None);
        assert_eq!(process_name(Path::new("/opt/hatchery/robotd-backup")), None);
    }

    #[cfg(unix)]
    #[test]
    fn process_observation_works_without_systemd_and_ignores_arguments() {
        // Use the actual observer against a private /proc-shaped fixture; no daemon
        // is launched. Symlinks point at strings and need no executable targets.
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let root =
                std::env::temp_dir().join(format!("hatchery-services-{}", std::process::id()));
            fs::create_dir_all(root.join("123")).unwrap();
            symlink("/opt/hatchery/mediad", root.join("123/exe")).unwrap();
            let mut rows = empty();
            apply_processes(&mut rows, &root);
            assert_eq!(rows[1].process_pid, Some(123));
            assert_eq!(rows[1].state, UnitState::Unknown);
            assert_eq!(rows[0].process_pid, None);
            fs::remove_file(root.join("123/exe")).unwrap();
            fs::remove_dir(root.join("123")).unwrap();
            fs::remove_dir(root).unwrap();
        }
    }
}
