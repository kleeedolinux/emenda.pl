//! Eventos das APIs de dados abertos (Câmara v2, Senado). Rede só via `Fetch` (testável com fixtures).

use super::texto::{dia_mes, ementa_curta, limita, milhar, somar_dias};
use super::{ent, id_estavel, num, relevancia, Entidade, Evento, Tipo, LIMITE_TEXTO};
use anyhow::{bail, Context, Result};
use serde_json::Value;
use std::collections::HashSet;

pub const CAMARA: &str = "https://dadosabertos.camara.leg.br/api/v2";
pub const SENADO: &str = "https://legis.senado.leg.br/dadosabertos";
/// Órgão Plenário da Câmara.
const PLEN: u32 = 180;

pub trait Fetch {
    fn get(&self, url: &str) -> Result<Value>;
}

/// `curl` do sistema (presente no runner do GitHub): sem dependência HTTP no crate.
pub struct Curl;
impl Fetch for Curl {
    fn get(&self, url: &str) -> Result<Value> {
        let o = std::process::Command::new("curl")
            .args(["-fsSL", "--retry", "3", "--retry-delay", "2", "-m", "60"])
            .args(["-H", "accept: application/json", url])
            .output()
            .context("curl")?;
        if !o.status.success() {
            bail!("{url}: {}", String::from_utf8_lossy(&o.stderr).trim());
        }
        serde_json::from_slice(&o.stdout).with_context(|| format!("{url}: JSON inválido"))
    }
}

/// Janela de busca (datas civis de Brasília, AAAA-MM-DD).
#[derive(Debug, Clone)]
pub struct Janela {
    pub desde: String,
    pub ate: String,
    pub hoje: String,
}

pub type Fonte = fn(&dyn Fetch, &Janela) -> Result<Vec<Evento>>;

// ---------- helpers de JSON tolerantes (números às vezes vêm como string) ----------

fn s(v: &Value, k: &str) -> String {
    match v.get(k) {
        Some(Value::String(x)) => x.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

fn dados(v: &Value) -> &[Value] {
    v.get("dados")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

fn ident(sigla: &str, numero: &str, ano: &str) -> String {
    format!("{sigla} {}/{ano}", numero.replace('.', ""))
}

fn ficha(id: &str) -> String {
    format!("https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao={id}")
}

fn materia(cod: &str) -> String {
    format!("https://www25.senado.leg.br/web/atividade/materias/-/materia/{cod}")
}

/// Junta cabeça + ": " + ementa, cabendo em 280.
fn com_ementa(cabeca: &str, ementa: &str) -> String {
    if ementa.is_empty() {
        return limita(&format!("{cabeca}."), LIMITE_TEXTO);
    }
    let resto = LIMITE_TEXTO.saturating_sub(cabeca.chars().count() + 3);
    let e = ementa_curta(ementa, resto.max(40));
    let fim = if e.ends_with('…') { "" } else { "." };
    limita(&format!("{cabeca}: {e}{fim}"), LIMITE_TEXTO)
}

/// Extrai a proposição citada ("Projeto de Lei nº 5.902, de 2023") -> ("PL", "5902", "2023").
pub fn proposicao_citada(t: &str) -> Option<(String, String, String)> {
    const TIPOS: [(&str, &str); 6] = [
        ("Projeto de Lei Complementar", "PLP"),
        ("Proposta de Emenda à Constituição", "PEC"),
        ("Projeto de Decreto Legislativo", "PDL"),
        ("Projeto de Resolução", "PRC"),
        ("Medida Provisória", "MPV"),
        ("Projeto de Lei", "PL"),
    ];
    let (i, sigla) = TIPOS
        .iter()
        .filter_map(|(n, s)| t.find(n).map(|i| (i, n.len(), *s)))
        .min_by_key(|(i, len, _)| (*i, std::cmp::Reverse(*len)))
        .map(|(i, len, s)| (i + len, s))?;
    let r = t[i..].trim_start();
    let r = r
        .strip_prefix("nº")
        .or_else(|| r.strip_prefix("n°"))
        .or_else(|| r.strip_prefix("nºs"))
        .unwrap_or(r)
        .trim_start();
    let numero: String = r
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .filter(char::is_ascii_digit)
        .collect();
    let ano: String = r
        .split("de ")
        .nth(1)?
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    (!numero.is_empty() && ano.len() == 4).then(|| (sigla.to_string(), numero, ano))
}

/// Resumo da proposição citada num requerimento: texto entre aspas ou o que vem após ", que ".
fn resumo_citado(t: &str) -> String {
    for (a, b) in [('‘', '’'), ('“', '”'), ('"', '"')] {
        if let Some(i) = t.find(a) {
            let r = &t[i + a.len_utf8()..];
            if let Some(j) = r.find(b) {
                return r[..j].to_string();
            }
        }
    }
    match t.find(", que ") {
        Some(i) => {
            let r = t[i + 6..].trim();
            let mut c = r.chars();
            c.next()
                .map(|f| f.to_uppercase().collect::<String>() + c.as_str())
                .unwrap_or_default()
        }
        None => String::new(),
    }
}

fn placar_descricao(d: &str) -> Option<(u32, u32)> {
    let num_apos = |k: &str| -> Option<u32> {
        let i = d.find(k)? + k.len();
        d[i..]
            .trim_start()
            .chars()
            .take_while(char::is_ascii_digit)
            .collect::<String>()
            .parse()
            .ok()
    };
    Some((num_apos("Sim:")?, num_apos("Não:")?))
}

fn contar(votos: &[Value], campo: &str) -> Option<(u32, u32)> {
    if votos.is_empty() {
        return None;
    }
    let c = |x: &str| votos.iter().filter(|v| s(v, campo) == x).count() as u32;
    Some((c("Sim"), c("Não")))
}

// ---------- Câmara: votações em Plenário ----------

fn merito(d: &str) -> bool {
    const OBJ: [&str; 7] = [
        "Proposta de Emenda",
        "Projeto de Lei",
        "Medida Provisória",
        "Substitutivo",
        "Subemenda Substitutiva",
        "Projeto de Decreto",
        "Projeto de Resolução",
    ];
    const NAO: [&str; 4] = [
        "Redação Final",
        "Requerimento",
        "apreciação preliminar",
        "Emenda de Redação",
    ];
    (d.starts_with("Aprovad") || d.starts_with("Rejeitad"))
        && OBJ.iter().any(|o| d.contains(o))
        && !NAO.iter().any(|o| d.contains(o))
}

pub fn camara_votacoes(f: &dyn Fetch, j: &Janela) -> Result<Vec<Evento>> {
    let lista = f.get(&format!(
        "{CAMARA}/votacoes?idOrgao={PLEN}&dataInicio={}&dataFim={}&itens=200&ordem=DESC&ordenarPor=dataHoraRegistro",
        j.desde, j.ate
    ))?;
    let mut vistos = HashSet::new();
    let mut v = vec![];
    for x in dados(&lista) {
        let (id, desc, dia) = (s(x, "id"), s(x, "descricao"), s(x, "data"));
        let pid = id.split('-').next().unwrap_or("").to_string();
        let urg = desc.contains("Requerimento de Urgência") && desc.starts_with("Aprovad");
        if pid.is_empty()
            || !(urg || merito(&desc))
            || !vistos.insert((pid.clone(), dia.clone(), urg))
        {
            continue;
        }
        let quando = format!("{}-03:00", s(x, "dataHoraRegistro"));
        let r = if urg {
            urgencia(f, &pid, &dia, &quando)
        } else {
            votacao(f, x, &pid, &id, &desc, &dia, &quando)
        };
        match r {
            Ok(e) => v.push(e),
            Err(e) => eprintln!("novidades: votação {id}: {e:#}"),
        }
    }
    Ok(v)
}

fn proposicao(f: &dyn Fetch, pid: &str) -> Result<Value> {
    let p = f.get(&format!("{CAMARA}/proposicoes/{pid}"))?;
    p.get("dados").cloned().context("sem dados")
}

fn votacao(
    f: &dyn Fetch,
    x: &Value,
    pid: &str,
    id: &str,
    desc: &str,
    dia: &str,
    quando: &str,
) -> Result<Evento> {
    let p = proposicao(f, pid)?;
    let (sigla, ementa) = (s(&p, "siglaTipo"), s(&p, "ementa"));
    let nome = ident(&sigla, &s(&p, "numero"), &s(&p, "ano"));
    let votos = f
        .get(&format!("{CAMARA}/votacoes/{id}/votos"))
        .map(|v| dados(&v).to_vec())
        .unwrap_or_default();
    let placar = contar(&votos, "tipoVoto").or_else(|| placar_descricao(desc));
    let aprovada =
        x.get("aprovacao").and_then(Value::as_i64) == Some(1) || desc.starts_with("Aprovad");
    let verbo = if aprovada { "aprovou" } else { "rejeitou" };
    let modo = match placar {
        Some((a, b)) => format!(" por {a} × {b}"),
        None => " em votação simbólica".into(),
    };
    let mut numeros = vec![];
    if let Some((a, b)) = placar {
        numeros = vec![num("sim", a as i64, "n"), num("não", b as i64, "n")];
    }
    Ok(Evento {
        id: id_estavel(Tipo::Votacao, pid, dia),
        tipo: Tipo::Votacao,
        data: quando.into(),
        titulo: format!("Câmara {verbo} {nome}{modo}"),
        texto: com_ementa(&format!("🗳️ Câmara {verbo} {nome}{modo}"), &ementa),
        entidades: vec![
            ent("proposicao", pid, &nome, format!("/proposicao/{pid}")),
            ent("votacao", id, "Votação", format!("/votacao/{id}")),
        ],
        numeros,
        fonte: vec![ficha(pid), format!("{CAMARA}/votacoes/{id}")],
        relevancia: relevancia::votacao(&sigla, placar, aprovada),
    })
}

fn urgencia(f: &dyn Fetch, req: &str, dia: &str, quando: &str) -> Result<Evento> {
    let p = proposicao(f, req)?;
    let ementa = s(&p, "ementa");
    let (alvo, sigla) = match proposicao_citada(&ementa) {
        Some((sg, n, a)) => (ident(&sg, &n, &a), sg),
        None => (
            ident(&s(&p, "siglaTipo"), &s(&p, "numero"), &s(&p, "ano")),
            String::new(),
        ),
    };
    let resumo = resumo_citado(&ementa);
    Ok(Evento {
        id: id_estavel(Tipo::Urgencia, req, dia),
        tipo: Tipo::Urgencia,
        data: quando.into(),
        titulo: format!("Câmara aprovou urgência para o {alvo}"),
        texto: com_ementa(
            &format!("⚡ Câmara aprovou urgência para o {alvo}"),
            &resumo,
        ),
        entidades: vec![ent("proposicao", req, &alvo, format!("/proposicao/{req}"))],
        numeros: vec![],
        fonte: vec![ficha(req)],
        relevancia: relevancia::urgencia(&sigla),
    })
}

// ---------- Câmara: novas PEC / MPV ----------

pub fn camara_proposicoes(f: &dyn Fetch, j: &Janela) -> Result<Vec<Evento>> {
    let lista = f.get(&format!(
        "{CAMARA}/proposicoes?siglaTipo=PEC,MPV&dataApresentacaoInicio={}&dataApresentacaoFim={}&itens=100&ordem=DESC&ordenarPor=id",
        j.desde, j.ate
    ))?;
    let mut v = vec![];
    for p in dados(&lista) {
        let (id, sigla) = (s(p, "id"), s(p, "siglaTipo"));
        let nome = ident(&sigla, &s(p, "numero"), &s(p, "ano"));
        let autores = f
            .get(&format!("{CAMARA}/proposicoes/{id}/autores"))
            .map(|a| dados(&a).to_vec())
            .unwrap_or_default();
        let mut ents = vec![ent("proposicao", &id, &nome, format!("/proposicao/{id}"))];
        let mut deputado = false;
        let por = match autores.first() {
            Some(a) => {
                let n = s(a, "nome");
                if let Some(dep) = s(a, "uri")
                    .split("/deputados/")
                    .nth(1)
                    .filter(|d| !d.is_empty())
                {
                    deputado = true;
                    ents.push(ent("deputado", dep, &n, format!("/deputado/{dep}")));
                }
                match autores.len() {
                    1 => n,
                    k => format!("{n} e mais {}", milhar(k as i64 - 1)),
                }
            }
            None => String::new(),
        };
        let cabeca = match (deputado, por.is_empty()) {
            (_, true) => format!("Nova {nome} apresentada"),
            (true, false) => format!("Nova {nome} apresentada por {por}"),
            (false, false) => format!("Nova {nome} (autoria: {por})"),
        };
        let quando = s(p, "dataApresentacao");
        v.push(Evento {
            id: id_estavel(Tipo::Proposicao, &id, ""),
            tipo: Tipo::Proposicao,
            data: format!("{}:00-03:00", quando.get(0..16).unwrap_or(&quando)),
            texto: com_ementa(&format!("🆕 {cabeca}"), &s(p, "ementa")),
            titulo: cabeca,
            entidades: ents,
            numeros: if autores.len() > 1 {
                vec![num("autores", autores.len() as i64, "n")]
            } else {
                vec![]
            },
            fonte: vec![ficha(&id)],
            relevancia: relevancia::proposicao(&sigla),
        });
    }
    Ok(v)
}

// ---------- Câmara: pauta do Plenário nos próximos dias ----------

pub fn camara_agenda(f: &dyn Fetch, j: &Janela) -> Result<Vec<Evento>> {
    let (ini, fim) = (somar_dias(&j.hoje, 1), somar_dias(&j.hoje, 3));
    let lista = f.get(&format!(
        "{CAMARA}/eventos?idOrgao={PLEN}&dataInicio={ini}&dataFim={fim}&itens=100&ordem=ASC&ordenarPor=dataHoraInicio"
    ))?;
    let mut v = vec![];
    for e in dados(&lista) {
        let (id, tipo, quando) = (s(e, "id"), s(e, "descricaoTipo"), s(e, "dataHoraInicio"));
        let dia = quando.get(0..10).unwrap_or("").to_string();
        let sit = s(e, "situacao");
        if !tipo.contains("Deliberativa")
            || tipo.contains("Não Deliberativa")
            || dia <= j.hoje
            || sit.contains("Encerrada")
            || sit.contains("Cancelada")
        {
            continue;
        }
        let pauta = match f.get(&format!("{CAMARA}/eventos/{id}/pauta")) {
            Ok(p) => dados(&p).to_vec(),
            Err(err) => {
                eprintln!("novidades: pauta {id}: {err:#}");
                continue;
            }
        };
        let mut itens: Vec<(String, String, String)> = vec![]; // (id, nome, sigla)
        let mut ementa_pec = String::new();
        let mut vistos = HashSet::new();
        for it in &pauta {
            let mut p = it.get("proposicao_").cloned().unwrap_or(Value::Null);
            if s(&p, "siglaTipo") == "REQ" {
                match it.get("proposicaoRelacionada_").filter(|r| !r.is_null()) {
                    Some(r) => p = r.clone(),
                    None => continue,
                }
            }
            let sigla = s(&p, "siglaTipo");
            if sigla.is_empty() {
                continue;
            }
            let nome = ident(&sigla, &s(&p, "numero"), &s(&p, "ano"));
            if vistos.insert(nome.clone()) {
                if sigla == "PEC" && ementa_pec.is_empty() {
                    ementa_pec = s(&p, "ementa");
                }
                itens.push((s(&p, "id"), nome, sigla));
            }
        }
        if itens.is_empty() {
            continue;
        }
        // PEC primeiro, depois ordem da pauta
        itens.sort_by_key(|(_, _, sg)| sg != "PEC");
        let quando_txt = if dia == somar_dias(&j.hoje, 1) {
            format!("Amanhã ({})", dia_mes(&dia))
        } else {
            format!("Em {}", dia_mes(&dia))
        };
        let mostrar = 4;
        let mut lista_txt = itens
            .iter()
            .take(mostrar)
            .map(|i| i.1.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        if itens.len() > mostrar {
            lista_txt.push_str(&format!(" e mais {}", itens.len() - mostrar));
        }
        let mut texto = format!("📅 {quando_txt} o Plenário da Câmara vota: {lista_txt}.");
        if !ementa_pec.is_empty() {
            let resto = LIMITE_TEXTO.saturating_sub(texto.chars().count() + 6);
            if resto > 40 {
                texto.push_str(&format!(" PEC: {}.", ementa_curta(&ementa_pec, resto)));
            }
        }
        let siglas: Vec<&str> = itens.iter().map(|i| i.2.as_str()).collect();
        let entidades: Vec<Entidade> = itens
            .iter()
            .take(mostrar)
            .filter(|i| !i.0.is_empty())
            .map(|(pid, nome, _)| ent("proposicao", pid, nome, format!("/proposicao/{pid}")))
            .collect();
        v.push(Evento {
            id: id_estavel(Tipo::Agenda, &id, ""),
            tipo: Tipo::Agenda,
            data: format!("{}T06:00:00-03:00", j.hoje),
            titulo: format!("{quando_txt} o Plenário da Câmara vota"),
            texto: limita(&texto, LIMITE_TEXTO),
            entidades,
            numeros: vec![num("itens na pauta", itens.len() as i64, "n")],
            fonte: vec![format!("https://www.camara.leg.br/evento-legislativo/{id}")],
            relevancia: relevancia::agenda(&siglas),
        });
    }
    Ok(v)
}

// ---------- Senado: votações em Plenário ----------

pub fn senado_votacoes(f: &dyn Fetch, j: &Janela) -> Result<Vec<Evento>> {
    let lista = f.get(&format!(
        "{SENADO}/votacao?dataInicio={}&dataFim={}",
        j.desde, j.ate
    ))?;
    let arr = lista.as_array().map(Vec::as_slice).unwrap_or(&[]);
    let mut v = vec![];
    for x in arr {
        let (cod, sigla, dia) = (s(x, "codigoMateria"), s(x, "sigla"), s(x, "dataSessao"));
        if sigla.is_empty() || dia.is_empty() {
            continue;
        }
        let nome = ident(&sigla, &s(x, "numero"), &s(x, "ano"));
        let votos = x
            .get("votos")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let placar = contar(&votos, "siglaVotoParlamentar");
        let aprovada = s(x, "resultadoVotacao") != "R";
        let verbo = if aprovada { "aprovou" } else { "rejeitou" };
        let desc = s(x, "descricaoVotacao");
        let turno = ["primeiro turno", "segundo turno", "turno único"]
            .into_iter()
            .find(|t| desc.contains(t))
            .map(|t| format!(" em {t}"))
            .unwrap_or_default();
        let modo = match placar {
            Some((a, b)) => format!(" por {a} × {b}"),
            None => " em votação simbólica".into(),
        };
        let mut numeros = vec![];
        if let Some((a, b)) = placar {
            numeros = vec![num("sim", a as i64, "n"), num("não", b as i64, "n")];
        }
        v.push(Evento {
            id: id_estavel(
                Tipo::Votacao,
                &format!("senado:{}", s(x, "codigoSessaoVotacao")),
                &dia,
            ),
            tipo: Tipo::Votacao,
            data: format!("{dia}T00:00:00-03:00"),
            titulo: format!("Senado {verbo} {nome}{turno}{modo}"),
            texto: com_ementa(
                &format!("🗳️ Senado {verbo} {nome}{turno}{modo}"),
                &s(x, "ementa"),
            ),
            entidades: vec![ent("materia", &cod, &nome, materia(&cod))],
            numeros,
            fonte: vec![materia(&cod)],
            relevancia: relevancia::votacao(&sigla, placar, aprovada),
        });
    }
    Ok(v)
}

// ---------- Senado: normas (leis, LCs, ECs) ----------

/// "29/09/2026" -> "2026-09-29".
fn iso_br(d: &str) -> Option<String> {
    let p: Vec<&str> = d.split('/').collect();
    (p.len() == 3 && p[2].len() == 4).then(|| format!("{}-{}-{}", p[2], p[1], p[0]))
}

pub fn senado_leis(f: &dyn Fetch, j: &Janela) -> Result<Vec<Evento>> {
    let anos: Vec<&str> = {
        let (a, b) = (
            j.desde.get(0..4).unwrap_or(""),
            j.ate.get(0..4).unwrap_or(""),
        );
        if a == b {
            vec![b]
        } else {
            vec![a, b]
        }
    };
    let mut v = vec![];
    let mut erro = None;
    for (tipo, rotulo, verbo) in [
        ("LEI", "Lei", "sancionada"),
        ("LCP", "Lei Complementar", "sancionada"),
        ("EMC", "Emenda Constitucional", "promulgada"),
    ] {
        for ano in &anos {
            let r = match f.get(&format!(
                "{SENADO}/legislacao/lista.json?tipo={tipo}&ano={ano}"
            )) {
                Ok(r) => r,
                Err(e) => {
                    erro = Some(e);
                    continue;
                }
            };
            let docs = match r.pointer("/ListaDocumento/documentos/documento") {
                Some(Value::Array(a)) => a.clone(),
                Some(o @ Value::Object(_)) => vec![o.clone()],
                _ => vec![],
            };
            for d in docs {
                let Some(dia) = iso_br(&s(&d, "dataassinatura")) else {
                    continue;
                };
                if dia < j.desde || dia > j.ate {
                    continue;
                }
                let (id, numero) = (s(&d, "id"), s(&d, "numero"));
                let n = numero.parse::<i64>().map(milhar).unwrap_or(numero.clone());
                let nome = format!("{rotulo} nº {n}/{}", &dia[0..4]);
                let url = format!("https://legis.senado.leg.br/norma/{id}");
                v.push(Evento {
                    id: id_estavel(Tipo::Lei, &format!("{tipo}:{id}"), ""),
                    tipo: Tipo::Lei,
                    data: format!("{dia}T00:00:00-03:00"),
                    titulo: format!("{nome} {verbo} em {}", dia_mes(&dia)),
                    texto: com_ementa(
                        &format!("📜 {nome} {verbo} em {}", dia_mes(&dia)),
                        &s(&d, "ementa"),
                    ),
                    entidades: vec![ent("lei", &id, &nome, &url)],
                    numeros: vec![],
                    fonte: vec![url],
                    relevancia: relevancia::lei(tipo, &s(&d, "ementa")),
                });
            }
        }
    }
    match (v.is_empty(), erro) {
        (true, Some(e)) => Err(e),
        _ => Ok(v),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn citada() {
        for (t, o) in [
            (
                "URGÊNCIA para apreciação do Projeto de Lei nº 5902, de 2023, que",
                Some(("PL", "5902", "2023")),
            ),
            (
                "urgência para o Projeto de Lei nº 5.649, de 2026, que",
                Some(("PL", "5649", "2026")),
            ),
            (
                "do Projeto de Lei Complementar nº 186, de 2026",
                Some(("PLP", "186", "2026")),
            ),
            (
                "da Proposta de Emenda à Constituição nº 12, de 2025",
                Some(("PEC", "12", "2025")),
            ),
            ("sem citação", None),
        ] {
            let r = proposicao_citada(t);
            assert_eq!(
                r.as_ref()
                    .map(|(a, b, c)| (a.as_str(), b.as_str(), c.as_str())),
                o,
                "{t}"
            );
        }
    }

    #[test]
    fn resumo_da_urgencia() {
        for (t, o) in [
            ("URGÊNCIA para o Projeto de Lei nº 5902, de 2023, que ‘Altera o Código\nPenal’.", "Altera o Código\nPenal"),
            ("urgência para o Projeto de Lei nº 5.649, de 2026, que autoriza a concessão de apoio.", "Autoriza a concessão de apoio."),
            ("Requer urgência.", ""),
        ] {
            assert_eq!(resumo_citado(t), o, "{t}");
        }
    }

    #[test]
    fn placar_no_texto() {
        assert_eq!(
            placar_descricao("Rejeitado. Sim: 11; Não: 387; Total: 398."),
            Some((11, 387))
        );
        assert_eq!(placar_descricao("Aprovado."), None);
    }

    #[test]
    fn filtro_de_merito() {
        for (d, m) in [
            ("Aprovada a Medida Provisória nº 1.375, de 2026, na forma do PLV, ressalvado o destaque.", true),
            ("Aprovado o Substitutivo ao Projeto de Lei nº 5.239, de 2025.", true),
            ("Aprovada a Redação Final.", false),
            ("Aprovado, em apreciação preliminar, o Parecer da Comissão Mista acerca do Projeto de Lei", false),
            ("Rejeitado o Requerimento.", false),
            ("Mantido o texto.", false),
        ] {
            assert_eq!(merito(d), m, "{d}");
        }
    }
}
