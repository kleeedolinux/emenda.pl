//! wasm32 glue for the remote MCP server (`POST /mcp`, stateless Streamable HTTP).
use crate::api::{self, registry};
use crate::glue_api::{allowed, cors, ip_of, serve, too_many};
use crate::mcp::{self, Action};
use serde_json::Value;
use worker::*;

const JSON: &str = "application/json; charset=utf-8";

fn json_resp(status: u16, v: &Value) -> Result<Response> {
    let mut r = Response::from_bytes(v.to_string().into_bytes())?.with_status(status);
    r.headers_mut().set("Content-Type", JSON)?;
    r.headers_mut().set("Cache-Control", "no-store")?;
    cors(r)
}

pub async fn handle(req: &Request, env: &Env, url: &Url, host: &str) -> Result<Response> {
    let method = req.method();
    if method == Method::Options {
        return cors(Response::empty()?.with_status(204));
    }
    if method != Method::Post {
        // No server-initiated SSE stream; no sessions to delete.
        let mut r = json_resp(
            405,
            &api::error_body(405, "use POST (MCP Streamable HTTP, sem SSE)"),
        )?;
        r.headers_mut().set("Allow", "POST, OPTIONS")?;
        return Ok(r);
    }
    let ip = ip_of(req);
    if !allowed(env, api::LIMIT_ALL.0, &ip).await {
        return too_many(api::LIMIT_ALL, false);
    }
    let body = req.clone()?.bytes().await.unwrap_or_default();
    if body.len() > mcp::MAX_BODY {
        return json_resp(
            413,
            &mcp::rpc_error(Value::Null, -32600, "requisição grande demais"),
        );
    }
    let msg: Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => return json_resp(400, &mcp::rpc_error(Value::Null, -32700, "Parse error")),
    };
    let origin = format!("{}://{host}", url.scheme());
    let batch = msg.is_array();
    let msgs: Vec<Value> = match msg {
        Value::Array(a) if a.is_empty() => {
            return json_resp(400, &mcp::rpc_error(Value::Null, -32600, "Invalid Request"))
        }
        Value::Array(a) => a.into_iter().take(20).collect(),
        m => vec![m],
    };
    let mut out = Vec::new();
    for m in &msgs {
        match mcp::handle(m) {
            Action::Reply(v) => out.push(v),
            Action::None => {}
            Action::Call { id, url: u } => out.push(call(env, &origin, &ip, id, &u).await),
        }
    }
    if out.is_empty() {
        return cors(Response::empty()?.with_status(202));
    }
    let v = if batch {
        Value::Array(out)
    } else {
        out.remove(0)
    };
    json_resp(200, &v)
}

async fn call(env: &Env, origin: &str, ip: &str, id: Value, u: &str) -> Value {
    let (path, q) = u.split_once('?').map_or((u, None), |(p, q)| (p, Some(q)));
    let ep = match registry::resolve(path.strip_prefix("/v1").unwrap_or(path), q) {
        Ok(ep) => ep,
        Err(e) => return mcp::call_result(id, u, Err((e.status(), e.message()))),
    };
    let s = serve(env, origin, &ep, ip).await;
    let parsed: Option<Value> = serde_json::from_slice(&s.bytes).ok();
    let out = match (s.status, parsed) {
        (200, Some(v)) => Ok(v),
        (st, Some(v)) => Err((st, v["error"].as_str().unwrap_or("erro").to_string())),
        (st, None) => Err((st, "resposta inválida".to_string())),
    };
    mcp::call_result(id, u, out)
}
