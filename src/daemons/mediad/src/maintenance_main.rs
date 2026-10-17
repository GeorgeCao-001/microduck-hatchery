//! Loopback gateway subset. Commands are forwarded; no bus access here.
mod camera_gateway;
mod config_gateway;
use duck_ipc_proto::maintenance::MAX_FRAME;
use serde_json::{Value, json};
use std::{
    env, fs,
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    time::Duration,
};
use tiny_http::{Header, Method, Request, Response, Server};

fn header(request: &Request, name: &'static str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|h| h.field.equiv(name))
        .map(|h| h.value.as_str().to_owned())
}
fn rpc(
    address: SocketAddr,
    token: &str,
    method: &str,
    params: Option<Value>,
) -> Result<Value, String> {
    let mut stream =
        TcpStream::connect_timeout(&address, Duration::from_secs(1)).map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;
    let mut request = serde_json::to_vec(
        &json!({"jsonrpc":"2.0","id":1,"token":token,"method":method,"params":params}),
    )
    .unwrap();
    request.push(b'\n');
    stream.write_all(&request).map_err(|e| e.to_string())?;
    let mut frame = Vec::new();
    BufReader::new(stream.take((MAX_FRAME + 1) as u64))
        .read_until(b'\n', &mut frame)
        .map_err(|e| e.to_string())?;
    if frame.len() > MAX_FRAME || !frame.ends_with(b"\n") {
        return Err("Invalid RPC frame".into());
    }
    let reply: Value = serde_json::from_slice(&frame).map_err(|e| e.to_string())?;
    if reply["jsonrpc"] != "2.0" || reply["id"] != 1 || reply.get("error").is_some() {
        return Err("RPC rejected response".into());
    }
    reply
        .get("result")
        .cloned()
        .ok_or_else(|| "Missing RPC result".into())
}
fn resolve(root: &Path, url: &str) -> Option<PathBuf> {
    let path = url.split('?').next()?;
    if !path.starts_with('/') || path.contains(['%', '\\', '\0']) {
        return None;
    }
    let name = if path == "/" {
        "index.html"
    } else {
        path.strip_prefix('/')?
    };
    if name
        .split('/')
        .any(|p| p == ".." || p == "." || p.is_empty())
    {
        return None;
    }
    let candidate = root.join(name).canonicalize().ok()?;
    if candidate.starts_with(root) && candidate.is_file() {
        Some(candidate)
    } else {
        None
    }
}
fn mime(path: &Path) -> &'static str {
    match path.extension().and_then(|s| s.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}
fn send(request: Request, status: u16, data: Vec<u8>, kind: &str, cookie: Option<String>) {
    let mut response = Response::from_data(data).with_status_code(status);
    for (name, value) in [
        ("Content-Type", kind),
        ("Cache-Control", "no-store"),
        ("X-Content-Type-Options", "nosniff"),
        ("Referrer-Policy", "same-origin"),
        ("Cross-Origin-Resource-Policy", "same-origin"),
    ] {
        response = response.with_header(Header::from_bytes(name, value).unwrap());
    }
    if let Some(cookie) = cookie {
        response = response.with_header(Header::from_bytes("Set-Cookie", cookie).unwrap());
    }
    let _ = request.respond(response);
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.iter().any(|a| a == "--help") {
        println!(
            "mediad --http 127.0.0.1:8088 --rpc 127.0.0.1:8871 --web-root PATH\nLoopback gateway subset. HATCHERY_RPC_TOKEN and HATCHERY_HTTP_TOKEN required."
        );
        return Ok(());
    }
    let value = |name: &str| {
        args.iter()
            .position(|s| s == name)
            .and_then(|i| args.get(i + 1))
            .map(String::as_str)
    };
    if args.len() % 2 != 0
        || args
            .chunks(2)
            .any(|p| !["--http", "--rpc", "--web-root"].contains(&p[0].as_str()))
    {
        return Err("Invalid gateway arguments".into());
    }
    let http: SocketAddr = value("--http").unwrap_or("127.0.0.1:8088").parse()?;
    let rpc_address: SocketAddr = value("--rpc").unwrap_or("127.0.0.1:8871").parse()?;
    if !http.ip().is_loopback() || !rpc_address.ip().is_loopback() {
        return Err("Gateway and RPC must use loopback".into());
    }
    let root = PathBuf::from(value("--web-root").ok_or("--web-root required")?).canonicalize()?;
    if !root.join("index.html").is_file() {
        return Err("web root lacks index.html".into());
    }
    let rpc_token = env::var("HATCHERY_RPC_TOKEN")?;
    let http_token = env::var("HATCHERY_HTTP_TOKEN")?;
    if rpc_token.len() < 32
        || http_token.len() < 32
        || !http_token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid session tokens".into());
    }
    let allowed_hosts = [http.to_string(), format!("localhost:{}", http.port())];
    let server = Server::http(http).map_err(|e| std::io::Error::other(e.to_string()))?;
    println!("mediad maintenance gateway: http://{http}/#console/servos/parameters");
    let connections = config_gateway::Connections::new();
    for mut request in server.incoming_requests() {
        let host = header(&request, "Host").unwrap_or_default();
        if !allowed_hosts.contains(&host)
            || header(&request, "Origin").is_some_and(|o| o != format!("http://{host}"))
        {
            send(
                request,
                403,
                b"Host or Origin rejected".to_vec(),
                "text/plain",
                None,
            );
            continue;
        }
        let url = request.url().split('?').next().unwrap_or("").to_owned();
        let camera = url == "/api/v1/maintenance/camera";
        let network = url == "/api/v1/maintenance/connections";
        let command = (url == "/api/v1/maintenance/command" || camera || network)
            && request.method() == &Method::Post;
        if request.method() != &Method::Get && !command {
            send(
                request,
                405,
                b"Method not allowed".to_vec(),
                "text/plain",
                None,
            );
            continue;
        }
        if url.starts_with("/api/") {
            let authorized = header(&request, "Cookie").is_some_and(|v| {
                v.split(';')
                    .any(|p| p.trim() == format!("hatchery_session={http_token}"))
            });
            if !authorized {
                send(
                    request,
                    401,
                    b"Open the local Web entry first".to_vec(),
                    "text/plain",
                    None,
                );
                continue;
            }
            let params = if command {
                if header(&request, "Origin") != Some(format!("http://{host}"))
                    || header(&request, "X-Hatchery-Command").as_deref() != Some("1")
                    || !header(&request, "Content-Type")
                        .is_some_and(|v| v.starts_with("application/json"))
                    || request.body_length().is_none_or(|n| n > 8192)
                {
                    send(
                        request,
                        403,
                        b"Command origin, content type or size rejected".to_vec(),
                        "text/plain",
                        None,
                    );
                    continue;
                }
                let mut body = Vec::new();
                if request
                    .as_reader()
                    .take(8193)
                    .read_to_end(&mut body)
                    .is_err()
                    || body.len() > 8192
                {
                    send(
                        request,
                        400,
                        b"Invalid command body".to_vec(),
                        "text/plain",
                        None,
                    );
                    continue;
                }
                match serde_json::from_slice::<Value>(&body) {
                    Ok(value) => Some(value),
                    Err(_) => {
                        send(
                            request,
                            400,
                            b"Invalid command JSON".to_vec(),
                            "text/plain",
                            None,
                        );
                        continue;
                    }
                }
            } else {
                None
            };
            let method = match url.as_str() {
                "/api/v1/maintenance/state" => "maintenance.state",
                "/api/v1/maintenance/ports" => "maintenance.ports",
                "/api/v1/maintenance/device" => "maintenance.device",
                "/api/v1/maintenance/command" if command => "maintenance.command",
                "/api/v1/maintenance/connections" => "hatchery.connections",
                "/api/v1/maintenance/camera" => {
                    if command {
                        duck_ipc_proto::maintenance::CAMERA_SET
                    } else {
                        duck_ipc_proto::maintenance::CAMERA_GET
                    }
                }
                _ => {
                    send(
                        request,
                        404,
                        b"Unknown maintenance endpoint".to_vec(),
                        "text/plain",
                        None,
                    );
                    continue;
                }
            };
            let mut reply_error_status = 503;
            let reply = if network {
                if command {
                    match params.and_then(|v| {
                        serde_json::from_value::<duck_ipc_proto::connections::Change>(v).ok()
                    }) {
                        Some(change)
                            if change.command.validate().is_ok()
                                && !change.request_id.is_empty()
                                && change.request_id.len() <= 80 =>
                        {
                            reply_error_status = 409;
                            connections.submit(change)
                        }
                        _ => {
                            reply_error_status = 400;
                            Err("Invalid connection command".into())
                        }
                    }
                } else {
                    Ok(connections.state())
                }
            } else if camera {
                camera_gateway::call(method, params)
            } else {
                rpc(rpc_address, &rpc_token, method, params)
            };
            let (status, result) = match reply {
                Ok(v) => (200, v),
                Err(e) => (
                    reply_error_status,
                    json!({"error":if network {"connection_rejected"} else if camera {"camera_unavailable"} else {"robotd_unavailable"},"message":e,"read_only":true}),
                ),
            };
            send(
                request,
                status,
                serde_json::to_vec(&result).unwrap(),
                "application/json",
                None,
            );
            continue;
        }
        if let Some(path) = resolve(&root, &url) {
            if let Ok(mut data) = fs::read(&path) {
                let mut cookie = None;
                if path == root.join("index.html") {
                    let html = String::from_utf8(data)?;
                    let camera_port = env::var("HATCHERY_CAMERA_HTTP_PORT")
                        .ok()
                        .and_then(|p| p.parse::<u16>().ok())
                        .filter(|p| *p > 0)
                        .unwrap_or(8080);
                    let signalling_port = env::var("HATCHERY_SIGNALLING_PORT")
                        .ok()
                        .and_then(|p| p.parse::<u16>().ok())
                        .filter(|p| *p > 0)
                        .unwrap_or(8443);
                    let bootstrap = format!(
                        "<head><script>window.HATCHERY_BACKEND={{apiBase:'/api/v1/maintenance',readOnly:true,cameraPort:{camera_port},signallingPort:{signalling_port}}};</script>"
                    );
                    data = html.replacen("<head>", &bootstrap, 1).into_bytes();
                    cookie = Some(format!(
                        "hatchery_session={http_token}; HttpOnly; SameSite=Strict; Path=/"
                    ));
                }
                send(request, 200, data, mime(&path), cookie);
                continue;
            }
        }
        send(request, 404, b"Not found".to_vec(), "text/plain", None);
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn static_root_rejects_traversal_encoded_paths_and_external_files() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../..")
            .join("web/prototype")
            .canonicalize()
            .unwrap();
        assert!(resolve(&root, "/").is_some());
        for url in [
            "/../Cargo.toml",
            "/%2e%2e/Cargo.toml",
            "/..\\Cargo.toml",
            "/./index.html",
            "//index.html",
        ] {
            assert!(resolve(&root, url).is_none());
        }
    }
}
