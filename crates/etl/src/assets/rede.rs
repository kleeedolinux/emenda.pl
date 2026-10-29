//! Blocking HTTP with timeouts, retries and conditional requests.
use super::plano::{Condicional, Resposta};
use super::USER_AGENT;
use serde_json::Value;
use std::io::Read;
use std::time::Duration;

#[derive(Debug)]
pub enum Erro {
    /// Body larger than the cap (bytes seen, at least).
    Grande(u64),
    Status(u16),
    Rede(String),
}

impl std::fmt::Display for Erro {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Erro::Grande(n) => write!(f, "arquivo grande demais ({n} bytes)"),
            Erro::Status(s) => write!(f, "HTTP {s}"),
            Erro::Rede(e) => write!(f, "rede: {e}"),
        }
    }
}

impl std::error::Error for Erro {}

pub struct Http {
    agent: ureq::Agent,
    tentativas: u32,
}

impl Default for Http {
    fn default() -> Self {
        Self::new()
    }
}

fn header(r: &ureq::Response, k: &str) -> Option<String> {
    r.header(k).map(str::to_string).filter(|v| !v.is_empty())
}

impl Http {
    pub fn new() -> Self {
        Http {
            agent: ureq::AgentBuilder::new()
                .user_agent(USER_AGENT)
                .timeout_connect(Duration::from_secs(20))
                .timeout_read(Duration::from_secs(60))
                .timeout(Duration::from_secs(300))
                .redirects(5)
                .build(),
            tentativas: 4,
        }
    }

    /// Retries transport errors, 429 and 5xx with exponential backoff (1s, 2s, 4s).
    fn retry<T>(&self, f: impl Fn() -> Result<T, Erro>) -> Result<T, Erro> {
        let mut n = 0;
        loop {
            match f() {
                Err(Erro::Rede(_)) | Err(Erro::Status(429 | 500..=599))
                    if n + 1 < self.tentativas =>
                {
                    std::thread::sleep(Duration::from_secs(1 << n));
                    n += 1;
                }
                r => return r,
            }
        }
    }

    fn call(&self, req: ureq::Request) -> Result<ureq::Response, Erro> {
        match req.call() {
            Ok(r) => Ok(r),
            Err(ureq::Error::Status(s, _)) => Err(Erro::Status(s)),
            Err(e) => Err(Erro::Rede(e.to_string())),
        }
    }

    pub fn json(&self, url: &str) -> Result<Value, Erro> {
        self.retry(|| {
            let r = self.call(self.agent.get(url).set("Accept", "application/json"))?;
            serde_json::from_reader(r.into_reader()).map_err(|e| Erro::Rede(e.to_string()))
        })
    }

    /// GET with `If-None-Match` / `If-Modified-Since`; body capped at `max` bytes.
    pub fn baixar(
        &self,
        url: &str,
        cond: Option<&Condicional>,
        max: u64,
    ) -> Result<Resposta, Erro> {
        self.retry(|| {
            let mut req = self.agent.get(url);
            if let Some(c) = cond {
                if let Some(e) = &c.etag {
                    req = req.set("If-None-Match", e);
                }
                if let Some(m) = &c.modificado {
                    req = req.set("If-Modified-Since", m);
                }
            }
            let r = self.call(req)?;
            let etag = header(&r, "ETag");
            let modificado = header(&r, "Last-Modified");
            match r.status() {
                304 => return Ok(Resposta::NaoModificado { etag, modificado }),
                200 => {}
                s => return Err(Erro::Status(s)),
            }
            if let Some(n) = header(&r, "Content-Length").and_then(|v| v.parse::<u64>().ok()) {
                if n > max {
                    return Err(Erro::Grande(n));
                }
            }
            let mut dados = Vec::new();
            r.into_reader()
                .take(max + 1)
                .read_to_end(&mut dados)
                .map_err(|e| Erro::Rede(e.to_string()))?;
            if dados.len() as u64 > max {
                return Err(Erro::Grande(dados.len() as u64));
            }
            Ok(Resposta::Corpo {
                dados,
                etag,
                modificado,
            })
        })
    }

    /// Version probe via a 1-byte suffix range -> (total length, ETag). HEAD is not used:
    /// the TSE CDN can answer HEAD and GET from different file versions.
    pub fn cabecalho(&self, url: &str) -> Result<(u64, Option<String>), Erro> {
        self.retry(|| {
            let r = self.call(
                self.agent
                    .get(url)
                    .set("Accept-Encoding", "identity")
                    .set("Range", "bytes=-1"),
            )?;
            if r.status() != 206 {
                return Err(Erro::Status(r.status()));
            }
            let total = header(&r, "Content-Range")
                .and_then(|v| total_content_range(&v))
                .ok_or_else(|| Erro::Rede("sem Content-Range".into()))?;
            Ok((total, header(&r, "ETag")))
        })
    }

    /// Bytes `ini..=fim` of the version `etag` (expects 206 with the same ETag; else retried).
    pub fn faixa(
        &self,
        url: &str,
        ini: u64,
        fim: u64,
        etag: Option<&str>,
    ) -> Result<Vec<u8>, Erro> {
        self.retry(|| {
            let r = self.call(
                self.agent
                    .get(url)
                    .set("Accept-Encoding", "identity")
                    .set("Range", &format!("bytes={ini}-{fim}")),
            )?;
            if r.status() != 206 {
                return Err(Erro::Status(r.status()));
            }
            if etag.is_some() && header(&r, "ETag").as_deref() != etag {
                return Err(Erro::Rede("versão do arquivo mudou entre faixas".into()));
            }
            let mut dados = Vec::new();
            r.into_reader()
                .take(fim - ini + 1)
                .read_to_end(&mut dados)
                .map_err(|e| Erro::Rede(e.to_string()))?;
            Ok(dados)
        })
    }
}

/// `bytes 0-0/12345` -> 12345.
pub fn total_content_range(v: &str) -> Option<u64> {
    v.rsplit_once('/')?.1.trim().parse().ok()
}
