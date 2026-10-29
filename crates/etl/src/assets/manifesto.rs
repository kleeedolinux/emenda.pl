//! `manifest.json` of the `assets` branch. Stable order; `gerado` only moves when items change.
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tipo {
    Foto,
    Logo,
    Pdf,
    Bandeira,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Item {
    /// e.g. `foto/deputado/204554`.
    pub chave: String,
    /// Upstream URL.
    pub origem: String,
    pub tipo: Tipo,
    /// Upstream byte length.
    pub bytes: u64,
    /// SHA-256 (hex) of the upstream bytes.
    pub sha256: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub etag: Option<String>,
    /// Upstream `Last-Modified`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modificado: Option<String>,
    /// Paths written in the branch.
    pub variantes: Vec<String>,
    /// Source license when not an official government work (e.g. Wikimedia Commons).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub licenca: Option<String>,
    /// Author (Commons `Artist`, plain text).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub autor: Option<String>,
    /// Source description page (Commons).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pagina: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Manifesto {
    pub gerado: String,
    pub itens: Vec<Item>,
}

impl Manifesto {
    /// Sorts by `chave`; keeps the previous `gerado` when items are unchanged.
    pub fn finalizar(anterior: Option<&Manifesto>, mut itens: Vec<Item>, agora: &str) -> Self {
        itens.sort_by(|a, b| a.chave.cmp(&b.chave));
        itens.dedup_by(|a, b| a.chave == b.chave);
        let gerado = match anterior {
            Some(a) if a.itens == itens => a.gerado.clone(),
            _ => agora.to_string(),
        };
        Manifesto { gerado, itens }
    }

    pub fn mudou_de(&self, anterior: Option<&Manifesto>) -> bool {
        anterior.is_none_or(|a| a.itens != self.itens)
    }

    pub fn to_json(&self) -> String {
        let mut s = serde_json::to_string_pretty(self).expect("manifest serializes");
        s.push('\n');
        s
    }

    pub fn ler(path: &Path) -> Option<Self> {
        serde_json::from_slice(&std::fs::read(path).ok()?).ok()
    }

    pub fn item(&self, chave: &str) -> Option<&Item> {
        self.itens
            .binary_search_by(|i| i.chave.as_str().cmp(chave))
            .ok()
            .map(|i| &self.itens[i])
    }
}

/// Variant paths present in `anterior` but not in `novo` (to delete).
pub fn orfaos(anterior: &Manifesto, novo: &Manifesto) -> Vec<String> {
    let vivos: BTreeSet<&str> = novo
        .itens
        .iter()
        .flat_map(|i| i.variantes.iter().map(String::as_str))
        .collect();
    let mut v: Vec<String> = anterior
        .itens
        .iter()
        .flat_map(|i| i.variantes.iter())
        .filter(|p| !vivos.contains(p.as_str()))
        .cloned()
        .collect();
    v.sort();
    v.dedup();
    v
}
