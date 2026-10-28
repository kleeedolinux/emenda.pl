//! Espelho (snapshot) das APIs da Câmara e do Senado. Pure: pedido -> chave(s) no branch `data`
//! (`v1/espelho/...`) e montagem da resposta no formato da API original.
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Casa {
    Camara,
    Senado,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Filtro {
    Igual(&'static str, String),
    Contem(&'static str, String),
    Em(&'static str, Vec<String>),
    Data(&'static str, String, String),
    UriFim(&'static str, String),
    Orgao(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Lista {
    pub chaves: Vec<String>,
    pub filtros: Vec<Filtro>,
    pub ordem: Option<(String, bool)>,
    pub itens: usize,
    pub pagina: usize,
    pub base: String,
    pub self_href: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SenFiltro {
    Identificacao(String),
    Data(String, String),
    Parlamentar(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SenadoPlano {
    Itens {
        chaves: Vec<String>,
        filtros: Vec<SenFiltro>,
    },
    Plenario {
        chave: String,
        desde: String,
    },
    Comissao {
        chaves: Vec<String>,
        desde: String,
        ate: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Plano {
    Arquivo(String),
    Lista(Lista),
    Senado(SenadoPlano),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolucao {
    pub plano: Plano,
    pub sensivel: bool,
}

pub struct Montado {
    pub corpo: Value,
    pub total: Option<usize>,
}

/// Raiz das chaves no branch `data` (relativa a `DATA_BASE_URL`).
pub const RAIZ: &str = "v1/espelho/";
/// Metadados do snapshot (`{gerado, ...}`).
pub const META: &str = "v1/espelho/meta.json";
/// Tipos com índice `indices/proposicoes/tipo/{SIGLA}/{ano}` (Câmara) e `indices/processo/{SIGLA}/{ano}` (Senado).
pub const TIPOS_INDEXADOS: [&str; 7] = ["PL", "PLP", "PEC", "MPV", "PDL", "PLV", "PRC"];
/// Endpoints sensíveis ao tempo usam a API ao vivo se o snapshot tiver mais que isto.
pub const FRESCOR_MS: f64 = 3.0 * 3_600_000.0;
const CAM: &str = "https://dadosabertos.camara.leg.br/api/v2";
/// Períodos de eventos/agendas (arquivos mensais).
const MAX_DIAS: i64 = 400;
const MAX_CHAVES: usize = 24;

// ---------- datas civis ----------

fn dias_de_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Dias desde 1970-01-01 -> "AAAA-MM-DD".
pub fn dia_civil(z: i64) -> String {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

/// "AAAA-MM-DD" ou "AAAAMMDD" -> dias desde a época (data válida).
pub fn dias(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    let (y, m, d) = match b.len() {
        10 if b[4] == b'-' && b[7] == b'-' => (&s[..4], &s[5..7], &s[8..]),
        8 => (&s[..4], &s[4..6], &s[6..]),
        _ => return None,
    };
    let all = |x: &str| !x.is_empty() && x.bytes().all(|c| c.is_ascii_digit());
    if !(all(y) && all(m) && all(d)) {
        return None;
    }
    let (y, m, d): (i64, i64, i64) = (y.parse().ok()?, m.parse().ok()?, d.parse().ok()?);
    if !(1900..=2100).contains(&y) || !(1..=12).contains(&m) || d < 1 {
        return None;
    }
    let n = dias_de_civil(y, m, d);
    (dia_civil(n) == format!("{y:04}-{m:02}-{d:02}")).then_some(n)
}

/// ISO-8601 UTC ("AAAA-MM-DDTHH:MM[:SS][.fff]Z") -> ms.
fn iso_ms(s: &str) -> Option<f64> {
    let d = dias(s.get(..10)?)?;
    let t = s.get(11..)?.trim_end_matches('Z');
    let mut it = t.split(':');
    let h: f64 = it.next()?.parse().ok()?;
    let mi: f64 = it.next()?.parse().ok()?;
    let se: f64 = it.next().map_or(Some(0.0), |x| x.parse().ok())?;
    Some(d as f64 * 86_400_000.0 + (h * 3600.0 + mi * 60.0 + se) * 1000.0)
}

/// Endpoint sensível ao tempo com snapshot velho (ou sem data): tentar a API ao vivo primeiro.
pub fn ao_vivo_primeiro(sensivel: bool, gerado: Option<&str>, agora_ms: f64) -> bool {
    sensivel
        && gerado
            .and_then(iso_ms)
            .is_none_or(|g| agora_ms - g > FRESCOR_MS)
}

// ---------- consulta ----------

fn decodifica(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < b.len() => {
                match std::str::from_utf8(&b[i + 1..i + 3])
                    .ok()
                    .and_then(|h| u8::from_str_radix(h, 16).ok())
                    .ok_or(())
                {
                    Ok(v) => {
                        out.push(v);
                        i += 2;
                    }
                    Err(_) => out.push(b'%'),
                }
            }
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn pares(q: Option<&str>) -> Vec<(String, String)> {
    q.unwrap_or("")
        .split('&')
        .filter(|p| !p.is_empty())
        .map(|p| {
            let (k, v) = p.split_once('=').unwrap_or((p, ""));
            (decodifica(k), decodifica(v))
        })
        .collect()
}

struct Consulta {
    pares: Vec<(String, String)>,
}

impl Consulta {
    fn todos(&self, k: &str) -> Vec<&str> {
        self.pares
            .iter()
            .filter(|(a, _)| a == k)
            .map(|(_, v)| v.as_str())
            .collect()
    }
    /// Valor único (repetido -> Err).
    fn um(&self, k: &str) -> Result<Option<&str>, ()> {
        match self.todos(k).as_slice() {
            [] => Ok(None),
            [v] => Ok(Some(v)),
            _ => Err(()),
        }
    }
    fn so(&self, permitidas: &[&str]) -> bool {
        self.pares
            .iter()
            .all(|(k, _)| permitidas.contains(&k.as_str()))
    }
}

fn digitos(s: &str) -> bool {
    !s.is_empty() && s.len() <= 12 && s.bytes().all(|b| b.is_ascii_digit())
}

fn seguro(s: &str) -> bool {
    !s.is_empty() && s.len() <= 20 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

// ---------- Câmara ----------

#[derive(Clone, Copy)]
enum Modo {
    Igual,
    Contem,
}

struct Spec {
    variantes: &'static [&'static str],
    filtros: &'static [(&'static str, Modo)],
    /// Campos aceitos em `ordenarPor`.
    campos: &'static [&'static str],
    padrao: Option<(&'static str, bool)>,
    itens: usize,
}

const PAGINACAO: [&str; 4] = ["itens", "pagina", "ordem", "ordenarPor"];

/// Paginação + ordenação comuns. None -> não suportado.
/// (itens, pagina, ordem).
type Paginacao = (usize, usize, Option<(String, bool)>);

fn paginar(c: &Consulta, spec: &Spec, extras: &[&str]) -> Option<Paginacao> {
    let ok = c.pares.iter().all(|(k, _)| {
        PAGINACAO.contains(&k.as_str())
            || spec.variantes.contains(&k.as_str())
            || spec.filtros.iter().any(|(f, _)| f == k)
            || extras.contains(&k.as_str())
    });
    if !ok {
        return None;
    }
    let itens = match c.um("itens").ok()? {
        Some(v) => v.parse::<usize>().ok().filter(|n| (1..=1000).contains(n))?,
        None => spec.itens,
    };
    let pagina = match c.um("pagina").ok()? {
        Some(v) => v
            .parse::<usize>()
            .ok()
            .filter(|n| (1..=100_000).contains(n))?,
        None => 1,
    };
    let desc = match c.um("ordem").ok()? {
        Some(o) if o.eq_ignore_ascii_case("ASC") => Some(false),
        Some(o) if o.eq_ignore_ascii_case("DESC") => Some(true),
        Some(_) => return None,
        None => None,
    };
    let ordem = match (c.um("ordenarPor").ok()?, desc) {
        (Some(campo), d) => {
            let campo = *spec.campos.iter().find(|x| **x == campo)?;
            Some((campo.to_string(), d.unwrap_or(false)))
        }
        (None, Some(d)) => {
            let campo = spec
                .padrao
                .map(|p| p.0)
                .or_else(|| spec.campos.first().copied())?;
            Some((campo.to_string(), d))
        }
        (None, None) => spec.padrao.map(|(c, d)| (c.to_string(), d)),
    };
    Some((itens, pagina, ordem))
}

fn hrefs(rest: &str, query: Option<&str>) -> (String, String) {
    let base = format!("{CAM}/{rest}");
    let self_href = match query.filter(|q| !q.is_empty()) {
        Some(q) => format!("{base}?{q}"),
        None => base.clone(),
    };
    let sem: Vec<&str> = query
        .unwrap_or("")
        .split('&')
        .filter(|p| !p.is_empty())
        .filter(|p| {
            let k = p.split_once('=').map_or(*p, |x| x.0);
            k != "pagina" && k != "itens"
        })
        .collect();
    let base = if sem.is_empty() {
        base
    } else {
        format!("{base}?{}", sem.join("&"))
    };
    (base, self_href)
}

fn lista_simples(
    rest: &str,
    query: Option<&str>,
    c: &Consulta,
    chave_base: &str,
    spec: &Spec,
) -> Option<Plano> {
    let (itens, pagina, ordem) = paginar(c, spec, &[])?;
    let mut vars = Vec::new();
    for v in spec.variantes {
        if let Some(x) = c.um(v).ok()? {
            if !seguro(x) {
                return None;
            }
            vars.push(format!("{v}={x}"));
        }
    }
    vars.sort();
    let mut filtros = Vec::new();
    for (f, modo) in spec.filtros {
        if let Some(x) = c.um(f).ok()? {
            filtros.push(match modo {
                Modo::Igual => Filtro::Igual(f, x.to_string()),
                Modo::Contem => Filtro::Contem(f, x.to_string()),
            });
        }
    }
    let chave = if vars.is_empty() {
        format!("camara/{chave_base}.json")
    } else {
        format!("camara/{chave_base}@{}.json", vars.join(","))
    };
    let (base, self_href) = hrefs(rest, query);
    Some(Plano::Lista(Lista {
        chaves: vec![chave],
        filtros,
        ordem,
        itens,
        pagina,
        base,
        self_href,
    }))
}

const SEM_ORDEM: Spec = Spec {
    variantes: &[],
    filtros: &[],
    campos: &[],
    padrao: None,
    itens: 15,
};

fn periodo(c: &Consulta, max: i64) -> Option<(String, String, i64, i64)> {
    let ini = c.um("dataInicio").ok()??;
    let fim = c.um("dataFim").ok()??;
    let (a, b) = (dias(ini)?, dias(fim)?);
    (a <= b && b - a < max).then(|| (dia_civil(a), dia_civil(b), a, b))
}

fn camara(rest: &str, query: Option<&str>, hoje: i64) -> Option<Resolucao> {
    let c = Consulta {
        pares: pares(query),
    };
    let s: Vec<&str> = rest.split('/').collect();
    let arq = |sensivel: bool| {
        c.pares.is_empty().then(|| Resolucao {
            plano: Plano::Arquivo(format!("camara/{rest}.json")),
            sensivel,
        })
    };
    let fixo = |plano: Option<Plano>| {
        plano.map(|plano| Resolucao {
            plano,
            sensivel: false,
        })
    };
    match s.as_slice() {
        ["deputados"] => fixo(lista_simples(
            rest,
            query,
            &c,
            "deputados",
            &Spec {
                variantes: &["idLegislatura", "siglaSexo"],
                filtros: &[
                    ("siglaUf", Modo::Igual),
                    ("siglaPartido", Modo::Igual),
                    ("nome", Modo::Contem),
                ],
                campos: &["nome"],
                padrao: Some(("nome", false)),
                itens: 1000,
            },
        )),
        ["deputados", id] if digitos(id) => arq(false),
        ["deputados", id, "historico" | "frentes" | "profissoes" | "ocupacoes"] if digitos(id) => {
            arq(false)
        }
        ["deputados", id, "orgaos"] if digitos(id) => fixo(lista_simples(
            rest,
            query,
            &c,
            rest,
            &Spec {
                campos: &["dataInicio"],
                padrao: None,
                itens: 100,
                ..SEM_ORDEM
            },
        )),
        ["partidos"] => fixo(lista_simples(
            rest,
            query,
            &c,
            "partidos",
            &Spec {
                variantes: &["idLegislatura"],
                filtros: &[("sigla", Modo::Igual)],
                campos: &["sigla"],
                padrao: None,
                itens: 15,
            },
        )),
        ["partidos", id] if digitos(id) => arq(false),
        ["partidos", id, "membros"] if digitos(id) => {
            fixo(lista_simples(rest, query, &c, rest, &SEM_ORDEM))
        }
        ["legislaturas"] => fixo(lista_simples(rest, query, &c, rest, &SEM_ORDEM)),
        ["referencias", "proposicoes", "siglaTipo" | "codTema"] => arq(false),
        ["frentes"] => fixo(lista_simples(
            rest,
            query,
            &c,
            "frentes",
            &Spec {
                variantes: &["idLegislatura"],
                itens: 100,
                ..SEM_ORDEM
            },
        )),
        ["frentes", id] | ["frentes", id, "membros"] if digitos(id) => arq(false),
        ["orgaos"] => fixo(lista_simples(
            rest,
            query,
            &c,
            "orgaos",
            &Spec {
                variantes: &["codTipoOrgao", "dataInicio"],
                campos: &["sigla"],
                itens: 100,
                ..SEM_ORDEM
            },
        )),
        ["orgaos", id] if digitos(id) => arq(false),
        ["orgaos", id, "membros"] if digitos(id) => {
            fixo(lista_simples(rest, query, &c, rest, &SEM_ORDEM))
        }
        ["eventos", id, "pauta"] if digitos(id) => arq(false),
        ["eventos"] => eventos(rest, query, &c, None, hoje),
        ["orgaos", id, "eventos"] if digitos(id) => eventos(rest, query, &c, Some(id), hoje),
        ["proposicoes"] => fixo(proposicoes(rest, query, &c)),
        ["proposicoes", id] if digitos(id) => arq(false),
        ["proposicoes", id, "autores" | "temas" | "votacoes" | "tramitacoes" | "relacionadas"]
            if digitos(id) =>
        {
            arq(false)
        }
        ["votacoes"] => votacoes(rest, query, &c, hoje),
        ["votacoes", id] | ["votacoes", id, "votos" | "orientacoes"]
            if id.len() <= 24
                && id.bytes().all(|b| b.is_ascii_digit() || b == b'-')
                && !id.is_empty() =>
        {
            arq(false)
        }
        _ => None,
    }
}

fn eventos(
    rest: &str,
    query: Option<&str>,
    c: &Consulta,
    orgao: Option<&str>,
    hoje: i64,
) -> Option<Resolucao> {
    let spec = Spec {
        campos: &["dataHoraInicio"],
        padrao: Some(("dataHoraInicio", false)),
        itens: 15,
        ..SEM_ORDEM
    };
    let (itens, pagina, ordem) = paginar(c, &spec, &["dataInicio", "dataFim"])?;
    let (ini, fim, a, b) = periodo(c, MAX_DIAS)?;
    let chaves = meses(a, b)
        .into_iter()
        .map(|m| format!("camara/eventos/mes/{m}.json"))
        .collect();
    let mut filtros = vec![Filtro::Data("dataHoraInicio", ini, fim)];
    if let Some(o) = orgao {
        filtros.push(Filtro::Orgao(o.to_string()));
    }
    let (base, self_href) = hrefs(rest, query);
    Some(Resolucao {
        plano: Plano::Lista(Lista {
            chaves,
            filtros,
            ordem,
            itens,
            pagina,
            base,
            self_href,
        }),
        sensivel: b >= hoje,
    })
}

fn meses(a: i64, b: i64) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for d in a..=b {
        let m = dia_civil(d)[..7].to_string();
        if out.last() != Some(&m) {
            out.push(m);
        }
    }
    out
}

fn votacoes(rest: &str, query: Option<&str>, c: &Consulta, hoje: i64) -> Option<Resolucao> {
    let spec = Spec {
        campos: &["dataHoraRegistro"],
        padrao: Some(("dataHoraRegistro", true)),
        itens: 100,
        ..SEM_ORDEM
    };
    let (itens, pagina, ordem) = paginar(c, &spec, &["dataInicio", "dataFim", "idOrgao"])?;
    let (ini, fim, a, b) = periodo(c, 367)?;
    let chaves = meses(a, b)
        .into_iter()
        .map(|m| format!("camara/indices/votacoes/{m}.json"))
        .collect();
    let mut filtros = vec![Filtro::Data("data", ini, fim)];
    if let Some(o) = c.um("idOrgao").ok()? {
        if !digitos(o) {
            return None;
        }
        filtros.push(Filtro::UriFim("uriOrgao", format!("/{o}")));
    }
    let (base, self_href) = hrefs(rest, query);
    Some(Resolucao {
        plano: Plano::Lista(Lista {
            chaves,
            filtros,
            ordem,
            itens,
            pagina,
            base,
            self_href,
        }),
        sensivel: b >= hoje,
    })
}

fn lista_csv(vs: &[&str]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for v in vs {
        for x in v.split(',').map(str::trim).filter(|x| !x.is_empty()) {
            if !out.iter().any(|o| o == x) {
                out.push(x.to_string());
            }
        }
    }
    out
}

fn proposicoes(rest: &str, query: Option<&str>, c: &Consulta) -> Option<Plano> {
    let spec = Spec {
        campos: &["id", "ano", "numero", "siglaTipo", "codTipo"],
        padrao: Some(("id", false)),
        itens: 15,
        ..SEM_ORDEM
    };
    let (itens, pagina, ordem) =
        paginar(c, &spec, &["idDeputadoAutor", "ano", "siglaTipo", "numero"])?;
    let anos = lista_csv(&c.todos("ano"));
    if anos.is_empty() || anos.iter().any(|a| a.len() != 4 || !digitos(a)) {
        return None;
    }
    let tipos: Vec<String> = lista_csv(&c.todos("siglaTipo"))
        .into_iter()
        .map(|t| t.to_ascii_uppercase())
        .collect();
    if tipos.iter().any(|t| !seguro(t)) {
        return None;
    }
    let numero = c.um("numero").ok()?;
    if numero.is_some_and(|n| !digitos(n)) {
        return None;
    }
    let mut filtros = Vec::new();
    let chaves: Vec<String> = match c.um("idDeputadoAutor").ok()? {
        Some(id) if digitos(id) => {
            if !tipos.is_empty() {
                filtros.push(Filtro::Em("siglaTipo", tipos));
            }
            anos.iter()
                .map(|a| format!("camara/indices/proposicoes/autor/{id}/{a}.json"))
                .collect()
        }
        Some(_) => return None,
        None if !tipos.is_empty()
            && tipos.iter().all(|t| TIPOS_INDEXADOS.contains(&t.as_str())) =>
        {
            tipos
                .iter()
                .flat_map(|t| {
                    anos.iter()
                        .map(move |a| format!("camara/indices/proposicoes/tipo/{t}/{a}.json"))
                })
                .collect()
        }
        None => return None,
    };
    if chaves.len() > MAX_CHAVES {
        return None;
    }
    if let Some(n) = numero {
        filtros.push(Filtro::Igual("numero", n.to_string()));
    }
    let (base, self_href) = hrefs(rest, query);
    Some(Plano::Lista(Lista {
        chaves,
        filtros,
        ordem,
        itens,
        pagina,
        base,
        self_href,
    }))
}

// ---------- Senado ----------

fn senado(rest: &str, query: Option<&str>, hoje: i64) -> Option<Resolucao> {
    let c = Consulta {
        pares: pares(query),
    };
    let rest = rest.strip_suffix(".json").unwrap_or(rest);
    let s: Vec<&str> = rest.split('/').collect();
    let fixo = |chave: String| {
        Some(Resolucao {
            plano: Plano::Arquivo(chave),
            sensivel: false,
        })
    };
    let vazio = c.pares.is_empty();
    match s.as_slice() {
        ["senador", "lista", "atual"] if vazio => fixo(format!("senado/{rest}.json")),
        ["senador", "lista", "legislatura", a, b] if vazio && digitos(a) && digitos(b) => {
            fixo(format!("senado/{rest}.json"))
        }
        ["senador", id] | ["senador", id, "mandatos" | "comissoes"] if vazio && digitos(id) => {
            fixo(format!("senado/{rest}.json"))
        }
        ["comissao", "lista", t] if vazio && seguro(t) => fixo(format!("senado/{rest}.json")),
        ["comissao", id] if vazio && digitos(id) => fixo(format!("senado/{rest}.json")),
        ["processo"] if c.so(&["codigoParlamentarAutor"]) => {
            let id = c.um("codigoParlamentarAutor").ok()??;
            digitos(id).then_some(())?;
            fixo(format!("senado/processo@codigoParlamentarAutor={id}.json"))
        }
        ["processo"] if c.so(&["sigla", "numero", "ano"]) => {
            let sigla = c.um("sigla").ok()??.to_ascii_uppercase();
            let (numero, ano) = (c.um("numero").ok()??, c.um("ano").ok()??);
            if !TIPOS_INDEXADOS.contains(&sigla.as_str())
                || !digitos(numero)
                || ano.len() != 4
                || !digitos(ano)
            {
                return None;
            }
            let numero = numero.trim_start_matches('0');
            Some(Resolucao {
                plano: Plano::Senado(SenadoPlano::Itens {
                    chaves: vec![format!("senado/indices/processo/{sigla}/{ano}.json")],
                    filtros: vec![SenFiltro::Identificacao(format!("{sigla} {numero}/{ano}"))],
                }),
                sensivel: false,
            })
        }
        ["votacao"] if c.so(&["idProcesso"]) => {
            let id = c.um("idProcesso").ok()??;
            digitos(id).then_some(())?;
            fixo(format!("senado/votacao@idProcesso={id}.json"))
        }
        ["votacao"] if c.so(&["codigoParlamentar", "dataInicio", "dataFim"]) => {
            let a = dias(c.um("dataInicio").ok()??)?;
            let b = match c.um("dataFim").ok()? {
                Some(f) => dias(f)?,
                None => hoje,
            };
            if a > b || b - a > 366 * 9 {
                return None;
            }
            let (ya, yb): (i64, i64) = (
                dia_civil(a)[..4].parse().ok()?,
                dia_civil(b)[..4].parse().ok()?,
            );
            let mut filtros = vec![SenFiltro::Data(dia_civil(a), dia_civil(b))];
            if let Some(p) = c.um("codigoParlamentar").ok()? {
                digitos(p).then_some(())?;
                filtros.push(SenFiltro::Parlamentar(p.to_string()));
            }
            Some(Resolucao {
                plano: Plano::Senado(SenadoPlano::Itens {
                    chaves: (ya..=yb)
                        .map(|y| format!("senado/votacao/ano/{y}.json"))
                        .collect(),
                    filtros,
                }),
                sensivel: b >= hoje,
            })
        }
        ["plenario", "agenda", "mes", d] if vazio => {
            let n = dias(d)?;
            let dia = dia_civil(n);
            let mes = dia[..7].replace('-', "");
            Some(Resolucao {
                sensivel: mes.as_str() >= &dia_civil(hoje)[..7].replace('-', "")[..],
                plano: Plano::Senado(SenadoPlano::Plenario {
                    chave: format!("senado/plenario/agenda/mes/{mes}.json"),
                    desde: dia,
                }),
            })
        }
        ["comissao", "agenda", a, b] if vazio && a.len() == 8 && b.len() == 8 => {
            let (a, b) = (dias(a)?, dias(b)?);
            if a > b || b - a >= MAX_DIAS {
                return None;
            }
            Some(Resolucao {
                plano: Plano::Senado(SenadoPlano::Comissao {
                    chaves: meses(a, b)
                        .into_iter()
                        .map(|m| format!("senado/comissao/agenda/mes/{}.json", m.replace('-', "")))
                        .collect(),
                    desde: dia_civil(a),
                    ate: dia_civil(b),
                }),
                sensivel: b >= hoje,
            })
        }
        _ => None,
    }
}

/// Pedido (`rest` sem o prefixo `/api/{casa}/`, `query` crua) -> plano; None -> API ao vivo.
pub fn resolver(casa: Casa, rest: &str, query: Option<&str>, hoje: &str) -> Option<Resolucao> {
    if rest.is_empty()
        || rest
            .split('/')
            .any(|s| s.is_empty() || s == "." || s == "..")
        || rest.contains('@')
    {
        return None;
    }
    let hoje = dias(hoje)?;
    match casa {
        Casa::Camara => camara(rest, query, hoje),
        Casa::Senado => senado(rest, query, hoje),
    }
}

// ---------- montagem ----------

fn texto(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        x => x.to_string(),
    }
}

fn dobra(s: &str) -> String {
    s.chars()
        .flat_map(char::to_lowercase)
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            c => c,
        })
        .collect()
}

fn passa(f: &Filtro, v: &Value) -> bool {
    match f {
        Filtro::Igual(k, x) => texto(&v[*k]).eq_ignore_ascii_case(x),
        Filtro::Contem(k, x) => dobra(&texto(&v[*k])).contains(&dobra(x)),
        Filtro::Em(k, xs) => {
            let t = texto(&v[*k]);
            xs.iter().any(|x| x.eq_ignore_ascii_case(&t))
        }
        Filtro::Data(k, a, b) => {
            let t = texto(&v[*k]);
            let d = t.get(..10).unwrap_or(&t);
            d >= a.as_str() && d <= b.as_str()
        }
        Filtro::UriFim(k, x) => texto(&v[*k]).ends_with(x.as_str()),
        Filtro::Orgao(id) => v["orgaos"]
            .as_array()
            .is_some_and(|os| os.iter().any(|o| texto(&o["id"]) == *id)),
    }
}

fn compara(a: &Value, b: &Value) -> std::cmp::Ordering {
    match (a.as_f64(), b.as_f64()) {
        (Some(x), Some(y)) => x.partial_cmp(&y).unwrap_or(std::cmp::Ordering::Equal),
        _ => texto(a).cmp(&texto(b)),
    }
}

fn link(rel: &str, href: String) -> Value {
    serde_json::json!({ "rel": rel, "href": href })
}

fn montar_lista(l: &Lista, docs: Vec<Value>) -> Option<Montado> {
    let mut itens: Vec<Value> = Vec::new();
    for d in docs {
        match d {
            Value::Object(mut o) => match o.remove("dados") {
                Some(Value::Array(xs)) => itens.extend(xs),
                _ => return None,
            },
            _ => return None,
        }
    }
    itens.retain(|v| l.filtros.iter().all(|f| passa(f, v)));
    if let Some((campo, desc)) = &l.ordem {
        itens.sort_by(|a, b| {
            let o = compara(&a[campo.as_str()], &b[campo.as_str()]);
            if *desc {
                o.reverse()
            } else {
                o
            }
        });
    }
    let total = itens.len();
    let ultima = total.div_ceil(l.itens).max(1);
    let pagina: Vec<Value> = itens
        .into_iter()
        .skip((l.pagina - 1) * l.itens)
        .take(l.itens)
        .collect();
    let sep = if l.base.contains('?') { '&' } else { '?' };
    let href = |p: usize| format!("{}{sep}pagina={p}&itens={}", l.base, l.itens);
    let mut links = vec![link("self", l.self_href.clone())];
    if l.pagina < ultima {
        links.push(link("next", href(l.pagina + 1)));
    }
    if l.pagina > 1 {
        links.push(link("previous", href(l.pagina - 1)));
    }
    links.push(link("first", href(1)));
    links.push(link("last", href(ultima)));
    Some(Montado {
        corpo: serde_json::json!({ "dados": pagina, "links": links }),
        total: Some(total),
    })
}

/// Objeto único ou lista (XML->JSON do Senado) -> lista.
fn varios(v: Option<Value>) -> Vec<Value> {
    match v {
        Some(Value::Array(xs)) => xs,
        Some(Value::Null) | None => Vec::new(),
        Some(x) => vec![x],
    }
}

fn montar_senado(p: &SenadoPlano, docs: Vec<Value>) -> Option<Montado> {
    let corpo = match p {
        SenadoPlano::Itens { filtros, .. } => {
            let mut out = Vec::new();
            for d in docs {
                let Value::Array(xs) = d else { return None };
                for mut x in xs {
                    let mut ok = true;
                    for f in filtros {
                        match f {
                            SenFiltro::Identificacao(i) => ok &= texto(&x["identificacao"]) == *i,
                            SenFiltro::Data(a, b) => {
                                let t = texto(&x["dataSessao"]);
                                let d = t.get(..10).unwrap_or(&t);
                                ok &= d >= a.as_str() && d <= b.as_str();
                            }
                            SenFiltro::Parlamentar(c) => {
                                if let Some(vs) = x.get_mut("votos").and_then(Value::as_array_mut) {
                                    vs.retain(|v| texto(&v["codigoParlamentar"]) == *c);
                                    ok &= !vs.is_empty();
                                } else {
                                    ok = false;
                                }
                            }
                        }
                    }
                    if ok {
                        out.push(x);
                    }
                }
            }
            Value::Array(out)
        }
        SenadoPlano::Plenario { desde, .. } => {
            let mut d = docs.into_iter().next()?;
            let sessoes = d.pointer_mut("/AgendaPlenario/Sessoes");
            if let Some(Value::Object(s)) = sessoes {
                let xs: Vec<Value> = varios(s.remove("Sessao"))
                    .into_iter()
                    .filter(|x| texto(&x["Data"]).as_str() >= desde.as_str())
                    .collect();
                s.insert("Sessao".into(), Value::Array(xs));
            } else if d.get("AgendaPlenario").is_none() {
                return None;
            }
            d
        }
        SenadoPlano::Comissao { desde, ate, .. } => {
            let mut meta = Value::Null;
            let mut reunioes = Vec::new();
            for mut d in docs {
                let a = d.get_mut("AgendaReuniao")?;
                if meta.is_null() {
                    meta = a.get("Metadados").cloned().unwrap_or(Value::Null);
                }
                reunioes.extend(
                    varios(
                        a.get_mut("reunioes")
                            .and_then(|r| r.get_mut("reuniao"))
                            .map(Value::take),
                    )
                    .into_iter()
                    .filter(|r| {
                        let t = texto(&r["dataInicio"]);
                        let d = t.get(..10).unwrap_or(&t);
                        d >= desde.as_str() && d <= ate.as_str()
                    }),
                );
            }
            let mut ag = serde_json::Map::new();
            if !meta.is_null() {
                ag.insert("Metadados".into(), meta);
            }
            ag.insert(
                "reunioes".into(),
                serde_json::json!({ "reuniao": reunioes }),
            );
            serde_json::json!({ "AgendaReuniao": ag })
        }
    };
    Some(Montado { corpo, total: None })
}

/// Documentos do snapshot (na ordem de `chaves`) -> corpo da resposta. None: snapshot inválido.
pub fn montar(plano: &Plano, docs: Vec<Value>) -> Option<Montado> {
    match plano {
        Plano::Arquivo(_) => {
            let d = docs.into_iter().next()?;
            Some(Montado {
                corpo: d,
                total: None,
            })
        }
        Plano::Lista(l) => montar_lista(l, docs),
        Plano::Senado(s) => montar_senado(s, docs),
    }
}

impl Plano {
    /// Chaves a buscar (relativas a [`RAIZ`]).
    pub fn chaves(&self) -> Vec<&str> {
        match self {
            Plano::Arquivo(k) => vec![k],
            Plano::Lista(l) => l.chaves.iter().map(String::as_str).collect(),
            Plano::Senado(
                SenadoPlano::Itens { chaves, .. } | SenadoPlano::Comissao { chaves, .. },
            ) => chaves.iter().map(String::as_str).collect(),
            Plano::Senado(SenadoPlano::Plenario { chave, .. }) => vec![chave],
        }
    }
}
