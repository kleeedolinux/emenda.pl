//! v1/feed.json, v1/feed/<YYYYMM>.json e v1/rankings.json, a partir de
//! EmendasParlamentares_PorFavorecido.csv (pagamentos por mês).

use crate::model::AutorRef;
use crate::norm::{chave_nome, mes_menos, uf_nome, uf_sigla_valida, TipoEmenda};
use crate::write;
use anyhow::Result;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::hash::Hash;
use std::path::Path;

/// Meses no feed principal.
pub const FEED_MESES: u32 = 6;
/// Itens por mês no feed principal (6 × 500 = 3000).
pub const FEED_POR_MES: usize = 500;
/// Arquivos mensais emitidos.
pub const ARQ_MESES: u32 = 24;
/// Teto de itens por arquivo mensal (mantém < 5 MB).
pub const ARQ_MAX: usize = 6000;
pub const RANK_TOP: usize = 100;
pub const JANELAS: [(&str, u32); 4] = [("1m", 1), ("3m", 3), ("6m", 6), ("12m", 12)];

#[derive(Serialize, Clone)]
pub struct FavRef {
    pub nome: String,
    pub documento: String,
    pub tipo: String,
}

#[derive(Serialize, Clone)]
pub struct MunRef {
    pub ibge: Option<String>,
    pub nome: String,
    pub uf: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Pagamento {
    pub mes: u32,
    pub codigo_emenda: String,
    pub autor: AutorRef,
    pub tipo: TipoEmenda,
    pub favorecido: FavRef,
    pub municipio: MunRef,
    pub valor: i64,
}

#[derive(Serialize, Clone, Copy)]
pub struct MesResumo {
    pub mes: u32,
    pub n: u64,
    pub valor: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Feed<'a> {
    pub ultimo_mes: u32,
    /// meses com arquivo `feed/<YYYYMM>.json` (desc)
    pub meses: Vec<MesResumo>,
    pub itens: Vec<&'a Pagamento>,
}

#[derive(Serialize)]
pub struct FeedMes<'a> {
    pub mes: u32,
    pub n: u64,
    pub valor: i64,
    pub truncado: bool,
    pub itens: Vec<&'a Pagamento>,
}

#[derive(Serialize)]
pub struct RankAutor {
    pub codigo: String,
    pub nome: String,
    pub chave: String,
    pub valor: i64,
    pub pagamentos: u64,
}
#[derive(Serialize)]
pub struct RankUf {
    pub uf: String,
    pub nome: String,
    pub valor: i64,
    pub pagamentos: u64,
}
#[derive(Serialize)]
pub struct RankMun {
    pub ibge: String,
    pub nome: String,
    pub uf: String,
    pub valor: i64,
    pub pagamentos: u64,
}
#[derive(Serialize)]
pub struct RankTipo {
    pub tipo: TipoEmenda,
    pub valor: i64,
    pub pagamentos: u64,
}

#[derive(Serialize)]
pub struct Janela {
    pub janela: &'static str,
    pub desde: u32,
    pub ate: u32,
    pub valor: i64,
    pub pagamentos: u64,
    pub tipos: Vec<RankTipo>,
    pub autores: Vec<RankAutor>,
    pub ufs: Vec<RankUf>,
    pub municipios: Vec<RankMun>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rankings {
    pub ultimo_mes: u32,
    pub janelas: Vec<Janela>,
}

/// Junta pagamentos repetidos (mesma emenda + favorecido + mês).
pub fn consolidar(ps: Vec<Pagamento>) -> Vec<Pagamento> {
    let mut m: HashMap<(u32, String, String), Pagamento> = HashMap::new();
    for p in ps {
        let k = (
            p.mes,
            p.codigo_emenda.clone(),
            p.favorecido.documento.clone(),
        );
        match m.get_mut(&k) {
            Some(a) => a.valor += p.valor,
            None => {
                m.insert(k, p);
            }
        }
    }
    let mut v: Vec<Pagamento> = m.into_values().collect();
    v.sort_by(|a, b| {
        b.mes
            .cmp(&a.mes)
            .then(b.valor.cmp(&a.valor))
            .then_with(|| a.codigo_emenda.cmp(&b.codigo_emenda))
            .then_with(|| a.favorecido.documento.cmp(&b.favorecido.documento))
    });
    v
}

#[derive(Default)]
struct Acc {
    valor: i64,
    n: u64,
}

fn add<K: Hash + Eq>(m: &mut HashMap<K, Acc>, k: K, v: i64) {
    let a = m.entry(k).or_default();
    a.valor += v;
    a.n += 1;
}

fn rank<K: Ord + Clone>(m: HashMap<K, Acc>, top: usize) -> Vec<(K, Acc)> {
    let mut v: Vec<(K, Acc)> = m.into_iter().collect();
    v.sort_by(|a, b| b.1.valor.cmp(&a.1.valor).then_with(|| a.0.cmp(&b.0)));
    v.truncate(top);
    v
}

pub fn janela(nome: &'static str, desde: u32, ate: u32, ps: &[&Pagamento]) -> Janela {
    let (mut tipos, mut aut, mut ufs, mut mun) = (
        HashMap::new(),
        HashMap::new(),
        HashMap::new(),
        HashMap::new(),
    );
    let mut nomes_aut: HashMap<&str, &str> = HashMap::new();
    let mut nomes_mun: HashMap<&str, (&str, &str)> = HashMap::new();
    let (mut valor, mut n) = (0, 0);
    for p in ps.iter().filter(|p| p.mes >= desde && p.mes <= ate) {
        valor += p.valor;
        n += 1;
        add(&mut tipos, p.tipo, p.valor);
        if crate::autor_valido(&p.autor.codigo) {
            nomes_aut.insert(&p.autor.codigo, &p.autor.nome);
            add(&mut aut, p.autor.codigo.as_str(), p.valor);
        }
        if let Some(uf) = uf_sigla_valida(&p.municipio.uf) {
            add(&mut ufs, uf, p.valor);
        }
        if let Some(i) = &p.municipio.ibge {
            nomes_mun.insert(i, (&p.municipio.nome, &p.municipio.uf));
            add(&mut mun, i.as_str(), p.valor);
        }
    }
    Janela {
        janela: nome,
        desde,
        ate,
        valor,
        pagamentos: n,
        tipos: rank(tipos, usize::MAX)
            .into_iter()
            .map(|(tipo, a)| RankTipo {
                tipo,
                valor: a.valor,
                pagamentos: a.n,
            })
            .collect(),
        autores: rank(aut, RANK_TOP)
            .into_iter()
            .map(|(c, a)| RankAutor {
                codigo: c.to_string(),
                nome: nomes_aut[c].to_string(),
                chave: chave_nome(nomes_aut[c]),
                valor: a.valor,
                pagamentos: a.n,
            })
            .collect(),
        ufs: rank(ufs, usize::MAX)
            .into_iter()
            .map(|(uf, a)| RankUf {
                uf: uf.to_string(),
                nome: uf_nome(uf).unwrap_or_default().to_string(),
                valor: a.valor,
                pagamentos: a.n,
            })
            .collect(),
        municipios: rank(mun, RANK_TOP)
            .into_iter()
            .map(|(i, a)| RankMun {
                ibge: i.to_string(),
                nome: nomes_mun[i].0.to_string(),
                uf: nomes_mun[i].1.to_string(),
                valor: a.valor,
                pagamentos: a.n,
            })
            .collect(),
    }
}

pub fn escrever(v1: &Path, brutos: Vec<Pagamento>) -> Result<()> {
    let Some(ultimo) = brutos.iter().map(|p| p.mes).max() else {
        return Ok(());
    };
    // rankings usam os pagamentos brutos (cada linha = um pagamento)
    let refs: Vec<&Pagamento> = brutos.iter().collect();
    write(
        &v1.join("rankings.json"),
        &Rankings {
            ultimo_mes: ultimo,
            janelas: JANELAS
                .iter()
                .map(|(nome, n)| janela(nome, mes_menos(ultimo, n - 1), ultimo, &refs))
                .collect(),
        },
    )?;
    drop(refs);

    let corte_arq = mes_menos(ultimo, ARQ_MESES - 1);
    let todos = consolidar(brutos.into_iter().filter(|p| p.mes >= corte_arq).collect());
    let mut por_mes: BTreeMap<u32, Vec<&Pagamento>> = BTreeMap::new();
    for p in &todos {
        por_mes.entry(p.mes).or_default().push(p);
    }
    let mut meses = Vec::new();
    let mut itens = Vec::new();
    let corte_feed = mes_menos(ultimo, FEED_MESES - 1);
    for (&mes, ps) in por_mes.iter().rev() {
        let r = MesResumo {
            mes,
            n: ps.len() as u64,
            valor: ps.iter().map(|p| p.valor).sum(),
        };
        meses.push(r);
        if mes >= corte_feed {
            itens.extend(ps.iter().take(FEED_POR_MES).copied());
        }
        write(
            &v1.join(format!("feed/{mes}.json")),
            &FeedMes {
                mes,
                n: r.n,
                valor: r.valor,
                truncado: ps.len() > ARQ_MAX,
                itens: ps.iter().take(ARQ_MAX).copied().collect(),
            },
        )?;
    }
    write(
        &v1.join("feed.json"),
        &Feed {
            ultimo_mes: ultimo,
            meses,
            itens,
        },
    )
}
