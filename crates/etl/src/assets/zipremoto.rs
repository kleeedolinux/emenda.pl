//! `Read + Seek` over HTTP range requests (block cache), so `zip::ZipArchive` can read
//! single members of the large TSE photo zips without downloading them.
use std::collections::{HashMap, VecDeque};
use std::io::{self, Read, Seek, SeekFrom};

const MAX_BLOCOS: usize = 64;

pub struct Faixas<F> {
    len: u64,
    pos: u64,
    bloco: u64,
    busca: F,
    cache: HashMap<u64, Vec<u8>>,
    ordem: VecDeque<u64>,
}

impl<F: FnMut(u64, u64) -> io::Result<Vec<u8>>> Faixas<F> {
    /// `busca(ini, fim)` returns bytes `ini..=fim`.
    pub fn new(len: u64, bloco: u64, busca: F) -> Self {
        Faixas {
            len,
            pos: 0,
            bloco: bloco.max(1),
            busca,
            cache: HashMap::new(),
            ordem: VecDeque::new(),
        }
    }

    fn bloco(&mut self, b: u64) -> io::Result<&[u8]> {
        if !self.cache.contains_key(&b) {
            let ini = b * self.bloco;
            let fim = (ini + self.bloco).min(self.len) - 1;
            let dados = (self.busca)(ini, fim)?;
            if dados.len() as u64 != fim - ini + 1 {
                return Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "faixa incompleta",
                ));
            }
            if self.ordem.len() >= MAX_BLOCOS {
                if let Some(old) = self.ordem.pop_front() {
                    self.cache.remove(&old);
                }
            }
            self.ordem.push_back(b);
            self.cache.insert(b, dados);
        }
        Ok(&self.cache[&b])
    }
}

impl<F: FnMut(u64, u64) -> io::Result<Vec<u8>>> Read for Faixas<F> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.pos >= self.len || buf.is_empty() {
            return Ok(0);
        }
        let (b, off) = (self.pos / self.bloco, (self.pos % self.bloco) as usize);
        let bloco = self.bloco(b)?;
        let n = buf.len().min(bloco.len() - off);
        buf[..n].copy_from_slice(&bloco[off..off + n]);
        self.pos += n as u64;
        Ok(n)
    }
}

impl<F: FnMut(u64, u64) -> io::Result<Vec<u8>>> Seek for Faixas<F> {
    fn seek(&mut self, p: SeekFrom) -> io::Result<u64> {
        let novo = match p {
            SeekFrom::Start(n) => n as i128,
            SeekFrom::End(d) => self.len as i128 + d as i128,
            SeekFrom::Current(d) => self.pos as i128 + d as i128,
        };
        if novo < 0 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "seek negativo"));
        }
        self.pos = novo as u64;
        Ok(self.pos)
    }
}
