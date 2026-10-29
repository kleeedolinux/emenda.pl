//! Per-item decisions (mode, conditional request, sha skip) and size caps. Pure.
use super::imagem::sha256_hex;
use super::manifesto::Item;
use std::str::FromStr;

/// `incremental`: only items missing from the previous manifest (daily).
/// `completo`: re-validate everything with conditional requests (monthly).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Modo {
    Incremental,
    Completo,
}

impl FromStr for Modo {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "incremental" => Ok(Modo::Incremental),
            "completo" => Ok(Modo::Completo),
            _ => Err(format!("modo inválido: {s} (incremental|completo)")),
        }
    }
}

/// Validators for `If-None-Match` / `If-Modified-Since`.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Condicional {
    pub etag: Option<String>,
    pub modificado: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Plano {
    /// Keep the previous item and files; no request.
    Manter,
    /// Download (conditionally when validators are given).
    Baixar(Option<Condicional>),
}

/// `origem`: upstream URL if already known (None = not resolved yet, e.g. a Câmara detail).
/// `arquivos_ok`: every previous variant exists on disk.
pub fn planejar(
    modo: Modo,
    origem: Option<&str>,
    anterior: Option<&Item>,
    arquivos_ok: bool,
) -> Plano {
    let Some(a) = anterior.filter(|_| arquivos_ok) else {
        return Plano::Baixar(None);
    };
    if origem.is_some_and(|o| o != a.origem) {
        return Plano::Baixar(None);
    }
    match modo {
        Modo::Incremental => Plano::Manter,
        Modo::Completo => Plano::Baixar(Some(Condicional {
            etag: a.etag.clone(),
            modificado: a.modificado.clone(),
        })),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Resposta {
    /// 304.
    NaoModificado {
        etag: Option<String>,
        modificado: Option<String>,
    },
    /// 200 with the full body.
    Corpo {
        dados: Vec<u8>,
        etag: Option<String>,
        modificado: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decisao {
    /// Same content: keep files, refresh validators.
    Reaproveitar(Box<Item>),
    /// New or changed content: encode and write.
    Gerar,
    /// 304 without a previous item: nothing usable.
    Falha,
}

/// `anterior` must only be passed when its files exist.
pub fn decidir(anterior: Option<&Item>, resp: &Resposta) -> Decisao {
    let atualiza = |a: &Item, etag: &Option<String>, modificado: &Option<String>| {
        let mut i = a.clone();
        if etag.is_some() {
            i.etag = etag.clone();
        }
        if modificado.is_some() {
            i.modificado = modificado.clone();
        }
        Decisao::Reaproveitar(Box::new(i))
    };
    match (resp, anterior) {
        (Resposta::NaoModificado { etag, modificado }, Some(a)) => atualiza(a, etag, modificado),
        (Resposta::NaoModificado { .. }, None) => Decisao::Falha,
        (
            Resposta::Corpo {
                dados,
                etag,
                modificado,
            },
            Some(a),
        ) if sha256_hex(dados) == a.sha256 => atualiza(a, etag, modificado),
        (Resposta::Corpo { .. }, _) => Decisao::Gerar,
    }
}

/// Output size budget: single-file cap + total branch cap.
#[derive(Debug, Clone)]
pub struct Orcamento {
    max_total: u64,
    max_arquivo: u64,
    usado: u64,
}

impl Orcamento {
    pub fn new(max_total: u64, max_arquivo: u64) -> Self {
        Orcamento {
            max_total,
            max_arquivo,
            usado: 0,
        }
    }
    pub fn arquivo_ok(&self, n: u64) -> bool {
        n <= self.max_arquivo
    }
    pub fn max_arquivo(&self) -> u64 {
        self.max_arquivo
    }
    /// Reserves `n` bytes if it fits under the total cap.
    pub fn reservar(&mut self, n: u64) -> bool {
        if self.usado + n > self.max_total {
            return false;
        }
        self.usado += n;
        true
    }
    /// Counts bytes that are kept regardless of the cap.
    pub fn contar(&mut self, n: u64) {
        self.usado += n;
    }
    pub fn usado(&self) -> u64 {
        self.usado
    }
}
