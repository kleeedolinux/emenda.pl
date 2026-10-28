//! Novidades: feed diário de eventos ("o que mudou e importa") -> v1/novidades.json + arquivo mensal.
//!
//! Entrada: snapshot anterior do branch `data` (opcional) + snapshot atual + APIs da Câmara/Senado.
//! Saída: eventos com id estável (tipo + entidade + data), texto ≤ 280 caracteres, relevância 0–100.

pub mod diff;
pub mod fontes;
pub mod relevancia;
mod texto;

pub use texto::{agora_iso, brl_curto, ementa_curta, limita, mes_extenso, titulo_nome};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

/// Limite do texto pronto para compartilhar (caracteres Unicode).
pub const LIMITE_TEXTO: usize = 280;
/// Itens no arquivo rolante `v1/novidades.json`.
pub const ROLANTE: usize = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tipo {
    Pagamentos,
    Pix,
    Votacao,
    Urgencia,
    Lei,
    Partido,
    Gastos,
    Proposicao,
    Agenda,
}

impl Tipo {
    pub fn nome(self) -> &'static str {
        match self {
            Tipo::Pagamentos => "pagamentos",
            Tipo::Pix => "pix",
            Tipo::Votacao => "votacao",
            Tipo::Urgencia => "urgencia",
            Tipo::Lei => "lei",
            Tipo::Partido => "partido",
            Tipo::Gastos => "gastos",
            Tipo::Proposicao => "proposicao",
            Tipo::Agenda => "agenda",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Entidade {
    /// deputado | senador | autor | municipio | uf | partido | proposicao | votacao | materia | lei
    pub tipo: String,
    pub id: String,
    pub nome: String,
    /// Caminho interno ("/deputado/123") ou URL externa oficial.
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Numero {
    pub rotulo: String,
    pub valor: i64,
    /// "brl" (centavos) | "n" (contagem)
    pub formato: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Evento {
    pub id: String,
    pub tipo: Tipo,
    /// ISO-8601 (com fuso).
    pub data: String,
    pub titulo: String,
    /// Pronto para compartilhar: pt-BR, ≤ 280 caracteres.
    pub texto: String,
    pub entidades: Vec<Entidade>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub numeros: Vec<Numero>,
    pub fonte: Vec<String>,
    pub relevancia: u8,
}

/// FNV-1a 64 bits: estável entre execuções e plataformas.
fn fnv(s: &str) -> u64 {
    s.bytes().fold(0xcbf29ce484222325, |h, b| {
        (h ^ b as u64).wrapping_mul(0x100000001b3)
    })
}

/// Id estável: `<tipo>-<hash(tipo|entidade|data)>`.
pub fn id_estavel(tipo: Tipo, entidade: &str, data: &str) -> String {
    format!(
        "{}-{:016x}",
        tipo.nome(),
        fnv(&format!("{}|{entidade}|{data}", tipo.nome()))
    )
}

pub(crate) fn ent(
    tipo: &str,
    id: impl Into<String>,
    nome: impl Into<String>,
    url: impl Into<String>,
) -> Entidade {
    Entidade {
        tipo: tipo.into(),
        id: id.into(),
        nome: nome.into(),
        url: url.into(),
    }
}

pub(crate) fn num(rotulo: &str, valor: i64, formato: &str) -> Numero {
    Numero {
        rotulo: rotulo.into(),
        valor,
        formato: formato.into(),
    }
}

/// Mescla por id: conteúdo mais novo vence, mas a primeira `data` vista é mantida.
/// Ordem: data desc, relevância desc, id.
pub fn mesclar(antigos: Vec<Evento>, novos: Vec<Evento>) -> Vec<Evento> {
    let mut m: HashMap<String, Evento> = HashMap::new();
    for e in antigos.into_iter().chain(novos) {
        match m.get_mut(&e.id) {
            Some(old) => {
                let data = std::cmp::min(old.data.clone(), e.data.clone());
                *old = Evento { data, ..e };
            }
            None => {
                m.insert(e.id.clone(), e);
            }
        }
    }
    let mut v: Vec<Evento> = m.into_values().collect();
    v.sort_by(|a, b| {
        chave_data(&b.data)
            .cmp(&chave_data(&a.data))
            .then(b.relevancia.cmp(&a.relevancia))
            .then(a.id.cmp(&b.id))
    });
    v
}

/// Datas com fusos diferentes ("Z" e "-03:00") comparadas em UTC aproximado (minutos).
fn chave_data(d: &str) -> String {
    texto::iso_utc(d).unwrap_or_else(|| d.to_string())
}

fn mes_de(d: &str) -> u32 {
    let u = chave_data(d);
    u.get(0..4).and_then(|y| y.parse::<u32>().ok()).unwrap_or(0) * 100
        + u.get(5..7).and_then(|m| m.parse::<u32>().ok()).unwrap_or(0)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MesIdx {
    mes: u32,
    n: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Rolante<'a> {
    gerado_em: &'a str,
    meses: Vec<MesIdx>,
    itens: &'a [Evento],
}

#[derive(Serialize, Deserialize)]
struct Arquivo {
    mes: u32,
    itens: Vec<Evento>,
}

/// Escreve `v1/novidades.json` (últimos 500) e `v1/novidades/<AAAAMM>.json` (todos do mês).
/// `eventos` já vem ordenado (ver `mesclar`).
pub fn escrever(out: &Path, eventos: &[Evento], gerado_em: &str) -> Result<()> {
    let mut por_mes: BTreeMap<u32, Vec<Evento>> = BTreeMap::new();
    for e in eventos {
        por_mes.entry(mes_de(&e.data)).or_default().push(e.clone());
    }
    let dir = out.join("v1/novidades");
    for (mes, itens) in &por_mes {
        crate::write(
            &dir.join(format!("{mes}.json")),
            &Arquivo {
                mes: *mes,
                itens: itens.clone(),
            },
        )?;
    }
    let meses = por_mes
        .iter()
        .rev()
        .map(|(m, v)| MesIdx {
            mes: *m,
            n: v.len(),
        })
        .collect();
    crate::write(
        &out.join("v1/novidades.json"),
        &Rolante {
            gerado_em,
            meses,
            itens: &eventos[..eventos.len().min(ROLANTE)],
        },
    )
}

/// Lê todos os eventos já publicados em `<dir>/v1/novidades/*.json` (ausente -> vazio).
pub fn ler_existentes(dir: &Path) -> Vec<Evento> {
    let Ok(rd) = std::fs::read_dir(dir.join("v1/novidades")) else {
        return vec![];
    };
    let mut v = vec![];
    for f in rd.flatten() {
        let p = f.path();
        if p.extension().is_some_and(|x| x == "json") {
            match std::fs::read(&p).map(|b| serde_json::from_slice::<Arquivo>(&b)) {
                Ok(Ok(a)) => v.extend(a.itens),
                _ => eprintln!("novidades: ignorando {p:?} (ilegível)"),
            }
        }
    }
    v
}

pub struct Opts {
    /// Checkout anterior do branch `data` (raiz com `v1/`).
    pub prev: Option<PathBuf>,
    /// Dados atuais (raiz com `v1/`).
    pub cur: PathBuf,
    /// Saída (raiz; gera `v1/novidades*`).
    pub out: PathBuf,
    /// Instante da execução (ISO-8601 UTC).
    pub agora: String,
    /// Janela das APIs em dias (sem histórico anterior usa 7).
    pub dias: u32,
}

#[derive(Debug, Default)]
pub struct Relatorio {
    pub novos: usize,
    pub total: usize,
    pub erros: usize,
}

pub fn run(o: &Opts, f: &dyn fontes::Fetch) -> Result<Relatorio> {
    let mut antigos = o.prev.as_deref().map(ler_existentes).unwrap_or_default();
    antigos.extend(ler_existentes(&o.out));
    let prev = o.prev.as_deref().map(diff::carregar);
    let cur = diff::carregar(&o.cur);

    let mut novos = diff::eventos(prev.as_ref(), &cur, &o.agora);
    let dias = if antigos.is_empty() {
        o.dias.max(7)
    } else {
        o.dias
    };
    let hoje = texto::data_brt(&o.agora);
    let j = fontes::Janela {
        desde: texto::somar_dias(&hoje, -(dias as i64)),
        ate: hoje.clone(),
        hoje: hoje.clone(),
    };
    // Normas aparecem na base com atraso: janela maior; ids estáveis evitam repetição.
    let j_leis = fontes::Janela {
        desde: texto::somar_dias(&hoje, -30),
        ..j.clone()
    };
    let mut erros = 0;
    let fontes: [(&str, fontes::Fonte, &fontes::Janela); 5] = [
        ("camara-votacoes", fontes::camara_votacoes, &j),
        ("camara-proposicoes", fontes::camara_proposicoes, &j),
        ("camara-agenda", fontes::camara_agenda, &j),
        ("senado-votacoes", fontes::senado_votacoes, &j),
        ("senado-leis", fontes::senado_leis, &j_leis),
    ];
    for (nome, fonte, janela) in fontes {
        match fonte(f, janela) {
            Ok(v) => novos.extend(v),
            Err(e) => {
                erros += 1;
                eprintln!("novidades: {nome} indisponível: {e:#}");
            }
        }
    }
    let ids: std::collections::HashSet<String> = antigos.iter().map(|e| e.id.clone()).collect();
    let n_novos = novos.iter().filter(|e| !ids.contains(&e.id)).count();
    let todos = mesclar(antigos, novos);
    escrever(&o.out, &todos, &o.agora)?;
    Ok(Relatorio {
        novos: n_novos,
        total: todos.len(),
        erros,
    })
}
