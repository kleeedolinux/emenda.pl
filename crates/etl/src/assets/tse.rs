//! TSE `consulta_cand_{ano}`: elected candidates (photos via the per-UF zips).
use super::fontes::{Alvo, FotoTse};
use crate::read::Rows;
use anyhow::Result;
use std::collections::BTreeMap;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Eleito {
    pub foto: FotoTse,
    pub cargo: String,
    /// Civil and ballot names.
    pub nomes: Vec<String>,
}

/// Cargos without a Câmara/Senado id on the site (plus senators/deputies as name fallback).
fn cargo_ok(c: &str) -> bool {
    c.contains("SUPLENTE")
        || matches!(
            c,
            "DEPUTADO FEDERAL"
                | "DEPUTADO ESTADUAL"
                | "DEPUTADO DISTRITAL"
                | "SENADOR"
                | "GOVERNADOR"
                | "VICE-GOVERNADOR"
        )
}

fn fontes_csv(p: &Path, ano: u16) -> Result<Vec<Box<dyn Read>>> {
    let prefixo = format!("consulta_cand_{ano}");
    let mut out: Vec<Box<dyn Read>> = Vec::new();
    if p.is_dir() {
        let mut files: Vec<_> = std::fs::read_dir(p)?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|f| {
                f.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with(&prefixo) && n.ends_with(".csv"))
            })
            .collect();
        files.sort();
        for f in files {
            out.push(Box::new(std::io::BufReader::new(std::fs::File::open(f)?)));
        }
    } else {
        let mut z = zip::ZipArchive::new(std::fs::File::open(p)?)?;
        let names: Vec<String> = z
            .file_names()
            .filter(|n| n.ends_with(".csv") && !n.ends_with("_BRASIL.csv"))
            .map(str::to_string)
            .collect();
        for n in names {
            let mut buf = Vec::new();
            z.by_name(&n)?.read_to_end(&mut buf)?;
            out.push(Box::new(std::io::Cursor::new(buf)));
        }
    }
    Ok(out)
}

/// Elected (`DS_SIT_TOT_TURNO` starts with `ELEITO`) in the selected cargos, by SQ, one per SQ.
pub fn eleitos(p: &Path, ano: u16) -> Result<Vec<Eleito>> {
    let mut m: BTreeMap<u64, Eleito> = BTreeMap::new();
    for s in fontes_csv(p, ano)? {
        let mut r = Rows::new(s)?;
        while r.advance()? {
            let cargo = r.get("DS_CARGO");
            let uf = r.get("SG_UF");
            if !r.get("DS_SIT_TOT_TURNO").starts_with("ELEITO")
                || !cargo_ok(&cargo)
                || uf.len() != 2
                || uf == "BR"
            {
                continue;
            }
            let Ok(sq) = r.get("SQ_CANDIDATO").parse::<u64>() else {
                continue;
            };
            let mut nomes = Vec::new();
            for k in ["NM_CANDIDATO", "NM_URNA_CANDIDATO", "NM_SOCIAL_CANDIDATO"] {
                let n = r.get(k);
                if !n.is_empty() && n != "#NULO#" && !nomes.contains(&n) {
                    nomes.push(n);
                }
            }
            m.entry(sq).or_insert(Eleito {
                foto: FotoTse {
                    alvo: Alvo::CandidatoTse(ano, sq),
                    ano,
                    uf,
                    sq,
                },
                cargo,
                nomes,
            });
        }
    }
    Ok(m.into_values().collect())
}
