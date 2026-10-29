//! Photo coverage per category: people the site renders vs. mirrored photos (id path or name index).
use super::nomes::slug;
use crate::norm::chave_nome;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone)]
pub struct Pessoa {
    pub categoria: &'static str,
    pub nome: String,
    pub uf: Option<String>,
    /// Id-based photo key (e.g. `foto/deputado/1`), when the page has an id.
    pub chave: Option<String>,
    /// Photo shown before the mirror (official URL worked / page linked a photo).
    pub antes: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Linha {
    pub categoria: &'static str,
    pub total: usize,
    pub antes: usize,
    pub depois: usize,
}

/// Same rule as `tipoAutor` (web): bancadas, comissões and relator are not people.
pub fn eh_pessoa(nome: &str) -> bool {
    let n = chave_nome(nome);
    !(n.starts_with("BANCADA")
        || n.starts_with("COMISSAO")
        || n.starts_with("COM ")
        || n.contains("RELATOR"))
}

/// Same resolution as the Worker `resolver_alias`.
fn por_nome<'a>(
    indice: &'a BTreeMap<String, Vec<(String, String)>>,
    nome: &str,
    uf: Option<&str>,
) -> Option<&'a str> {
    let e = indice.get(&slug(nome))?;
    match uf {
        Some(u) => e
            .iter()
            .find(|(x, _)| x == u)
            .or_else(|| e.iter().find(|(x, _)| x.is_empty()))
            .map(|(_, c)| c.as_str()),
        None => {
            let u0 = &e.first()?.0;
            e.iter().all(|(x, _)| x == u0).then(|| e[0].1.as_str())
        }
    }
}

pub fn medir(
    pessoas: &[Pessoa],
    presentes: &BTreeSet<String>,
    indice: &BTreeMap<String, Vec<(String, String)>>,
) -> Vec<Linha> {
    let mut out: Vec<Linha> = Vec::new();
    for p in pessoas {
        let tem = p.chave.as_ref().is_some_and(|c| presentes.contains(c))
            || por_nome(indice, &p.nome, p.uf.as_deref()).is_some_and(|c| presentes.contains(c));
        let l = match out.iter_mut().find(|l| l.categoria == p.categoria) {
            Some(l) => l,
            None => {
                out.push(Linha {
                    categoria: p.categoria,
                    total: 0,
                    antes: 0,
                    depois: 0,
                });
                out.last_mut().expect("just pushed")
            }
        };
        l.total += 1;
        l.antes += usize::from(p.antes);
        l.depois += usize::from(tem);
    }
    out
}
