//! Camera RPC forwarding only; mediad owns the V4L2 device and exposure loop.
use duck_ipc_proto::maintenance::{CAMERA_GET, CAMERA_SET};
use serde_json::Value;

#[cfg(unix)]
pub fn call(method: &str, params: Option<Value>) -> Result<Value, String> {
    use std::{
        env,
        io::{BufRead, BufReader, Read, Write},
        os::unix::net::UnixStream,
        path::PathBuf,
        time::Duration,
    };
    if ![CAMERA_GET, CAMERA_SET].contains(&method) {
        return Err("Unknown camera method".into());
    }
    let socket = env::var_os("HATCHERY_FRAME_SOCKET")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let runtime = env::var_os("DUCK_RUNTIME_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|| {
                    if env::var_os("INVOCATION_ID").is_some() {
                        PathBuf::from("/run/robot")
                    } else {
                        env::var_os("HOME")
                            .map(|home| {
                                PathBuf::from(home).join(".local/state/microduck-hatchery/run")
                            })
                            .unwrap_or_else(|| PathBuf::from("/run/robot"))
                    }
                });
            runtime.join("media-frame.sock")
        });
    let mut stream =
        UnixStream::connect(socket).map_err(|_| "Camera service unavailable".to_owned())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(1)))
        .map_err(|e| e.to_string())?;
    let mut request = serde_json::to_vec(
        &serde_json::json!({"jsonrpc":"2.0","id":1,"method":method,"params":params}),
    )
    .unwrap();
    request.push(b'\n');
    stream.write_all(&request).map_err(|e| e.to_string())?;
    let mut frame = Vec::new();
    BufReader::new(stream.take(32_769))
        .read_until(b'\n', &mut frame)
        .map_err(|e| e.to_string())?;
    if frame.len() > 32_768 || !frame.ends_with(b"\n") {
        return Err("Invalid camera reply".into());
    }
    let reply: Value = serde_json::from_slice(&frame).map_err(|e| e.to_string())?;
    if reply["jsonrpc"] != "2.0" || reply["id"] != 1 {
        return Err("Invalid camera RPC".into());
    }
    if let Some(error) = reply.get("error") {
        return Err(error["message"]
            .as_str()
            .unwrap_or("Camera command rejected")
            .into());
    }
    let state = reply.get("result").ok_or("Camera state missing")?;
    serde_json::from_value::<duck_ipc_proto::maintenance::CameraState>(state.clone())
        .map_err(|_| "Invalid camera state".to_owned())?;
    Ok(state.clone())
}

#[cfg(not(unix))]
pub fn call(method: &str, _: Option<Value>) -> Result<Value, String> {
    let _ = (method, CAMERA_GET, CAMERA_SET);
    Err("Camera controls require the Radxa media service".into())
}
