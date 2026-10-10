//! Loopback static/read-only gateway subset. No camera, WebRTC or bus access.
use duck_ipc_proto::MAX_FRAME;
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
fn rpc(address: SocketAddr, token: &str, method: &str) -> Result<Value, String> {
    let mut stream =
        TcpStream::connect_timeout(&address, Duration::from_secs(1)).map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;
    let mut request =
        serde_json::to_vec(&json!({"jsonrpc":"2.0","id":1,"token":token,"method":method})).unwrap();
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
    println!("mediad read-only gateway: http://{http}/#console/servos/maintenance");
    for request in server.incoming_requests() {
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
        if request.method() != &Method::Get {
            send(
                request,
                405,
                b"Read-only gateway".to_vec(),
                "text/plain",
                None,
            );
            continue;
        }
        let url = request.url().split('?').next().unwrap_or("").to_owned();
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
            let method = match url.as_str() {
                "/api/v1/maintenance/state" => "maintenance.state",
                "/api/v1/maintenance/ports" => "maintenance.ports",
                _ => {
                    send(
                        request,
                        404,
                        b"Unknown read-only endpoint".to_vec(),
                        "text/plain",
                        None,
                    );
                    continue;
                }
            };
            let (status, result) = match rpc(rpc_address, &rpc_token, method) {
                Ok(v) => (200, v),
                Err(e) => (
                    503,
                    json!({"error":"robotd_unavailable","message":e,"read_only":true}),
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
                    data=html.replacen("<head>","<head><script>window.HATCHERY_BACKEND={apiBase:'/api/v1/maintenance',readOnly:true};</script>",1).into_bytes();
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
            .join("../../..")
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
