//! Orchestration: list sources, plan per item, download, encode, write, manifest.
use super::fontes::{self, Fonte, Origem, CAMARA, SENADO};
use super::imagem;
use super::manifesto::{orfaos, Item, Manifesto, Tipo};
use super::nomes::Nome;
use super::plano::{decidir, planejar, Decisao, Modo, Orcamento, Plano, Resposta};
use super::rede::{Erro, Http};
use anyhow::{bail, Context, Result};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

pub struct Opts {
    pub out: PathBuf,
    pub modo: Modo,
    /// `pautas.ts` (curated polêmicas). None -> skipped.
    pub pautas: Option<PathBuf>,
    pub tipos: Vec<Tipo>,
    /// Câmara legislaturas for deputy photos (current exercise is always included).
    pub legislaturas: Vec<u32>,
    /// Senado legislature range `(from, to)`.
    pub senado: (u32, u32),
    /// Frentes legislatura.
    pub frentes: u32,
    /// Months of plenary votações for inteiro teor PDFs.
    pub meses: i64,
    pub max_total: u64,
    pub max_arquivo: u64,
    pub concorrencia: usize,
    /// Cap on PDF sources (local runs). None = all.
    pub max_pdfs: Option<usize>,
    /// `consulta_cand_2024` (zip or dir) + IBGE municípios JSON -> prefeito/vice photos.
    pub tse: Option<(PathBuf, PathBuf)>,
    /// `consulta_cand_2022` (zip or dir) -> elected 2022 (estaduais, governadores, suplentes, name fallback).
    pub tse2022: Option<PathBuf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Estado {
    /// Kept without a request (incremental).
    Mantido,
    /// 304 or same sha256: files untouched.
    Inalterado,
    /// Encoded and written.
    Gerado,
    /// Over the single-file or total cap.
    Pulado,
    /// Error; previous item (if any) carried over.
    Falha,
}

#[derive(Debug, Default)]
pub struct Relatorio {
    /// (tipo, estado) -> count.
    pub contagem: BTreeMap<(Tipo, Estado), usize>,
    /// tipo -> (files, bytes) in the output.
    pub saida: BTreeMap<Tipo, (usize, u64)>,
    pub removidos: usize,
    pub manifesto_mudou: bool,
}

struct Ctx<'a> {
    o: &'a Opts,
    http: Http,
    anterior: Option<&'a Manifesto>,
    orcamento: Mutex<Orcamento>,
    feitos: AtomicUsize,
    total: usize,
    /// Commons attribution by item key (município flags/coats of arms).
    creditos: BTreeMap<String, fontes::Credito>,
}

/// Runs `f` over `itens` with `n` threads; output keeps input order.
fn paralelo<T: Sync, R: Send>(itens: &[T], n: usize, f: impl Fn(&T) -> R + Sync) -> Vec<R> {
    let idx = AtomicUsize::new(0);
    let out = Mutex::new(Vec::with_capacity(itens.len()));
    std::thread::scope(|s| {
        for _ in 0..n.clamp(1, 64) {
            s.spawn(|| loop {
                let i = idx.fetch_add(1, Ordering::Relaxed);
                let Some(t) = itens.get(i) else { break };
                let r = f(t);
                out.lock().unwrap().push((i, r));
            });
        }
    });
    let mut v = out.into_inner().unwrap();
    v.sort_by_key(|(i, _)| *i);
    v.into_iter().map(|(_, r)| r).collect()
}

/// Follows Câmara `links.next`.
fn camara_paginas(http: &Http, primeira: &str) -> Result<Vec<serde_json::Value>> {
    let mut url = Some(primeira.to_string());
    let mut out = Vec::new();
    while let Some(u) = url.take() {
        let v = http.json(&u).with_context(|| format!("listar {u}"))?;
        url = fontes::proximo(&v);
        out.push(v);
        if out.len() > 200 {
            bail!("paginação sem fim: {primeira}");
        }
    }
    Ok(out)
}

fn hoje_utc() -> ((i64, i64, i64), String) {
    let s = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let (dias, seg) = (s.div_euclid(86400), s.rem_euclid(86400));
    // civil_from_days (H. Hinnant)
    let z = dias + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    let iso = format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        seg / 3600,
        seg % 3600 / 60,
        seg % 60
    );
    ((y, m, d), iso)
}

/// All sources of the selected types, deduped; PDFs in priority order.
/// Município flags/coats of arms: Wikidata (IBGE P1585) -> Commons 256 px thumbnails + credits.
fn emblemas(o: &Opts, http: &Http) -> Result<(Vec<Fonte>, BTreeMap<String, fontes::Credito>)> {
    let v = http.json(&fontes::wikidata_api()).context("wikidata")?;
    let lista = fontes::wikidata_emblemas(&v);
    if lista.is_empty() {
        bail!("wikidata: lista vazia");
    }
    let mut titulos: Vec<String> = lista.iter().map(|(_, t)| t.clone()).collect();
    titulos.sort();
    titulos.dedup();
    let lotes: Vec<&[String]> = titulos.chunks(50).collect();
    let n = o.concorrencia.clamp(1, 4);
    let mut por_titulo = BTreeMap::new();
    for r in paralelo(&lotes, n, |l| http.json(&fontes::commons_lote_api(l, 256))) {
        por_titulo.extend(fontes::commons_lote(&r.context("commons")?));
    }
    let mut out = Vec::new();
    let mut creditos = BTreeMap::new();
    for (alvo, t) in lista {
        if let Some(c) = por_titulo.get(&t) {
            out.push(Fonte {
                alvo: alvo.clone(),
                origem: Origem::Url(c.url.clone()),
            });
            creditos.insert(alvo.chave(), c.clone());
        }
    }
    Ok((out, creditos))
}

fn listar(
    o: &Opts,
    http: &Http,
    hoje: (i64, i64, i64),
    nomes: &mut Vec<Nome>,
) -> Result<Vec<Fonte>> {
    let mut out = Vec::new();
    let mut nome = |v: Vec<(String, Option<String>, String)>| {
        nomes.extend(
            v.into_iter()
                .map(|(nome, uf, chave)| Nome { nome, uf, chave }),
        )
    };
    if o.tipos.contains(&Tipo::Foto) {
        let mut deps = Vec::new();
        let mut urls = vec![format!("{CAMARA}deputados?itens=1000")];
        urls.extend(
            o.legislaturas
                .iter()
                .map(|l| format!("{CAMARA}deputados?idLegislatura={l}&itens=1000")),
        );
        for u in urls {
            for p in camara_paginas(http, &u)? {
                deps.extend(fontes::deputados(&p));
                nome(fontes::nomes_deputados(&p));
            }
        }
        out.extend(fontes::dedupe(deps));
        let mut sen = Vec::new();
        for u in [
            format!("{SENADO}senador/lista/atual"),
            format!(
                "{SENADO}senador/lista/legislatura/{}/{}",
                o.senado.0, o.senado.1
            ),
        ] {
            let v = http.json(&u).with_context(|| format!("listar {u}"))?;
            let s = fontes::senadores(&v);
            nome(fontes::nomes_senadores(&v));
            if s.is_empty() {
                bail!("lista vazia: {u}");
            }
            sen.extend(s);
        }
        out.extend(fontes::dedupe(sen));
    }
    if o.tipos.contains(&Tipo::Logo) {
        let (y, m, d) = hoje;
        let u = format!(
            "{CAMARA}partidos?dataInicio=2015-02-01&dataFim={y:04}-{m:02}-{d:02}&itens=100"
        );
        let mut ps = Vec::new();
        for p in camara_paginas(http, &u)? {
            ps.extend(fontes::partidos(&p));
        }
        out.extend(fontes::dedupe(ps));
    }
    if o.tipos.contains(&Tipo::Bandeira) {
        out.extend(fontes::bandeiras());
    }
    if o.tipos.contains(&Tipo::Pdf) {
        let mut pdfs: Vec<Fonte> = Vec::new();
        let mut visto = std::collections::BTreeSet::new();
        let mut push = |f: Fonte, pdfs: &mut Vec<Fonte>| {
            if visto.insert(f.alvo.clone()) {
                pdfs.push(f);
            }
        };
        if let Some(p) = &o.pautas {
            let ts = std::fs::read_to_string(p).with_context(|| format!("ler {}", p.display()))?;
            for id in fontes::pautas(&ts) {
                push(fontes::proposicao(id), &mut pdfs);
            }
        }
        // Plenário (órgão 180), newest window first.
        for (ini, fim) in fontes::janelas(hoje, o.meses).into_iter().rev() {
            let u = format!(
                "{CAMARA}votacoes?idOrgao=180&dataInicio={ini}&dataFim={fim}&itens=200&ordem=DESC&ordenarPor=dataHoraRegistro"
            );
            for p in camara_paginas(http, &u)? {
                for id in fontes::proposicoes_votadas(&p) {
                    push(fontes::proposicao(id), &mut pdfs);
                }
            }
        }
        // Frente statutes last: large scans (median ~4 MB) fill the remaining budget.
        for p in camara_paginas(
            http,
            &format!("{CAMARA}frentes?idLegislatura={}&itens=100", o.frentes),
        )? {
            for f in fontes::frentes(&p) {
                push(f, &mut pdfs);
            }
        }
        if let Some(n) = o.max_pdfs {
            pdfs.truncate(n);
        }
        out.extend(pdfs);
    }
    Ok(out)
}

fn tamanho(out: &Path, variantes: &[String]) -> Option<u64> {
    variantes
        .iter()
        .map(|v| std::fs::metadata(out.join(v)).ok().map(|m| m.len()))
        .sum()
}

/// Writes only when content differs (no mtime/git churn). true = written.
fn gravar(out: &Path, rel: &str, dados: &[u8]) -> Result<bool> {
    let p = out.join(rel);
    if std::fs::read(&p).is_ok_and(|b| b == dados) {
        return Ok(false);
    }
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d)?;
    }
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, dados)?;
    std::fs::rename(&tmp, &p)?;
    Ok(true)
}

impl Ctx<'_> {
    /// Budget: PDFs (processed last, in priority order) only if they fit; images always count.
    fn cabe(&self, tipo: Tipo, bytes: u64) -> bool {
        let mut o = self.orcamento.lock().unwrap();
        if tipo == Tipo::Pdf {
            o.reservar(bytes)
        } else {
            o.contar(bytes);
            true
        }
    }
}

/// Previous item of `chave` whose files all exist, and their size.
struct Anterior<'a> {
    item: Option<&'a Item>,
    tamanho: u64,
}

impl<'a> Anterior<'a> {
    fn de(c: &Ctx<'a>, chave: &str) -> Self {
        let bruto = c.anterior.and_then(|m| m.item(chave));
        let tam = bruto.and_then(|a| tamanho(&c.o.out, &a.variantes));
        Anterior {
            item: bruto.filter(|_| tam.is_some()),
            tamanho: tam.unwrap_or(0),
        }
    }
    /// Carry the previous item over (counted in the budget).
    fn manter(&self, c: &Ctx, e: Estado) -> (Option<Item>, Estado) {
        match self.item {
            Some(a) if c.cabe(a.tipo, self.tamanho) => (Some(a.clone()), e),
            Some(_) => (None, Estado::Pulado),
            None => (None, e),
        }
    }
}

fn progresso(c: &Ctx) {
    let n = c.feitos.fetch_add(1, Ordering::Relaxed) + 1;
    if n.is_multiple_of(250) || n == c.total {
        eprintln!("assets: {n}/{}", c.total);
    }
}

fn processar(c: &Ctx, f: &Fonte) -> (Option<Item>, Estado) {
    progresso(c);
    let chave = f.alvo.chave();
    let ant = Anterior::de(c, &chave);
    let conhecida = match &f.origem {
        Origem::Url(u) => Some(u.as_str()),
        Origem::Camara(_) | Origem::Commons(_) => None,
    };
    if planejar(c.o.modo, conhecida, ant.item, ant.item.is_some()) == Plano::Manter {
        return ant.manter(c, Estado::Mantido);
    }
    let (url, licenca) = match &f.origem {
        Origem::Url(u) => (u.clone(), None),
        Origem::Camara(path) => match c.http.json(&format!("{CAMARA}{path}")) {
            Ok(v) => match fontes::resolver(&f.alvo, &v) {
                Some(u) => (u, None),
                None => return ant.manter(c, Estado::Pulado),
            },
            Err(e) => {
                eprintln!("assets: {chave}: detalhe: {e}");
                return ant.manter(c, Estado::Falha);
            }
        },
        Origem::Commons(t) => match c
            .http
            .json(&fontes::commons_api(t))
            .map(|v| fontes::commons(&v))
        {
            Ok(Some((u, l))) => (u, l),
            Ok(None) => return ant.manter(c, Estado::Pulado),
            Err(e) => {
                eprintln!("assets: {chave}: commons: {e}");
                return ant.manter(c, Estado::Falha);
            }
        },
    };
    let cond = match planejar(c.o.modo, Some(&url), ant.item, ant.item.is_some()) {
        Plano::Baixar(cond) => cond,
        Plano::Manter => None,
    };
    let max = c.orcamento.lock().unwrap().max_arquivo();
    let resp = match c.http.baixar(&url, cond.as_ref(), max) {
        Ok(r) => r,
        Err(e @ Erro::Grande(_)) => {
            eprintln!("assets: {chave}: pulado: {e} ({url})");
            return (None, Estado::Pulado);
        }
        Err(e @ Erro::Status(404 | 410)) => {
            eprintln!("assets: {chave}: sem arquivo na origem: {e} ({url})");
            return ant.manter(c, Estado::Pulado);
        }
        Err(e) => {
            eprintln!("assets: {chave}: {e} ({url})");
            return ant.manter(c, Estado::Falha);
        }
    };
    concluir(c, &f.alvo, &ant, url, licenca, resp)
}

/// sha/etag decision, then encode + write when content changed.
fn concluir(
    c: &Ctx,
    alvo: &fontes::Alvo,
    ant: &Anterior,
    url: String,
    licenca: Option<String>,
    resp: Resposta,
) -> (Option<Item>, Estado) {
    let chave = alvo.chave();
    let tipo = alvo.tipo();
    match decidir(ant.item, &resp) {
        Decisao::Reaproveitar(mut i) => {
            i.origem = url;
            i.licenca = licenca.or(i.licenca);
            if !c.cabe(i.tipo, ant.tamanho) {
                return (None, Estado::Pulado);
            }
            return (Some(*i), Estado::Inalterado);
        }
        Decisao::Falha => return ant.manter(c, Estado::Falha),
        Decisao::Gerar => {}
    }
    let Resposta::Corpo {
        dados,
        etag,
        modificado,
    } = resp
    else {
        return ant.manter(c, Estado::Falha);
    };
    let base = chave.as_str();
    let saida = match tipo {
        Tipo::Foto => imagem::foto(&dados, base),
        Tipo::Logo => imagem::logo(&dados, base),
        Tipo::Bandeira => match alvo {
            fontes::Alvo::BandeiraMunicipio(_) | fontes::Alvo::BrasaoMunicipio(_) => {
                imagem::emblema(&dados, base)
            }
            _ => imagem::bandeira(&dados, base),
        },
        Tipo::Pdf if imagem::eh_pdf(&dados) => Ok(vec![(format!("{base}.pdf"), dados.clone())]),
        Tipo::Pdf => Err(anyhow::anyhow!("não é PDF")),
    };
    let saida = match saida {
        Ok(s) => s,
        Err(e) => {
            eprintln!("assets: {chave}: {e:#} ({url})");
            return ant.manter(c, Estado::Falha);
        }
    };
    let bytes: u64 = saida.iter().map(|(_, b)| b.len() as u64).sum();
    if !c.cabe(tipo, bytes) {
        eprintln!("assets: {chave}: pulado: limite total");
        return (None, Estado::Pulado);
    }
    for (rel, b) in &saida {
        if let Err(e) = gravar(&c.o.out, rel, b) {
            eprintln!("assets: {rel}: gravar: {e}");
            return (None, Estado::Falha);
        }
    }
    let item = Item {
        chave,
        origem: url,
        tipo,
        bytes: dados.len() as u64,
        sha256: imagem::sha256_hex(&dados),
        etag,
        modificado,
        variantes: saida.into_iter().map(|(p, _)| p).collect(),
        licenca,
        autor: None,
        pagina: None,
    };
    (Some(item), Estado::Gerado)
}

/// Prefeito/vice photos of one UF: members of the TSE zip read via range requests.
/// The zip ETag is stored per item: unchanged zip -> no extraction (completo mode).
fn processar_uf(c: &Ctx, uf: &str, fotos: &[fontes::FotoTse]) -> Vec<(Option<Item>, Estado)> {
    let zip_url = fontes::zip_tse(fotos[0].ano, uf);
    let origem = |sq: u64| format!("{zip_url}#F{uf}{sq}_div.jpeg");
    let mut out: Vec<Option<(Option<Item>, Estado)>> = vec![None; fotos.len()];
    let mut pend = Vec::new();
    for (i, f) in fotos.iter().enumerate() {
        progresso(c);
        let ant = Anterior::de(c, &f.alvo.chave());
        // Same member (any extension) -> previous origem.
        let membro = format!("{zip_url}#F{uf}{}_", f.sq);
        let o = match ant.item {
            Some(a) if a.origem.starts_with(&membro) => a.origem.clone(),
            _ => origem(f.sq),
        };
        if planejar(c.o.modo, Some(&o), ant.item, ant.item.is_some()) == Plano::Manter {
            out[i] = Some(ant.manter(c, Estado::Mantido));
        } else {
            pend.push(i);
        }
    }
    if !pend.is_empty() {
        let fim = |out: &mut Vec<Option<(Option<Item>, Estado)>>, e: Estado| {
            for &i in &pend {
                let ant = Anterior::de(c, &fotos[i].alvo.chave());
                out[i] = Some(ant.manter(c, e));
            }
        };
        match c.http.cabecalho(&zip_url) {
            Err(e) => {
                eprintln!("assets: tse {uf}: {e}");
                fim(&mut out, Estado::Falha);
            }
            Ok((len, etag)) => {
                // Same zip as last time -> all pending items unchanged.
                let mut faltam = Vec::new();
                for &i in &pend {
                    let ant = Anterior::de(c, &fotos[i].alvo.chave());
                    match ant.item {
                        Some(a) if etag.is_some() && a.etag == etag => {
                            let r = Resposta::NaoModificado {
                                etag: etag.clone(),
                                modificado: None,
                            };
                            out[i] =
                                Some(concluir(c, &fotos[i].alvo, &ant, a.origem.clone(), None, r));
                        }
                        _ => faltam.push(i),
                    }
                }
                if !faltam.is_empty() {
                    extrair(c, uf, &zip_url, len, &etag, fotos, &faltam, &mut out);
                }
            }
        }
    }
    out.into_iter()
        .map(|r| r.unwrap_or((None, Estado::Falha)))
        .collect()
}

#[allow(clippy::too_many_arguments)]
fn extrair(
    c: &Ctx,
    uf: &str,
    zip_url: &str,
    len: u64,
    etag: &Option<String>,
    fotos: &[fontes::FotoTse],
    idx: &[usize],
    out: &mut [Option<(Option<Item>, Estado)>],
) {
    // Up to 3 passes; each pass reopens the archive (fresh range cache) for entries that failed.
    let mut pend: Vec<usize> = idx.to_vec();
    for tentativa in 1..=3 {
        if pend.is_empty() {
            break;
        }
        let ultima = tentativa == 3;
        let leitor = super::zipremoto::Faixas::new(len, 1 << 20, |ini, fim| {
            c.http
                .faixa(zip_url, ini, fim, etag.as_deref())
                .map_err(|e| std::io::Error::other(e.to_string()))
        });
        let mut z = match zip::ZipArchive::new(leitor) {
            Ok(z) => z,
            Err(e) => {
                eprintln!("assets: tse {uf}: zip (tentativa {tentativa}): {e}");
                if ultima {
                    for &i in &pend {
                        out[i] =
                            Some(Anterior::de(c, &fotos[i].alvo.chave()).manter(c, Estado::Falha));
                    }
                }
                continue;
            }
        };
        let nomes: std::collections::HashMap<u64, String> = z
            .file_names()
            .filter_map(|n| Some((fontes::sq_da_entrada(n)?, n.to_string())))
            .collect();
        let mut falhas = Vec::new();
        for &i in &pend {
            let f = &fotos[i];
            let ant = Anterior::de(c, &f.alvo.chave());
            let Some(nome) = nomes.get(&f.sq) else {
                out[i] = Some(ant.manter(c, Estado::Pulado));
                continue;
            };
            let mut dados = Vec::new();
            let lido = z.by_name(nome).and_then(|mut e| {
                if e.size() > c.o.max_arquivo {
                    return Err(zip::result::ZipError::FileNotFound);
                }
                std::io::Read::read_to_end(&mut e, &mut dados).map_err(Into::into)
            });
            match lido {
                Ok(_) => {
                    let r = Resposta::Corpo {
                        dados,
                        etag: etag.clone(),
                        modificado: None,
                    };
                    out[i] = Some(concluir(
                        c,
                        &f.alvo,
                        &ant,
                        format!("{zip_url}#{nome}"),
                        None,
                        r,
                    ));
                }
                Err(e) if ultima => {
                    eprintln!("assets: {}: {e}", f.alvo.chave());
                    out[i] = Some(ant.manter(c, Estado::Falha));
                }
                Err(_) => falhas.push(i),
            }
        }
        pend = falhas;
    }
}

/// `foto/deputado/1` -> `foto/deputado`.
fn grupo(chave: &str) -> &str {
    chave.rsplit_once('/').map_or(chave, |x| x.0)
}

pub fn executar(o: &Opts) -> Result<Relatorio> {
    std::fs::create_dir_all(&o.out)?;
    let caminho = o.out.join("manifest.json");
    let anterior = Manifesto::ler(&caminho);
    let (hoje, agora) = hoje_utc();
    let http = Http::new();
    let mut nomes = Vec::new();
    let mut fontes = listar(o, &http, hoje, &mut nomes)?;
    let creditos = if o.tipos.contains(&Tipo::Bandeira) {
        let (f, c) = emblemas(o, &http)?;
        fontes.extend(f);
        c
    } else {
        BTreeMap::new()
    };
    let tse = match (&o.tse, o.tipos.contains(&Tipo::Foto)) {
        (Some((cand, ibge)), true) => {
            let mun = crate::read::ibge(ibge)?
                .into_iter()
                .map(|m| (crate::norm::chave_municipio(&m.nome, m.uf), m.ibge))
                .collect();
            let t = crate::read::tse(cand, &mun)?;
            for (ibge, p) in &t.por_ibge {
                let uf = crate::norm::uf_de_codigo(ibge).map(String::from);
                let mut push = |n: &str, a: fontes::Alvo| {
                    nomes.push(Nome {
                        nome: n.to_string(),
                        uf: uf.clone(),
                        chave: a.chave(),
                    })
                };
                push(&p.nome, fontes::Alvo::Prefeito(ibge.clone()));
                if let Some(v) = &p.vice {
                    push(&v.nome, fontes::Alvo::VicePrefeito(ibge.clone()));
                }
            }
            fontes::prefeitos(&t)
        }
        _ => Vec::new(),
    };
    let mut tse = tse;
    if let (Some(p), true) = (&o.tse2022, o.tipos.contains(&Tipo::Foto)) {
        for e in super::tse::eleitos(p, 2022)? {
            for n in &e.nomes {
                nomes.push(Nome {
                    nome: n.clone(),
                    uf: Some(e.foto.uf.clone()),
                    chave: e.foto.alvo.chave(),
                });
            }
            tse.push(e.foto);
        }
    }
    let mut por_uf: BTreeMap<(u16, String), Vec<fontes::FotoTse>> = BTreeMap::new();
    for f in tse {
        por_uf.entry((f.ano, f.uf.clone())).or_default().push(f);
    }
    let por_uf: Vec<(String, Vec<fontes::FotoTse>)> =
        por_uf.into_iter().map(|((_, uf), v)| (uf, v)).collect();
    let (imagens, pdfs): (Vec<Fonte>, Vec<Fonte>) =
        fontes.into_iter().partition(|f| f.alvo.tipo() != Tipo::Pdf);
    let n_tse: usize = por_uf.iter().map(|(_, v)| v.len()).sum();
    let ctx = Ctx {
        o,
        http,
        anterior: anterior.as_ref(),
        orcamento: Mutex::new(Orcamento::new(o.max_total, o.max_arquivo)),
        feitos: AtomicUsize::new(0),
        total: imagens.len() + pdfs.len() + n_tse,
        creditos,
    };
    eprintln!(
        "assets: modo {:?}: {} imagens, {} prefeitos/vices, {} pdfs",
        o.modo,
        imagens.len(),
        n_tse,
        pdfs.len()
    );
    let n = o.concorrencia.clamp(1, super::CONCORRENCIA);
    let mut res = paralelo(&imagens, n, |f| {
        let (item, e) = processar(&ctx, f);
        (item.map(|i| creditar(&ctx, i)), e)
    });
    let mut alvos: Vec<fontes::Alvo> = imagens.iter().map(|f| f.alvo.clone()).collect();
    for ((_, fotos), r) in por_uf.iter().zip(paralelo(&por_uf, n, |(uf, fotos)| {
        processar_uf(&ctx, uf, fotos)
    })) {
        alvos.extend(fotos.iter().map(|f| f.alvo.clone()));
        res.extend(r);
    }
    res.extend(paralelo(&pdfs, n, |f| processar(&ctx, f)));
    alvos.extend(pdfs.iter().map(|f| f.alvo.clone()));

    let mut rel = Relatorio::default();
    let mut itens = Vec::new();
    let mut vistos = std::collections::BTreeSet::new();
    let mut grupos = std::collections::BTreeSet::new();
    for (alvo, (item, estado)) in alvos.iter().zip(res) {
        *rel.contagem.entry((alvo.tipo(), estado)).or_default() += 1;
        let chave = alvo.chave();
        grupos.insert(grupo(&chave).to_string());
        vistos.insert(chave);
        itens.extend(item);
    }
    // Items not listed now: kept in incremental mode and for types not selected; pruned otherwise.
    if let Some(a) = &anterior {
        for i in &a.itens {
            let fora = !grupos.contains(grupo(&i.chave)) || o.modo == Modo::Incremental;
            if fora && !vistos.contains(&i.chave) && tamanho(&o.out, &i.variantes).is_some() {
                itens.push(i.clone());
            }
        }
    }
    let novo = Manifesto::finalizar(anterior.as_ref(), itens, &agora);
    if let Some(a) = &anterior {
        for p in orfaos(a, &novo) {
            if std::fs::remove_file(o.out.join(&p)).is_ok() {
                rel.removidos += 1;
            }
        }
    }
    rel.manifesto_mudou = novo.mudou_de(anterior.as_ref());
    if rel.manifesto_mudou {
        gravar(&o.out, "manifest.json", novo.to_json().as_bytes())?;
    }
    // Derived files (credits, name index): also mark a change so the workflow pushes them.
    let presentes: std::collections::BTreeSet<String> =
        novo.itens.iter().map(|i| i.chave.clone()).collect();
    let mut derivados = creditos_municipio(&novo);
    derivados.extend(super::nomes::indice(&nomes, &presentes));
    let atuais: std::collections::BTreeSet<&str> =
        derivados.iter().map(|(p, _)| p.as_str()).collect();
    for dir in ["indice/nomes", "credito/municipio"] {
        for e in std::fs::read_dir(o.out.join(dir))
            .into_iter()
            .flatten()
            .flatten()
        {
            let rel_p = format!("{dir}/{}", e.file_name().to_string_lossy());
            if !atuais.contains(rel_p.as_str()) && std::fs::remove_file(e.path()).is_ok() {
                rel.manifesto_mudou = true;
            }
        }
    }
    for (p, json) in &derivados {
        rel.manifesto_mudou |= gravar(&o.out, p, json.as_bytes())?;
    }
    for i in &novo.itens {
        let e = rel.saida.entry(i.tipo).or_default();
        e.0 += i.variantes.len();
        e.1 += tamanho(&o.out, &i.variantes).unwrap_or(0);
    }
    Ok(rel)
}

/// Commons attribution onto the item.
fn creditar(c: &Ctx, mut i: Item) -> Item {
    if let Some(cr) = c.creditos.get(&i.chave) {
        i.licenca = cr.licenca.clone();
        i.autor = cr.autor.clone();
        i.pagina = cr.pagina.clone();
    }
    i
}

/// `credito/municipio/{ibge}.json`: `{bandeira?, brasao?: {licenca, autor, pagina}}` for the web credit line.
pub fn creditos_municipio(m: &Manifesto) -> Vec<(String, String)> {
    let mut por: BTreeMap<&str, serde_json::Map<String, serde_json::Value>> = BTreeMap::new();
    for i in &m.itens {
        let (tipo, ibge) = match i.chave.rsplit_once('/') {
            Some(("bandeira/municipio", x)) => ("bandeira", x),
            Some(("brasao/municipio", x)) => ("brasao", x),
            _ => continue,
        };
        por.entry(ibge).or_default().insert(
            tipo.into(),
            serde_json::json!({ "licenca": i.licenca, "autor": i.autor, "pagina": i.pagina }),
        );
    }
    por.into_iter()
        .map(|(ibge, v)| {
            (
                format!("credito/municipio/{ibge}.json"),
                serde_json::Value::Object(v).to_string() + "\n",
            )
        })
        .collect()
}

const AUTORES: &str =
    "https://raw.githubusercontent.com/kleeedolinux/emenda.pl/data/v1/autores.json";

/// Photo coverage of the people the site renders (reads `out/manifest.json` + `out/indice/nomes`).
pub fn cobertura(o: &Opts) -> Result<Vec<super::cobertura::Linha>> {
    use super::cobertura::{eh_pessoa, medir, Pessoa};
    let http = Http::new();
    let m = Manifesto::ler(&o.out.join("manifest.json")).context("manifest.json")?;
    let presentes: std::collections::BTreeSet<String> =
        m.itens.iter().map(|i| i.chave.clone()).collect();
    let mut indice: BTreeMap<String, Vec<(String, String)>> = BTreeMap::new();
    for e in std::fs::read_dir(o.out.join("indice/nomes"))
        .into_iter()
        .flatten()
        .flatten()
    {
        let v: BTreeMap<String, Vec<(String, String)>> =
            serde_json::from_slice(&std::fs::read(e.path())?)?;
        indice.extend(v);
    }
    let mut ps: Vec<Pessoa> = Vec::new();
    let tem = |c: &str| presentes.contains(c);
    let mut atuais = std::collections::BTreeSet::new();
    for (cat, url) in [
        (
            "deputados federais (exercício)",
            format!("{CAMARA}deputados?itens=1000"),
        ),
        (
            "deputados federais (leg. 56-57)",
            format!("{CAMARA}deputados?idLegislatura=56&itens=1000"),
        ),
        (
            "deputados federais (leg. 56-57)",
            format!("{CAMARA}deputados?idLegislatura=57&itens=1000"),
        ),
    ] {
        let mut vistos = std::collections::BTreeSet::new();
        for p in camara_paginas(&http, &url)? {
            for (nome, uf, chave) in fontes::nomes_deputados(&p) {
                if cat.contains("exercício") {
                    atuais.insert((crate::norm::chave_nome(&nome), chave.clone()));
                }
                if vistos.insert(chave.clone())
                    && !ps
                        .iter()
                        .any(|x| x.categoria == cat && x.chave.as_deref() == Some(&chave))
                {
                    ps.push(Pessoa {
                        categoria: cat,
                        antes: tem(&chave),
                        nome,
                        uf,
                        chave: Some(chave),
                    });
                }
            }
        }
    }
    for (cat, url) in [
        (
            "senadores (exercício)",
            format!("{SENADO}senador/lista/atual"),
        ),
        (
            "senadores (leg. 56-57, inclui ex)",
            format!("{SENADO}senador/lista/legislatura/56/57"),
        ),
    ] {
        let v = http.json(&url).with_context(|| url.clone())?;
        let mut vistos = std::collections::BTreeSet::new();
        for (nome, uf, chave) in fontes::nomes_senadores(&v) {
            if vistos.insert(chave.clone()) {
                ps.push(Pessoa {
                    categoria: cat,
                    antes: tem(&chave),
                    nome,
                    uf,
                    chave: Some(chave),
                });
            }
        }
    }
    if let Some(p) = &o.tse2022 {
        for e in super::tse::eleitos(p, 2022)? {
            let cat = match e.cargo.as_str() {
                "DEPUTADO ESTADUAL" | "DEPUTADO DISTRITAL" => "deputados estaduais/distritais 2022",
                c if c.contains("SUPLENTE") => "suplentes de senador 2022",
                "GOVERNADOR" | "VICE-GOVERNADOR" => "governadores/vices 2022",
                _ => continue,
            };
            ps.push(Pessoa {
                categoria: cat,
                nome: e.nomes.last().cloned().unwrap_or_default(),
                uf: Some(e.foto.uf.clone()),
                chave: Some(e.foto.alvo.chave()),
                antes: false,
            });
        }
    }
    if let Some((cand, ibge)) = &o.tse {
        let mun = crate::read::ibge(ibge)?
            .into_iter()
            .map(|m| (crate::norm::chave_municipio(&m.nome, m.uf), m.ibge))
            .collect();
        for f in fontes::prefeitos(&crate::read::tse(cand, &mun)?) {
            let cat = match f.alvo {
                fontes::Alvo::Prefeito(_) => "prefeitos 2024",
                _ => "vice-prefeitos 2024",
            };
            ps.push(Pessoa {
                categoria: cat,
                nome: String::new(),
                uf: Some(f.uf),
                chave: Some(f.alvo.chave()),
                antes: false,
            });
        }
    }
    let autores = http.json(AUTORES).context("autores.json")?;
    for a in autores.as_array().into_iter().flatten() {
        let Some(nome) = a["nome"].as_str().filter(|n| eh_pessoa(n)) else {
            continue;
        };
        let k = crate::norm::chave_nome(nome);
        // Before: AutorPage only linked current deputies by exact name.
        let antes = atuais.iter().any(|(n, c)| *n == k && tem(c));
        ps.push(Pessoa {
            categoria: "autores de emendas (pessoas)",
            nome: nome.to_string(),
            uf: None,
            chave: None,
            antes,
        });
    }
    let linhas = medir(&ps, &presentes, &indice);
    let json = serde_json::to_string_pretty(&linhas)? + "\n";
    gravar(&o.out, "cobertura.json", json.as_bytes())?;
    Ok(linhas)
}
