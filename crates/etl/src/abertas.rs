//! v1/abertas.json — dinheiro empenhado (reservado) que ainda não foi pago nem cancelado.

use crate::model::{AutorRef, EmendaItem};
use crate::norm::{saldo_aberto, uf_nome, TipoEmenda};
use crate::write;
use anyhow::Result;
use serde::Serialize;
use std::collections::HashMap;
use std::hash::Hash;
use std::path::Path;

pub const TOP: usize = 300;

#[derive(Serialize, Default, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct TotaisAbertas {
    pub n: u64,
    pub empenhado: i64,
    pub pago: i64,
    pub rap_pago: i64,
    pub rap_cancelado: i64,
    pub aberto: i64,
}

#[derive(Serialize, Default, Clone, Copy)]
pub struct Saldo {
    pub n: u64,
    pub aberto: i64,
}

#[derive(Serialize)]
pub struct Com<K: Serialize> {
    #[serde(flatten)]
    pub k: K,
    #[serde(flatten)]
    pub s: Saldo,
}

#[derive(Serialize)]
pub struct KTipo {
    pub tipo: TipoEmenda,
}
#[derive(Serialize)]
pub struct KAno {
    pub ano: u16,
}
#[derive(Serialize)]
pub struct KUf {
    pub uf: String,
    pub nome: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemAberto<'a> {
    pub codigo: &'a str,
    pub numero: &'a str,
    pub ano: u16,
    pub tipo: TipoEmenda,
    pub autor: &'a AutorRef,
    pub localidade: &'a str,
    pub ibge: Option<&'a str>,
    pub uf: Option<&'a str>,
    pub funcao: &'a str,
    pub empenhado: i64,
    pub pago: i64,
    pub rap_pago: i64,
    pub aberto: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Abertas<'a> {
    pub totais: TotaisAbertas,
    pub por_tipo: Vec<Com<KTipo>>,
    pub por_ano: Vec<Com<KAno>>,
    pub por_uf: Vec<Com<KUf>>,
    pub top: Vec<ItemAberto<'a>>,
}

pub fn aberto(e: &EmendaItem) -> i64 {
    saldo_aberto(e.empenhado, e.pago, e.rap_pago, e.rap_cancelado)
}

fn soma<K: Hash + Eq>(
    es: &[(&EmendaItem, i64)],
    key: impl Fn(&EmendaItem) -> Option<K>,
) -> Vec<(K, Saldo)> {
    let mut m: HashMap<K, Saldo> = HashMap::new();
    for (e, a) in es {
        if let Some(k) = key(e) {
            let s = m.entry(k).or_default();
            s.n += 1;
            s.aberto += a;
        }
    }
    m.into_iter().collect()
}

fn desc<K: Ord>(mut v: Vec<(K, Saldo)>) -> Vec<(K, Saldo)> {
    v.sort_by(|a, b| b.1.aberto.cmp(&a.1.aberto).then_with(|| a.0.cmp(&b.0)));
    v
}

pub fn escrever(v1: &Path, emendas: &[EmendaItem]) -> Result<()> {
    let mut t = TotaisAbertas::default();
    let mut abertas: Vec<(&EmendaItem, i64)> = Vec::new();
    for e in emendas {
        let a = aberto(e);
        t.empenhado += e.empenhado;
        t.pago += e.pago;
        t.rap_pago += e.rap_pago;
        t.rap_cancelado += e.rap_cancelado;
        if a > 0 {
            t.n += 1;
            t.aberto += a;
            abertas.push((e, a));
        }
    }
    let mut por_ano = soma(&abertas, |e| Some(e.ano));
    por_ano.sort_by_key(|x| x.0);
    abertas.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.codigo.cmp(&b.0.codigo)));
    write(
        &v1.join("abertas.json"),
        &Abertas {
            totais: t,
            por_tipo: desc(soma(&abertas, |e| Some(e.tipo)))
                .into_iter()
                .map(|(tipo, s)| Com {
                    k: KTipo { tipo },
                    s,
                })
                .collect(),
            por_ano: por_ano
                .into_iter()
                .map(|(ano, s)| Com { k: KAno { ano }, s })
                .collect(),
            por_uf: desc(soma(&abertas, |e| e.uf.clone()))
                .into_iter()
                .map(|(uf, s)| Com {
                    k: KUf {
                        nome: uf_nome(&uf).unwrap_or_default().to_string(),
                        uf,
                    },
                    s,
                })
                .collect(),
            top: abertas
                .iter()
                .take(TOP)
                .map(|(e, a)| ItemAberto {
                    codigo: &e.codigo,
                    numero: &e.numero,
                    ano: e.ano,
                    tipo: e.tipo,
                    autor: &e.autor,
                    localidade: &e.localidade,
                    ibge: e.ibge.as_deref(),
                    uf: e.uf.as_deref(),
                    funcao: &e.funcao,
                    empenhado: e.empenhado,
                    pago: e.pago,
                    rap_pago: e.rap_pago,
                    aberto: *a,
                })
                .collect(),
        },
    )
}
