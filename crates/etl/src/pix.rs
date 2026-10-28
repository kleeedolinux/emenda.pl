//! v1/pix.json + v1/pix/<ano>.json — Emendas Pix (Transferências Especiais, EC 105/2019).

use crate::model::{Ano, AutorRef, AutorResumo, Com, EmendaItem, Totais, UfNome};
use crate::norm::{uf_nome, TipoEmenda};
use crate::{agrupa, autores, por_ano, por_pago, totais, write};
use anyhow::Result;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::Path;

pub const TOP: usize = 100;

#[derive(Serialize)]
pub struct MunUf {
    pub ibge: String,
    pub nome: String,
    pub uf: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pix {
    pub totais: Totais,
    pub anos: Vec<u16>,
    pub por_ano: Vec<Com<Ano>>,
    pub por_uf: Vec<Com<UfNome>>,
    pub municipios: Vec<Com<MunUf>>,
    pub autores: Vec<AutorResumo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PixItem<'a> {
    pub codigo: &'a str,
    pub numero: &'a str,
    pub autor: &'a AutorRef,
    pub localidade: &'a str,
    pub ibge: Option<&'a str>,
    pub uf: Option<&'a str>,
    pub funcao: &'a str,
    pub empenhado: i64,
    pub pago: i64,
    pub rap_pago: i64,
}

#[derive(Serialize)]
pub struct PixAno<'a> {
    pub ano: u16,
    pub totais: Totais,
    pub itens: Vec<PixItem<'a>>,
}

pub fn escrever(
    v1: &Path,
    emendas: &[EmendaItem],
    nome_mun: impl Fn(&str) -> Option<String>,
) -> Result<()> {
    let pix: Vec<&EmendaItem> = emendas
        .iter()
        .filter(|e| e.tipo == TipoEmenda::Pix)
        .collect();
    let mut por: BTreeMap<u16, Vec<&EmendaItem>> = BTreeMap::new();
    for e in &pix {
        por.entry(e.ano).or_default().push(e);
    }
    let mut municipios: Vec<Com<MunUf>> = por_pago(agrupa(pix.iter().copied(), |e| e.ibge.clone()))
        .into_iter()
        .map(|(ibge, t)| Com {
            k: MunUf {
                nome: nome_mun(&ibge).unwrap_or_default(),
                uf: crate::norm::uf_de_codigo(&ibge)
                    .unwrap_or_default()
                    .to_string(),
                ibge,
            },
            t,
        })
        .collect();
    municipios.truncate(TOP);
    let mut aut = autores(pix.iter().copied());
    aut.truncate(TOP);
    write(
        &v1.join("pix.json"),
        &Pix {
            totais: totais(pix.iter().copied()),
            anos: por.keys().copied().collect(),
            por_ano: por_ano(pix.iter().copied()),
            por_uf: por_pago(agrupa(pix.iter().copied(), |e| e.uf.clone()))
                .into_iter()
                .map(|(uf, t)| Com {
                    k: UfNome {
                        nome: uf_nome(&uf).unwrap_or_default().to_string(),
                        uf,
                    },
                    t,
                })
                .collect(),
            municipios,
            autores: aut,
        },
    )?;
    for (ano, es) in por {
        write(
            &v1.join(format!("pix/{ano}.json")),
            &PixAno {
                ano,
                totais: totais(es.iter().copied()),
                itens: es
                    .iter()
                    .map(|e| PixItem {
                        codigo: &e.codigo,
                        numero: &e.numero,
                        autor: &e.autor,
                        localidade: &e.localidade,
                        ibge: e.ibge.as_deref(),
                        uf: e.uf.as_deref(),
                        funcao: &e.funcao,
                        empenhado: e.empenhado,
                        pago: e.pago,
                        rap_pago: e.rap_pago,
                    })
                    .collect(),
            },
        )?;
    }
    Ok(())
}
