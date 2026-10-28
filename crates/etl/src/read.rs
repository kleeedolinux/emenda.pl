//! Leitura das fontes (CSV Latin-1 `;`, JSON IBGE, ZIP/CSV TSE).

use crate::model::{Convenio, Prefeito, Vice};
use crate::norm::{chave_municipio, uf_de_codigo};
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;

/// Registro CSV decodificado (windows-1252 ⊇ Latin-1), acessado por nome de coluna.
pub struct Rows {
    rdr: csv::Reader<Box<dyn Read>>,
    idx: HashMap<String, usize>,
    rec: csv::ByteRecord,
}

impl Rows {
    pub fn new(r: Box<dyn Read>) -> Result<Self> {
        let mut rdr = csv::ReaderBuilder::new()
            .delimiter(b';')
            .flexible(true)
            .from_reader(r);
        let idx = rdr
            .byte_headers()?
            .iter()
            .enumerate()
            .map(|(i, h)| (dec(h).trim().to_string(), i))
            .collect();
        Ok(Self {
            rdr,
            idx,
            rec: csv::ByteRecord::new(),
        })
    }
    pub fn open(p: &Path) -> Result<Self> {
        let f = std::fs::File::open(p).with_context(|| format!("abrindo {}", p.display()))?;
        Self::new(Box::new(std::io::BufReader::with_capacity(1 << 20, f)))
    }
    pub fn advance(&mut self) -> Result<bool> {
        Ok(self.rdr.read_byte_record(&mut self.rec)?)
    }
    pub fn get(&self, col: &str) -> String {
        self.idx
            .get(col)
            .and_then(|&i| self.rec.get(i))
            .map(|b| dec(b).trim().to_string())
            .unwrap_or_default()
    }
}

fn dec(b: &[u8]) -> std::borrow::Cow<'_, str> {
    encoding_rs::WINDOWS_1252.decode_without_bom_handling(b).0
}

pub struct IbgeMun {
    pub ibge: String,
    pub nome: String,
    pub uf: &'static str,
}

/// Lista de municípios da API de localidades do IBGE.
pub fn ibge(p: &Path) -> Result<Vec<IbgeMun>> {
    let v: serde_json::Value = serde_json::from_slice(&std::fs::read(p)?)?;
    let mut out = Vec::new();
    for m in v.as_array().context("IBGE: esperado array")? {
        let ibge = m["id"]
            .as_u64()
            .map(|i| i.to_string())
            .or_else(|| m["id"].as_str().map(str::to_string))
            .context("IBGE id")?;
        let Some(uf) = uf_de_codigo(&ibge) else {
            continue;
        };
        out.push(IbgeMun {
            nome: m["nome"].as_str().unwrap_or_default().to_string(),
            uf,
            ibge,
        });
    }
    Ok(out)
}

/// "SÃO PAULO - SP" -> ("SÃO PAULO", "SP").
pub fn localidade_municipio(loc: &str) -> Option<(&str, &str)> {
    let (n, uf) = loc.rsplit_once(" - ")?;
    (uf.len() == 2).then_some((n.trim(), uf.trim()))
}

/// "06/01/2024" -> "2024-01-06".
pub fn data_iso(d: &str) -> String {
    let p: Vec<&str> = d.split('/').collect();
    if p.len() == 3 {
        format!("{}-{}-{}", p[2], p[1], p[0])
    } else {
        d.to_string()
    }
}

pub fn convenios(
    p: &Path,
    mun: &HashMap<String, String>,
) -> Result<HashMap<String, Vec<Convenio>>> {
    let mut r = Rows::open(p)?;
    let mut out: HashMap<String, Vec<Convenio>> = HashMap::new();
    while r.advance()? {
        let loc = r.get("Localidade do gasto");
        let Some(ibge) =
            localidade_municipio(&loc).and_then(|(n, uf)| mun.get(&chave_municipio(n, uf)))
        else {
            continue;
        };
        out.entry(ibge.clone()).or_default().push(Convenio {
            numero: r.get("Número Convênio"),
            objeto: r.get("Objeto Convênio"),
            convenente: r.get("Convenente"),
            data: data_iso(&r.get("Data Publicação Convênio")),
            valor: crate::norm::parse_valor_br(&r.get("Valor Convênio")),
            emenda: r.get("Código da Emenda"),
        });
    }
    Ok(out)
}

/// Grafias do TSE que divergem do IBGE (nome TSE sem acento, UF) -> nome IBGE.
const ALIAS_TSE: [(&str, &str, &str); 5] = [
    ("CAMACA", "BA", "Camacan"),
    ("ALVORADA DO OESTE", "RO", "Alvorada D'Oeste"),
    ("ESPIGAO DO OESTE", "RO", "Espigão D'Oeste"),
    ("BOA SAUDE", "RN", "Januário Cicco"),
    ("SAO THOME DAS LETRAS", "MG", "São Tomé das Letras"),
];

/// Chave de município para um nome do TSE, aplicando aliases conhecidos.
pub fn chave_tse(nome: &str, uf: &str) -> String {
    let n = crate::norm::chave_nome(nome);
    let nome = ALIAS_TSE
        .iter()
        .find(|a| a.0 == n && a.1 == uf)
        .map_or(nome, |a| a.2);
    chave_municipio(nome, uf)
}

pub struct Tse {
    pub por_ibge: HashMap<String, Prefeito>,
    pub sem_ibge: usize,
}

/// Prefeitos eleitos em 2024 (última eleição/turno vence: suplementar > 2º turno > 1º).
pub fn tse(p: &Path, mun: &HashMap<String, String>) -> Result<Tse> {
    let mut sources: Vec<Box<dyn Read>> = Vec::new();
    if p.is_dir() {
        let mut files: Vec<_> = std::fs::read_dir(p)?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|f| {
                f.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with("consulta_cand_2024") && n.ends_with(".csv"))
            })
            .collect();
        if let Some(b) = files
            .iter()
            .find(|f| f.to_string_lossy().ends_with("_BRASIL.csv"))
            .cloned()
        {
            files = vec![b];
        }
        for f in files {
            sources.push(Box::new(std::io::BufReader::new(std::fs::File::open(f)?)));
        }
    } else {
        let mut z = zip::ZipArchive::new(std::fs::File::open(p)?)?;
        let names: Vec<String> = z
            .file_names()
            .filter(|n| n.ends_with(".csv"))
            .map(str::to_string)
            .collect();
        let pick: Vec<String> = match names.iter().find(|n| n.ends_with("_BRASIL.csv")) {
            Some(b) => vec![b.clone()],
            None => names,
        };
        for n in pick {
            let mut buf = Vec::new();
            z.by_name(&n)?.read_to_end(&mut buf)?;
            sources.push(Box::new(std::io::Cursor::new(buf)));
        }
    }
    // chave (ue, eleição, turno, número) -> vice
    let mut vices: HashMap<(String, String, String, String), Vice> = HashMap::new();
    // ue -> (ordem, chave, uf, nome_ue, prefeito)
    type Best = (
        (String, String, u8),
        (String, String, String, String),
        String,
        String,
        Prefeito,
    );
    let mut best: HashMap<String, Best> = HashMap::new();
    for s in sources {
        let mut r = Rows::new(s)?;
        while r.advance()? {
            let cargo = r.get("DS_CARGO");
            let ue = r.get("SG_UE");
            let turno = r.get("NR_TURNO");
            let k = (
                ue.clone(),
                r.get("CD_ELEICAO"),
                turno.clone(),
                r.get("NR_CANDIDATO"),
            );
            if cargo == "VICE-PREFEITO" {
                vices.insert(
                    k,
                    Vice {
                        nome: r.get("NM_URNA_CANDIDATO"),
                        partido: r.get("SG_PARTIDO"),
                    },
                );
                continue;
            }
            let sit = r.get("DS_SIT_TOT_TURNO");
            if cargo != "PREFEITO" || !sit.starts_with("ELEITO") {
                continue;
            }
            let d = data_iso(&r.get("DT_ELEICAO"));
            let ord = (d, r.get("CD_ELEICAO"), turno.parse().unwrap_or(0));
            if best.get(&ue).is_some_and(|b| b.0 >= ord) {
                continue;
            }
            let pf = Prefeito {
                nome: r.get("NM_URNA_CANDIDATO"),
                partido: r.get("SG_PARTIDO"),
                eleicao: 2024,
                situacao: sit,
                vice: None,
            };
            best.insert(ue, (ord, k, r.get("SG_UF"), r.get("NM_UE"), pf));
        }
    }
    let mut out = Tse {
        por_ibge: HashMap::new(),
        sem_ibge: 0,
    };
    for (_, (_, k, uf, nome, mut pf)) in best {
        let Some(ibge) = mun.get(&chave_tse(&nome, &uf)) else {
            out.sem_ibge += 1;
            eprintln!("TSE sem IBGE: {nome} - {uf}");
            continue;
        };
        pf.vice = vices.remove(&k);
        out.por_ibge.insert(ibge.clone(), pf);
    }
    Ok(out)
}
