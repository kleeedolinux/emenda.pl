//! Name index `indice/nomes/{a-z}.json`: `{slug: [[uf, chave], ...]}` for people without an id
//! on the page (autores, estaduais). The Worker serves `foto/nome/{UF}/{slug}-{size}.{ext}` from it.
use crate::norm::chave_nome;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Nome {
    pub nome: String,
    pub uf: Option<String>,
    /// Photo key, e.g. `foto/deputado/1`.
    pub chave: String,
}

/// `chaveNome` lowercased, spaces -> `-` (same in `apps/web/src/lib/cdn.ts`).
pub fn slug(nome: &str) -> String {
    chave_nome(nome).to_lowercase().replace(' ', "-")
}

/// Only keys present in the mirror; entries keep input order (priority), deduped.
pub fn indice(nomes: &[Nome], presentes: &BTreeSet<String>) -> BTreeMap<String, String> {
    let mut por: BTreeMap<String, BTreeMap<String, Vec<(String, String)>>> = BTreeMap::new();
    for n in nomes {
        if !presentes.contains(&n.chave) {
            continue;
        }
        let s = slug(&n.nome);
        let Some(c) = s.chars().next() else { continue };
        let e = por
            .entry(format!("indice/nomes/{c}.json"))
            .or_default()
            .entry(s)
            .or_default();
        let par = (n.uf.clone().unwrap_or_default(), n.chave.clone());
        if !e.contains(&par) {
            e.push(par);
        }
    }
    por.into_iter()
        .map(|(f, m)| {
            let mut s = serde_json::to_string(&m).expect("index serializes");
            s.push('\n');
            (f, s)
        })
        .collect()
}
