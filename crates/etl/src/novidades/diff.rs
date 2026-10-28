//! Eventos derivados do diff entre o snapshot anterior (branch `data`) e o atual.
//! Sem snapshot anterior: resumo do mês corrente (bootstrap).

use super::texto::{brl_curto, data_brt, limita, mes_extenso, titulo_nome};
use super::{ent, id_estavel, num, relevancia, Entidade, Evento, Tipo, LIMITE_TEXTO};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;

const FONTE_PT: &str =
    "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/UNICO";

#[derive(Debug, Default, Clone, Deserialize)]
pub struct Mes {
    pub mes: u32,
    pub n: u64,
    pub valor: i64,
}

/// `null` da fonte vira "".
fn nulo<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    Ok(Option::<String>::deserialize(d)?.unwrap_or_default())
}

#[derive(Debug, Default, Clone, Deserialize)]
pub struct Nome {
    #[serde(default, deserialize_with = "nulo")]
    pub codigo: String,
    #[serde(default, deserialize_with = "nulo")]
    pub nome: String,
}

#[derive(Debug, Default, Clone, Deserialize)]
pub struct Municipio {
    #[serde(default, deserialize_with = "nulo")]
    pub ibge: String,
    #[serde(default, deserialize_with = "nulo")]
    pub nome: String,
    #[serde(default, deserialize_with = "nulo")]
    pub uf: String,
}

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pagamento {
    #[serde(default, deserialize_with = "nulo")]
    pub codigo_emenda: String,
    #[serde(default)]
    pub autor: Nome,
    #[serde(default, deserialize_with = "nulo")]
    pub tipo: String,
    #[serde(default)]
    pub favorecido: Option<Nome>,
    #[serde(default)]
    pub municipio: Option<Municipio>,
    #[serde(default)]
    pub valor: i64,
}

impl Pagamento {
    fn chave(&self) -> String {
        format!(
            "{}|{}|{}|{}",
            self.codigo_emenda,
            self.municipio
                .as_ref()
                .map(|m| m.ibge.as_str())
                .unwrap_or(""),
            self.favorecido
                .as_ref()
                .map(|f| f.nome.as_str())
                .unwrap_or(""),
            self.valor
        )
    }
}

#[derive(Debug, Default, Clone, Deserialize)]
pub struct Parlamentar {
    pub casa: String,
    pub id: String,
    pub nome: String,
    #[serde(default)]
    pub partido: Option<String>,
    #[serde(default)]
    pub uf: Option<String>,
}

/// Soma da cota de um parlamentar em um mês.
#[derive(Debug, Clone)]
pub struct GastoMes {
    pub p: Parlamentar,
    pub mes: u32,
    pub valor: i64,
}

/// O que importa de um checkout de `v1/` (campos ausentes -> vazio).
#[derive(Debug, Default)]
pub struct Snapshot {
    pub ultimo_mes: u32,
    pub meses: Vec<Mes>,
    /// Itens do arquivo `feed/<ultimoMes>.json`.
    pub feed_mes: Vec<Pagamento>,
    pub pix_pago: Option<i64>,
    /// (valor, pagamentos) da Pix na janela 1m de rankings.json.
    pub pix_1m: Option<(i64, u64)>,
    pub parlamentares: Vec<Parlamentar>,
    /// Totais do último mês completo (anterior a `dadosAte`) por parlamentar.
    pub gastos_mes: Vec<GastoMes>,
}

fn ler<T: DeserializeOwned>(p: &Path) -> Option<T> {
    let b = std::fs::read(p).ok()?;
    match serde_json::from_slice(&b) {
        Ok(v) => Some(v),
        Err(e) => {
            eprintln!("novidades: {p:?} ilegível: {e}");
            None
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FeedJ {
    ultimo_mes: u32,
    #[serde(default)]
    meses: Vec<Mes>,
}
#[derive(Deserialize)]
struct FeedMesJ {
    #[serde(default)]
    itens: Vec<Pagamento>,
}
#[derive(Deserialize)]
struct Pago {
    pago: i64,
}
#[derive(Deserialize)]
struct PixJ {
    totais: Pago,
}
#[derive(Deserialize)]
struct TipoJ {
    tipo: String,
    valor: i64,
    pagamentos: u64,
}
#[derive(Deserialize)]
struct JanelaJ {
    janela: String,
    #[serde(default)]
    tipos: Vec<TipoJ>,
}
#[derive(Deserialize)]
struct RankingsJ {
    janelas: Vec<JanelaJ>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GastosRankingJ {
    #[serde(default)]
    dados_ate: HashMap<String, Option<String>>,
    #[serde(default)]
    parlamentares: Vec<Parlamentar>,
}
#[derive(Deserialize)]
struct ItemJ {
    data: String,
    valor: i64,
}
#[derive(Deserialize)]
struct GastoParlJ {
    #[serde(flatten)]
    p: Parlamentar,
    #[serde(default)]
    itens: Vec<ItemJ>,
}

fn aaaamm(s: &str) -> Option<u32> {
    Some(s.get(0..4)?.parse::<u32>().ok()? * 100 + s.get(5..7)?.parse::<u32>().ok()?)
}

fn mes_anterior(m: u32) -> u32 {
    if m % 100 == 1 {
        (m / 100 - 1) * 100 + 12
    } else {
        m - 1
    }
}

/// Lê um checkout (raiz com `v1/`). Nada aqui falha: ausência vira vazio.
pub fn carregar(raiz: &Path) -> Snapshot {
    let v1 = raiz.join("v1");
    let mut s = Snapshot::default();
    if let Some(f) = ler::<FeedJ>(&v1.join("feed.json")) {
        s.ultimo_mes = f.ultimo_mes;
        s.meses = f.meses;
        s.feed_mes = ler::<FeedMesJ>(&v1.join(format!("feed/{}.json", f.ultimo_mes)))
            .map(|m| m.itens)
            .unwrap_or_default();
    }
    s.pix_pago = ler::<PixJ>(&v1.join("pix.json")).map(|p| p.totais.pago);
    s.pix_1m = ler::<RankingsJ>(&v1.join("rankings.json")).and_then(|r| {
        let j = r.janelas.into_iter().find(|j| j.janela == "1m")?;
        let t = j.tipos.into_iter().find(|t| t.tipo == "pix")?;
        Some((t.valor, t.pagamentos))
    });
    if let Some(g) = ler::<GastosRankingJ>(&v1.join("gastos/ranking.json")) {
        s.parlamentares = g.parlamentares;
        for (casa, dir) in [("camara", "deputado"), ("senado", "senador")] {
            let Some(ate) = g
                .dados_ate
                .get(casa)
                .and_then(|d| d.as_deref())
                .and_then(aaaamm)
            else {
                continue;
            };
            let alvo = mes_anterior(ate);
            let Ok(rd) = std::fs::read_dir(v1.join("gastos").join(dir)) else {
                continue;
            };
            for f in rd.flatten() {
                let Some(gp) = ler::<GastoParlJ>(&f.path()) else {
                    continue;
                };
                let valor: i64 = gp
                    .itens
                    .iter()
                    .filter(|i| aaaamm(&i.data) == Some(alvo))
                    .map(|i| i.valor)
                    .sum();
                if valor > 0 {
                    s.gastos_mes.push(GastoMes {
                        p: Parlamentar {
                            casa: casa.into(),
                            ..gp.p
                        },
                        mes: alvo,
                        valor,
                    });
                }
            }
        }
    }
    s
}

fn parl_url(p: &Parlamentar) -> (&'static str, String) {
    if p.casa == "senado" {
        ("senador", format!("/senador/{}", p.id))
    } else {
        ("deputado", format!("/deputado/{}", p.id))
    }
}

fn tratamento(p: &Parlamentar) -> &'static str {
    if p.casa == "senado" {
        "Sen."
    } else {
        "Dep."
    }
}

fn destino(p: &Pagamento) -> (String, Vec<Entidade>) {
    let mut ents = vec![];
    let autor = titulo_nome(&p.autor.nome);
    if !p.autor.codigo.is_empty() {
        ents.push(ent(
            "autor",
            &p.autor.codigo,
            &autor,
            format!("/autor/{}", p.autor.codigo),
        ));
    }
    let alvo = match &p.municipio {
        Some(m) if !m.ibge.is_empty() => {
            let nome = format!("{} ({})", m.nome, m.uf);
            ents.push(ent(
                "municipio",
                &m.ibge,
                &nome,
                format!("/municipio/{}", m.ibge),
            ));
            nome
        }
        _ => p
            .favorecido
            .as_ref()
            .map(|f| titulo_nome(&f.nome))
            .unwrap_or_default(),
    };
    (format!("{autor} → {alvo}, {}", brl_curto(p.valor)), ents)
}

fn novos_itens<'a>(prev: Option<&Snapshot>, cur: &'a Snapshot) -> Vec<&'a Pagamento> {
    let vistos: HashSet<String> = match prev {
        Some(p) if p.ultimo_mes == cur.ultimo_mes => p.feed_mes.iter().map(|i| i.chave()).collect(),
        _ => HashSet::new(),
    };
    cur.feed_mes
        .iter()
        .filter(|i| !vistos.contains(&i.chave()))
        .collect()
}

fn maior<'a>(v: impl Iterator<Item = &'a Pagamento>) -> Option<&'a Pagamento> {
    v.max_by_key(|p| p.valor)
}

fn evento_dinheiro(
    tipo: Tipo,
    chave: &str,
    agora: &str,
    cabeca: String,
    (total, n): (i64, Option<u64>),
    top: Option<&Pagamento>,
    base: u8,
) -> Evento {
    let mut ents = vec![];
    let mut texto = format!("💸 {cabeca}.");
    if let Some(p) = top {
        let (s, e) = destino(p);
        texto.push_str(&format!(" Maior pagamento: {s}."));
        ents = e;
    }
    if let Some(n) = n.filter(|&n| n > 0) {
        texto.push_str(&format!(
            " São {} pagamentos.",
            super::texto::milhar(n as i64)
        ));
    }
    let mut numeros = vec![num("total", total, "brl")];
    if let Some(n) = n.filter(|&n| n > 0) {
        numeros.push(num("pagamentos", n as i64, "n"));
    }
    Evento {
        id: id_estavel(tipo, chave, &data_brt(agora)),
        tipo,
        data: agora.into(),
        titulo: limita(&cabeca, 120),
        texto: limita(&texto, LIMITE_TEXTO),
        entidades: ents,
        numeros,
        fonte: vec![FONTE_PT.into()],
        relevancia: relevancia::valor(base, total),
    }
}

fn pagamentos(prev: Option<&Snapshot>, cur: &Snapshot, agora: &str) -> Vec<Evento> {
    let mut v = vec![];
    if cur.ultimo_mes == 0 {
        return v;
    }
    let novos = novos_itens(prev, cur);
    match prev.filter(|p| !p.meses.is_empty()) {
        Some(p) => {
            let antes: HashMap<u32, &Mes> = p.meses.iter().map(|m| (m.mes, m)).collect();
            let (mut dv, mut dn) = (0i64, 0i64);
            for m in &cur.meses {
                let a = antes.get(&m.mes);
                dv += m.valor - a.map_or(0, |a| a.valor);
                dn += m.n as i64 - a.map_or(0, |a| a.n as i64);
            }
            if dv > 0 {
                v.push(evento_dinheiro(
                    Tipo::Pagamentos,
                    "delta",
                    agora,
                    format!(
                        "{} em novos pagamentos de emendas parlamentares registrados no Portal da Transparência",
                        brl_curto(dv)
                    ),
                    (dv, (dn > 0).then_some(dn as u64)),
                    maior(novos.iter().copied()),
                    40,
                ));
            }
            if let (Some(a), Some(b)) = (p.pix_pago, cur.pix_pago) {
                if b > a {
                    v.push(evento_dinheiro(
                        Tipo::Pix,
                        "delta",
                        agora,
                        format!(
                            "{} em novos pagamentos de Emendas Pix (transferências especiais)",
                            brl_curto(b - a)
                        ),
                        (b - a, None),
                        maior(novos.iter().copied().filter(|i| i.tipo == "pix")),
                        45,
                    ));
                }
            }
        }
        None => {
            if let Some(m) = cur.meses.iter().find(|m| m.mes == cur.ultimo_mes) {
                let mut e = evento_dinheiro(
                    Tipo::Pagamentos,
                    &format!("mes-{}", m.mes),
                    agora,
                    format!(
                        "{} pagos em emendas parlamentares em {} até agora",
                        brl_curto(m.valor),
                        mes_extenso(m.mes)
                    ),
                    (m.valor, Some(m.n)),
                    maior(cur.feed_mes.iter()),
                    40,
                );
                e.id = id_estavel(Tipo::Pagamentos, &format!("mes-{}", m.mes), "");
                v.push(e);
            }
            if let Some((valor, n)) = cur.pix_1m.filter(|p| p.0 > 0) {
                let mut e = evento_dinheiro(
                    Tipo::Pix,
                    &format!("mes-{}", cur.ultimo_mes),
                    agora,
                    format!(
                        "{} pagos em Emendas Pix (transferências especiais) em {} até agora",
                        brl_curto(valor),
                        mes_extenso(cur.ultimo_mes)
                    ),
                    (valor, Some(n)),
                    maior(cur.feed_mes.iter().filter(|i| i.tipo == "pix")),
                    45,
                );
                e.id = id_estavel(Tipo::Pix, &format!("mes-{}", cur.ultimo_mes), "");
                v.push(e);
            }
        }
    }
    v
}

fn partidos(prev: &Snapshot, cur: &Snapshot, agora: &str) -> Vec<Evento> {
    let antes: HashMap<(&str, &str), &Parlamentar> = prev
        .parlamentares
        .iter()
        .map(|p| ((p.casa.as_str(), p.id.as_str()), p))
        .collect();
    let mut v = vec![];
    for p in &cur.parlamentares {
        let Some(a) = antes.get(&(p.casa.as_str(), p.id.as_str())) else {
            continue;
        };
        let (Some(de), Some(para)) = (a.partido.as_deref(), p.partido.as_deref()) else {
            continue;
        };
        if de.is_empty() || para.is_empty() || de == para {
            continue;
        }
        let (tipo, url) = parl_url(p);
        let uf = p.uf.as_deref().unwrap_or("");
        let titulo = format!(
            "{} {} ({uf}) trocou de partido: {de} → {para}",
            tratamento(p),
            p.nome
        );
        let texto = format!(
            "🔁 {titulo}, segundo os dados abertos da {}.",
            if p.casa == "senado" {
                "Senado"
            } else {
                "Câmara"
            }
        );
        v.push(Evento {
            id: id_estavel(
                Tipo::Partido,
                &format!("{}:{}:{de}>{para}", p.casa, p.id),
                &data_brt(agora),
            ),
            tipo: Tipo::Partido,
            data: agora.into(),
            titulo,
            texto: limita(&texto, LIMITE_TEXTO),
            entidades: vec![
                ent(tipo, &p.id, &p.nome, url),
                ent("partido", de, de, format!("/partido/{de}")),
                ent("partido", para, para, format!("/partido/{para}")),
            ],
            numeros: vec![],
            fonte: vec![if p.casa == "senado" {
                format!(
                    "https://www25.senado.leg.br/web/senadores/senador/-/perfil/{}",
                    p.id
                )
            } else {
                format!("https://www.camara.leg.br/deputados/{}", p.id)
            }],
            relevancia: relevancia::partido(),
        });
    }
    v
}

fn gastos(cur: &Snapshot, agora: &str) -> Vec<Evento> {
    let mut v = vec![];
    for casa in ["camara", "senado"] {
        let Some(g) = cur
            .gastos_mes
            .iter()
            .filter(|g| g.p.casa == casa)
            .max_by(|a, b| a.valor.cmp(&b.valor).then(b.p.id.cmp(&a.p.id)))
        else {
            continue;
        };
        let p = &g.p;
        let (tipo, url) = parl_url(p);
        let sigla = match (p.partido.as_deref(), p.uf.as_deref()) {
            (Some(pa), Some(uf)) => format!(" ({pa}-{uf})"),
            (None, Some(uf)) => format!(" ({uf})"),
            _ => String::new(),
        };
        let cota = if casa == "senado" {
            "cota parlamentar (CEAPS)"
        } else {
            "cota parlamentar"
        };
        let mes = mes_extenso(g.mes);
        let titulo = format!(
            "{} {}{sigla} teve o maior gasto da {cota} em {mes}: {}",
            tratamento(p),
            p.nome,
            brl_curto(g.valor)
        );
        let texto = format!(
            "🧾 {titulo}, entre os {} com despesas publicadas.",
            if casa == "senado" {
                "senadores"
            } else {
                "deputados"
            }
        );
        let mut ents = vec![ent(tipo, &p.id, &p.nome, url)];
        if let Some(pa) = p.partido.as_deref().filter(|s| !s.is_empty()) {
            ents.push(ent("partido", pa, pa, format!("/partido/{pa}")));
        }
        v.push(Evento {
            // um por casa e mês; o líder pode mudar até o fechamento -> id não inclui o parlamentar
            id: id_estavel(Tipo::Gastos, casa, &g.mes.to_string()),
            tipo: Tipo::Gastos,
            data: agora.into(),
            titulo,
            texto: limita(&texto, LIMITE_TEXTO),
            entidades: ents,
            numeros: vec![num("no mês", g.valor, "brl")],
            fonte: vec![if casa == "senado" {
                "https://www12.senado.leg.br/transparencia/sen/".to_string()
            } else {
                format!("https://www.camara.leg.br/deputados/{}", p.id)
            }],
            relevancia: relevancia::gastos(),
        });
    }
    v
}

/// Eventos do diff `prev` -> `cur`. Sem `prev`: bootstrap (resumo do mês; sem trocas de partido).
pub fn eventos(prev: Option<&Snapshot>, cur: &Snapshot, agora: &str) -> Vec<Evento> {
    let mut v = pagamentos(prev, cur, agora);
    if let Some(p) = prev {
        v.extend(partidos(p, cur, agora));
    }
    v.extend(gastos(cur, agora));
    v
}
