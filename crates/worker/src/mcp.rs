//! Remote MCP server (Streamable HTTP, stateless, JSON-RPC 2.0). Pure message handling:
//! tools map to `/v1` URLs through a route template (`rota`) shared with WebMCP in the
//! browser (apps/web/src/features/webmcp/rota.ts implements the same rule).
use serde_json::{json, Map, Value};

pub const PROTOCOL: &str = "2025-06-18";
pub const SUPPORTED: &[&str] = &["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
pub const META_KEY: &str = "online.emenda/rota";
/// Arrays in tool results are cut to this many items.
pub const MAX_ITEMS: usize = 50;
pub const MAX_BODY: usize = 64 * 1024;

pub struct Rota {
    pub path: &'static str,
    pub omit: &'static [(&'static str, &'static str)],
    pub map: &'static [(&'static str, &'static [(&'static str, &'static str)])],
    pub query: &'static [&'static str],
}

/// (name, JSON type, description, enum)
pub type Arg = (
    &'static str,
    &'static str,
    &'static str,
    &'static [&'static str],
);

pub struct Tool {
    pub name: &'static str,
    pub title: &'static str,
    pub desc: &'static str,
    pub args: &'static [Arg],
    pub required: &'static [&'static str],
    pub rota: Rota,
}

const LIM: Arg = ("limit", "integer", "Máximo de itens", &[]);
const OFF: Arg = ("offset", "integer", "Deslocamento", &[]);
const ANO: Arg = ("ano", "integer", "Ano", &[]);
const TIPO: Arg = (
    "tipo",
    "string",
    "Tipo de emenda",
    &[
        "individual",
        "bancada",
        "comissao",
        "relator",
        "pix",
        "outra",
    ],
);
const UF: Arg = ("uf", "string", "Sigla da UF", &[]);
const DE: Arg = ("de", "string", "Data inicial AAAA-MM-DD", &[]);
const ATE: Arg = ("ate", "string", "Data final AAAA-MM-DD", &[]);
const CASA: Arg = ("casa", "string", "Casa legislativa", &["camara", "senado"]);

pub static TOOLS: &[Tool] = &[
    Tool { name: "buscar", title: "Busca unificada", desc: "Busca autores de emendas, deputados, senadores, municípios, UFs, partidos, federações e proposições (ex.: \"PL 2630/2020\").",
        args: &[("q", "string", "Texto (2 a 64 caracteres)", &[]), ("limit", "integer", "Máximo por grupo (1-50)", &[])], required: &["q"],
        rota: Rota { path: "/v1/busca", omit: &[], map: &[], query: &["q", "limit"] } },
    Tool { name: "emendas", title: "Buscar emendas", desc: "Lista emendas parlamentares de um autor (código) e/ou município (IBGE), ou Pix de um ano (tipo=pix e ano).",
        args: &[("autor", "string", "Código do autor", &[]), ("municipio", "string", "Código IBGE (7 dígitos)", &[]), UF, TIPO, ANO, ("q", "string", "Texto em função/programa/ação", &[]), LIM, OFF], required: &[],
        rota: Rota { path: "/v1/emendas", omit: &[], map: &[], query: &["autor", "municipio", "uf", "tipo", "ano", "q", "limit", "offset"] } },
    Tool { name: "municipio", title: "Município", desc: "Emendas recebidas por um município (código IBGE): resumo, emendas, favorecidos, convênios ou prefeito.",
        args: &[("ibge", "string", "Código IBGE (7 dígitos)", &[]), ("secao", "string", "Seção", &["resumo", "emendas", "favorecidos", "convenios", "prefeito"]), ANO, TIPO, LIM, OFF], required: &["ibge"],
        rota: Rota { path: "/v1/municipios/{ibge}/{secao}", omit: &[("secao", "resumo")], map: &[], query: &["ano", "tipo", "limit", "offset"] } },
    Tool { name: "autor_emendas", title: "Emendas de um autor", desc: "Emendas indicadas por um autor (código do Portal da Transparência; use buscar para achar o código).",
        args: &[("codigo", "string", "Código do autor", &[]), ANO, TIPO, UF, LIM, OFF], required: &["codigo"],
        rota: Rota { path: "/v1/autores/{codigo}/emendas", omit: &[], map: &[], query: &["ano", "tipo", "uf", "limit", "offset"] } },
    Tool { name: "emendas_pix", title: "Emendas Pix", desc: "Emendas Pix (transferências especiais): resumo geral ou todas as de um ano.",
        args: &[ANO], required: &[], rota: Rota { path: "/v1/pix/{ano}", omit: &[], map: &[], query: &[] } },
    Tool { name: "ultimas_emendas", title: "Últimos pagamentos", desc: "Últimos pagamentos de emendas, ou os de um mês (AAAAMM).",
        args: &[("mes", "string", "Mês AAAAMM", &[])], required: &[], rota: Rota { path: "/v1/feed/{mes}", omit: &[], map: &[], query: &[] } },
    Tool { name: "deputado", title: "Deputado federal", desc: "Deputado (id da Câmara): perfil, mandatos, proposições, votos, despesas, frentes, órgãos, emendas ou gastos. Sem id: lista (filtros uf, partido).",
        args: &[("id", "integer", "Id na Câmara", &[]), ("secao", "string", "Seção", &["perfil", "mandatos", "proposicoes", "votos", "despesas", "frentes", "orgaos", "emendas", "gastos"]),
                UF, ("partido", "string", "Sigla do partido", &[]), ANO, DE, ATE, LIM, OFF], required: &[],
        rota: Rota { path: "/v1/deputados/{id}/{secao}", omit: &[("secao", "perfil")], map: &[], query: &["uf", "partido", "ano", "de", "ate", "limit", "offset"] } },
    Tool { name: "senador", title: "Senador", desc: "Senador (código do Senado): perfil, mandatos, comissões, proposições, votos, emendas ou gastos. Sem código: lista.",
        args: &[("codigo", "string", "Código no Senado", &[]), ("secao", "string", "Seção", &["perfil", "mandatos", "comissoes", "proposicoes", "votos", "emendas", "gastos"]),
                UF, ("partido", "string", "Sigla do partido", &[]), ANO, DE, ATE, LIM, OFF], required: &[],
        rota: Rota { path: "/v1/senadores/{codigo}/{secao}", omit: &[("secao", "perfil")], map: &[], query: &["uf", "partido", "ano", "de", "ate", "limit", "offset"] } },
    Tool { name: "gastos_parlamentar", title: "Gastos de parlamentar", desc: "Cota parlamentar (CEAP) de um deputado ou senador, por ano e categoria.",
        args: &[CASA, ("id", "string", "Id (Câmara) ou código (Senado)", &[])], required: &["casa", "id"],
        rota: Rota { path: "/v1/gastos/{casa}/{id}", omit: &[], map: &[("casa", &[("camara", "deputados"), ("senado", "senadores")])], query: &[] } },
    Tool { name: "proposicao", title: "Proposição", desc: "Proposição da Câmara (id): detalhe, tramitações, autores, votações ou resultado (virou lei? sanção, veto, presidente).",
        args: &[("id", "integer", "Id na Câmara", &[]), ("secao", "string", "Seção", &["detalhe", "tramitacoes", "autores", "votacoes", "resultado"]), LIM, OFF], required: &["id"],
        rota: Rota { path: "/v1/proposicoes/{id}/{secao}", omit: &[("secao", "detalhe")], map: &[], query: &["limit", "offset"] } },
    Tool { name: "votacao", title: "Votação", desc: "Votação da Câmara (id \"123-45\"): placar, por partido e UF, orientações e votos. Sem id: votações recentes do plenário.",
        args: &[("id", "string", "Id da votação", &[]), DE, ATE, ("nominais", "boolean", "Só nominais", &[]), LIM, OFF], required: &[],
        rota: Rota { path: "/v1/votacoes/{id}", omit: &[], map: &[], query: &["de", "ate", "nominais", "limit", "offset"] } },
    Tool { name: "agenda", title: "Agenda do Congresso", desc: "Sessões e reuniões da Câmara e do Senado (padrão: próximos 7 dias).",
        args: &[DE, ATE, CASA, LIM], required: &[], rota: Rota { path: "/v1/agenda", omit: &[], map: &[], query: &["de", "ate", "casa", "limit"] } },
    Tool { name: "comissao", title: "Comissões", desc: "Lista de comissões (Câmara ou Senado) ou membros de uma comissão (id + casa).",
        args: &[("id", "integer", "Id/código da comissão", &[]), CASA, ("q", "string", "Nome ou sigla", &[]), LIM], required: &[],
        rota: Rota { path: "/v1/comissoes/{id}/membros", omit: &[], map: &[], query: &["casa", "q", "limit"] } },
    Tool { name: "frente", title: "Frentes parlamentares", desc: "Lista de frentes (busca q), detalhe ou membros de uma frente.",
        args: &[("id", "integer", "Id da frente", &[]), ("secao", "string", "Seção", &["detalhe", "membros"]), ("q", "string", "Título", &[]), UF, LIM], required: &[],
        rota: Rota { path: "/v1/frentes/{id}/{secao}", omit: &[("secao", "detalhe")], map: &[], query: &["q", "uf", "limit"] } },
    Tool { name: "partido", title: "Partidos", desc: "Lista de partidos ou um partido (sigla): líder, deputados, senadores e federação.",
        args: &[("sigla", "string", "Sigla", &[])], required: &[], rota: Rota { path: "/v1/partidos/{sigla}", omit: &[], map: &[], query: &[] } },
];

fn rota_json(r: &Rota) -> Value {
    let omit: Map<String, Value> = r
        .omit
        .iter()
        .map(|(k, v)| (k.to_string(), json!(v)))
        .collect();
    let map: Map<String, Value> = r
        .map
        .iter()
        .map(|(k, m)| {
            (
                k.to_string(),
                Value::Object(m.iter().map(|(a, b)| (a.to_string(), json!(b))).collect()),
            )
        })
        .collect();
    json!({ "path": r.path, "omit": omit, "map": map, "query": r.query })
}

pub fn tool_json(t: &Tool) -> Value {
    let props: Map<String, Value> = t
        .args
        .iter()
        .map(|(n, ty, d, e)| {
            let mut p = json!({ "type": ty, "description": d });
            if !e.is_empty() {
                p["enum"] = json!(e);
            }
            (n.to_string(), p)
        })
        .collect();
    json!({
        "name": t.name, "title": t.title, "description": t.desc,
        "inputSchema": { "type": "object", "properties": props, "required": t.required, "additionalProperties": false },
        "annotations": { "readOnlyHint": true, "openWorldHint": true },
        "_meta": { META_KEY: rota_json(&t.rota) },
    })
}

pub fn tools() -> Vec<Value> {
    TOOLS.iter().map(tool_json).collect()
}

/// `encodeURIComponent`.
pub fn enc_component(s: &str) -> String {
    let mut o = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            o.push(b as char);
        } else {
            o.push_str(&format!("%{b:02X}"));
        }
    }
    o
}

fn arg_str(v: Option<&Value>) -> Option<String> {
    match v? {
        Value::Null => None,
        Value::String(s) if s.is_empty() => None,
        Value::String(s) => Some(s.clone()),
        x => Some(x.to_string()),
    }
}

/// Route rule (same as WebMCP `rotaUrl`): a `{name}` segment that is missing/empty or equal
/// to `omit[name]` drops itself and every following segment; values go through `map`.
pub fn rota_url(r: &Rota, args: &Map<String, Value>) -> String {
    let mut path = String::new();
    for seg in r.path.split('/').filter(|s| !s.is_empty()) {
        match seg.strip_prefix('{').and_then(|s| s.strip_suffix('}')) {
            Some(n) => {
                let Some(v) = arg_str(args.get(n)) else { break };
                if r.omit.iter().any(|(k, o)| *k == n && *o == v) {
                    break;
                }
                let v = r
                    .map
                    .iter()
                    .find(|(k, _)| *k == n)
                    .and_then(|(_, m)| m.iter().find(|(a, _)| *a == v))
                    .map_or(v.clone(), |(_, b)| b.to_string());
                path.push('/');
                path.push_str(&enc_component(&v));
            }
            None => {
                path.push('/');
                path.push_str(seg);
            }
        }
    }
    let q: Vec<String> = r
        .query
        .iter()
        .filter_map(|k| {
            arg_str(args.get(*k)).map(|v| format!("{}={}", enc_component(k), enc_component(&v)))
        })
        .collect();
    if q.is_empty() {
        path
    } else {
        format!("{path}?{}", q.join("&"))
    }
}

#[derive(Debug, PartialEq)]
pub enum Action {
    /// JSON-RPC response to send.
    Reply(Value),
    /// Run the `/v1` URL and answer with `call_result`.
    Call { id: Value, url: String },
    /// Notification or response from the client: nothing to send.
    None,
}

pub fn rpc_error(id: Value, code: i64, msg: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": msg } })
}
fn ok(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn check_args(t: &Tool, args: &Map<String, Value>) -> Result<(), String> {
    for r in t.required {
        if arg_str(args.get(*r)).is_none() {
            return Err(format!("argumento obrigatório: {r}"));
        }
    }
    for (k, v) in args {
        let Some((_, ty, _, e)) = t.args.iter().find(|a| a.0 == k) else {
            return Err(format!("argumento desconhecido: {k}"));
        };
        let good = match (*ty, v) {
            (_, Value::Null) => true,
            ("integer", Value::Number(n)) => n.is_i64() || n.is_u64(),
            ("integer", Value::String(s)) => s.bytes().all(|b| b.is_ascii_digit()),
            ("boolean", Value::Bool(_)) => true,
            ("string", Value::String(s)) => e.is_empty() || e.contains(&s.as_str()),
            ("string", Value::Number(_)) => e.is_empty(),
            _ => false,
        };
        if !good {
            return Err(format!("argumento inválido: {k}"));
        }
    }
    Ok(())
}

pub fn handle(msg: &Value) -> Action {
    let Some(obj) = msg.as_object() else {
        return Action::Reply(rpc_error(Value::Null, -32600, "Invalid Request"));
    };
    let id = obj.get("id").cloned();
    let Some(method) = obj.get("method").and_then(Value::as_str) else {
        // A response from the client (or garbage without id): nothing to answer.
        return match id {
            Some(_) if obj.contains_key("result") || obj.contains_key("error") => Action::None,
            Some(i) => Action::Reply(rpc_error(i, -32600, "Invalid Request")),
            None => Action::Reply(rpc_error(Value::Null, -32600, "Invalid Request")),
        };
    };
    if obj.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        return Action::Reply(rpc_error(
            id.unwrap_or(Value::Null),
            -32600,
            "Invalid Request",
        ));
    }
    let Some(id) = id else {
        return Action::None; // notification
    };
    let params = obj.get("params").cloned().unwrap_or(json!({}));
    match method {
        "initialize" => {
            let want = params["protocolVersion"].as_str().unwrap_or(PROTOCOL);
            let v = if SUPPORTED.contains(&want) {
                want
            } else {
                PROTOCOL
            };
            Action::Reply(ok(
                id,
                json!({
                    "protocolVersion": v,
                    "capabilities": { "tools": { "listChanged": false } },
                    "serverInfo": { "name": "emenda.online", "title": "emenda.online — dados públicos do Congresso", "version": crate::VERSION },
                    "instructions": "Dados públicos sobre emendas parlamentares (Portal da Transparência), Câmara e Senado. Valores em centavos. Use buscar para achar códigos (autor, IBGE, deputado, senador). Cite emenda.online e as fontes em meta.fonte.",
                }),
            ))
        }
        "ping" => Action::Reply(ok(id, json!({}))),
        "tools/list" => Action::Reply(ok(id, json!({ "tools": tools() }))),
        "tools/call" => {
            let name = params["name"].as_str().unwrap_or_default();
            let Some(t) = TOOLS.iter().find(|t| t.name == name) else {
                return Action::Reply(rpc_error(
                    id,
                    -32602,
                    &format!("ferramenta desconhecida: {name}"),
                ));
            };
            let args = params["arguments"].as_object().cloned().unwrap_or_default();
            if let Err(e) = check_args(t, &args) {
                return Action::Reply(rpc_error(id, -32602, &e));
            }
            Action::Call {
                id,
                url: rota_url(&t.rota, &args),
            }
        }
        "resources/list" => Action::Reply(ok(id, json!({ "resources": [] }))),
        "prompts/list" => Action::Reply(ok(id, json!({ "prompts": [] }))),
        _ => Action::Reply(rpc_error(id, -32601, "Method not found")),
    }
}

/// Cuts arrays longer than `max`; returns whether anything was cut.
pub fn truncate(v: &mut Value, max: usize) -> bool {
    match v {
        Value::Array(a) => {
            let mut cut = a.len() > max;
            a.truncate(max);
            for x in a.iter_mut() {
                cut |= truncate(x, max);
            }
            cut
        }
        Value::Object(m) => m.values_mut().fold(false, |c, x| truncate(x, max) | c),
        _ => false,
    }
}

/// `tools/call` result from the API outcome (envelope JSON or `(status, message)`).
pub fn call_result(id: Value, url: &str, out: Result<Value, (u16, String)>) -> Value {
    match out {
        Ok(mut env) => {
            let cut = truncate(&mut env, MAX_ITEMS);
            let mut text = env.to_string();
            if cut {
                text = format!("[listas cortadas em {MAX_ITEMS} itens; use limit/offset ou a API {url}]\n{text}");
            }
            ok(
                id,
                json!({ "content": [{ "type": "text", "text": text }], "structuredContent": env, "isError": false }),
            )
        }
        Err((status, msg)) => ok(
            id,
            json!({
                "content": [{ "type": "text", "text": format!("Erro {status}: {msg} ({url})") }],
                "isError": true,
            }),
        ),
    }
}
