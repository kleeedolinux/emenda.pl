//! emenda.pl ETL: Portal da Transparência + TSE + IBGE -> JSON estático v1.

pub mod model;
pub mod norm;
pub mod read;

use anyhow::Result;
use model::*;
use norm::{
    chave_municipio, chave_nome, classificar_tipo, parse_valor_br, uf_de_codigo, uf_nome,
    uf_sigla_valida,
};
use read::Rows;
use std::collections::{BTreeMap, HashMap};
use std::hash::Hash;
use std::path::{Path, PathBuf};

pub const FONTE: &str =
    "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/UNICO";
pub const TOP_FAV_MUNICIPIO: usize = 200;
pub const TOP_FAV_AUTOR: usize = 100;

pub struct Opts {
    pub input: PathBuf,
    pub out: PathBuf,
    pub tse: Option<PathBuf>,
    pub ibge: Option<PathBuf>,
}

#[derive(Debug, Default)]
pub struct Relatorio {
    pub emendas: usize,
    pub municipios: usize,
    pub autores: usize,
    pub favorecidos_sem_municipio: usize,
    pub prefeitos: usize,
    pub prefeitos_sem_ibge: usize,
}

struct Mun {
    nome: String,
    uf: &'static str,
}

/// Soma totais por chave.
fn agrupa<'a, K: Hash + Eq, I: IntoIterator<Item = &'a EmendaItem>>(
    it: I,
    key: impl Fn(&EmendaItem) -> Option<K>,
) -> Vec<(K, Totais)> {
    let mut m: HashMap<K, Totais> = HashMap::new();
    for e in it {
        if let Some(k) = key(e) {
            m.entry(k).or_default().add(e);
        }
    }
    m.into_iter().collect()
}

fn por_pago<K>(mut v: Vec<(K, Totais)>) -> Vec<(K, Totais)> {
    v.sort_by(|a, b| {
        b.1.pago
            .cmp(&a.1.pago)
            .then(b.1.empenhado.cmp(&a.1.empenhado))
    });
    v
}

fn por_ano<'a>(it: impl IntoIterator<Item = &'a EmendaItem>) -> Vec<Com<Ano>> {
    let mut v = agrupa(it, |e| Some(e.ano));
    v.sort_by_key(|x| x.0);
    v.into_iter()
        .map(|(ano, t)| Com { k: Ano { ano }, t })
        .collect()
}

fn por_tipo<'a>(it: impl IntoIterator<Item = &'a EmendaItem>) -> Vec<Com<Tipo>> {
    por_pago(agrupa(it, |e| Some(e.tipo)))
        .into_iter()
        .map(|(tipo, t)| Com {
            k: Tipo { tipo },
            t,
        })
        .collect()
}

fn totais<'a>(it: impl IntoIterator<Item = &'a EmendaItem>) -> Totais {
    let mut t = Totais::default();
    it.into_iter().for_each(|e| t.add(e));
    t
}

fn autor_valido(c: &str) -> bool {
    !c.is_empty() && c.chars().all(|c| c.is_ascii_alphanumeric())
}

fn autores<'a>(it: impl IntoIterator<Item = &'a EmendaItem>) -> Vec<AutorResumo> {
    let mut nomes: HashMap<&str, &str> = HashMap::new();
    let items: Vec<&EmendaItem> = it
        .into_iter()
        .filter(|e| autor_valido(&e.autor.codigo))
        .collect();
    for e in &items {
        nomes.insert(&e.autor.codigo, &e.autor.nome);
    }
    por_pago(agrupa(items.iter().copied(), |e| {
        Some(e.autor.codigo.clone())
    }))
    .into_iter()
    .map(|(codigo, t)| {
        let nome = nomes[codigo.as_str()].to_string();
        AutorResumo {
            chave: chave_nome(&nome),
            codigo,
            nome,
            n: t.n,
            pago: t.pago,
            empenhado: t.empenhado,
        }
    })
    .collect()
}

#[derive(Default)]
struct FavAcc {
    tipo: String,
    natureza: String,
    valor: i64,
}

fn top_favorecidos(m: HashMap<(String, String), FavAcc>, n: usize) -> Vec<Favorecido> {
    let mut v: Vec<_> = m.into_iter().collect();
    v.sort_by(|a, b| b.1.valor.cmp(&a.1.valor).then_with(|| a.0.cmp(&b.0)));
    v.truncate(n);
    v.into_iter()
        .map(|((documento, nome), a)| Favorecido {
            documento,
            nome,
            tipo: a.tipo,
            natureza_juridica: (!a.natureza.is_empty()).then_some(a.natureza),
            valor: a.valor,
        })
        .collect()
}

fn write<T: serde::Serialize>(p: &Path, v: &T) -> Result<()> {
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d)?;
    }
    let f = std::io::BufWriter::new(std::fs::File::create(p)?);
    serde_json::to_writer(f, v)?;
    Ok(())
}

/// ISO-8601 UTC a partir do relógio do sistema (sem dependência extra).
fn agora_iso() -> String {
    let s = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let (days, rem) = (s.div_euclid(86400), s.rem_euclid(86400));
    // Howard Hinnant, civil_from_days
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

pub fn run(o: &Opts) -> Result<Relatorio> {
    let mut rel = Relatorio::default();
    // municípios: ibge -> nome/uf ; chave(nome,uf) -> ibge
    let mut muns: BTreeMap<String, Mun> = BTreeMap::new();
    let mut chave_mun: HashMap<String, String> = HashMap::new();
    if let Some(p) = &o.ibge {
        for m in read::ibge(p)? {
            chave_mun.insert(chave_municipio(&m.nome, m.uf), m.ibge.clone());
            muns.insert(
                m.ibge,
                Mun {
                    nome: m.nome,
                    uf: m.uf,
                },
            );
        }
    }

    // emendas
    let mut emendas: Vec<EmendaItem> = Vec::new();
    let mut r = Rows::open(&o.input.join("EmendasParlamentares.csv"))?;
    while r.advance()? {
        let uf = uf_de_codigo(&r.get("Código UF IBGE"));
        let ib = r.get("Código Município IBGE");
        let ibge = (ib.len() == 7
            && ib.bytes().all(|b| b.is_ascii_digit())
            && uf_de_codigo(&ib).is_some())
        .then_some(ib);
        if let Some(i) = &ibge {
            let u = uf_de_codigo(i).unwrap_or_default();
            let nome = r.get("Município");
            chave_mun
                .entry(chave_municipio(&nome, u))
                .or_insert_with(|| i.clone());
            muns.entry(i.clone()).or_insert(Mun { nome, uf: u });
        }
        let tipo_original = r.get("Tipo de Emenda");
        emendas.push(EmendaItem {
            codigo: r.get("Código da Emenda"),
            numero: r.get("Número da emenda"),
            ano: r.get("Ano da Emenda").parse().unwrap_or(0),
            tipo: classificar_tipo(&tipo_original),
            tipo_original,
            autor: AutorRef {
                codigo: r.get("Código do Autor da Emenda"),
                nome: r.get("Nome do Autor da Emenda"),
            },
            localidade: r.get("Localidade de aplicação do recurso"),
            ibge,
            uf: uf.map(str::to_string),
            funcao: r.get("Nome Função"),
            subfuncao: r.get("Nome Subfunção"),
            programa: r.get("Nome Programa"),
            acao: r.get("Nome Ação"),
            empenhado: parse_valor_br(&r.get("Valor Empenhado")),
            liquidado: parse_valor_br(&r.get("Valor Liquidado")),
            pago: parse_valor_br(&r.get("Valor Pago")),
            rap_pago: parse_valor_br(&r.get("Valor Restos A Pagar Pagos")),
        });
    }
    emendas.sort_by(|a, b| {
        b.ano
            .cmp(&a.ano)
            .then(b.pago.cmp(&a.pago))
            .then_with(|| a.codigo.cmp(&b.codigo))
    });
    rel.emendas = emendas.len();

    // favorecidos
    type FavMap = HashMap<String, HashMap<(String, String), FavAcc>>;
    let (mut fav_mun, mut fav_aut): (FavMap, FavMap) = Default::default();
    let fp = o.input.join("EmendasParlamentares_PorFavorecido.csv");
    if fp.exists() {
        let mut r = Rows::open(&fp)?;
        while r.advance()? {
            let k = (r.get("Código do Favorecido"), r.get("Favorecido"));
            let valor = parse_valor_br(&r.get("Valor Recebido"));
            let (tipo, natureza) = (r.get("Tipo Favorecido"), r.get("Natureza Jurídica"));
            let acc = |m: &mut FavMap, id: String| {
                let a = m.entry(id).or_default().entry(k.clone()).or_default();
                if a.tipo.is_empty() {
                    a.tipo.clone_from(&tipo);
                    a.natureza.clone_from(&natureza);
                }
                a.valor += valor;
            };
            match chave_mun.get(&chave_municipio(
                &r.get("Município Favorecido"),
                &r.get("UF Favorecido"),
            )) {
                Some(i) => acc(&mut fav_mun, i.clone()),
                None => rel.favorecidos_sem_municipio += 1,
            }
            let a = r.get("Código do Autor da Emenda");
            if autor_valido(&a) {
                acc(&mut fav_aut, a);
            }
        }
    }

    let cp = o.input.join("EmendasParlamentares_Convenios.csv");
    let mut conv = if cp.exists() {
        read::convenios(&cp, &chave_mun)?
    } else {
        HashMap::new()
    };
    for v in conv.values_mut() {
        v.sort_by(|a, b| b.valor.cmp(&a.valor).then_with(|| b.data.cmp(&a.data)));
    }

    let tse = match &o.tse {
        Some(p) => read::tse(p, &chave_mun)?,
        None => read::Tse {
            por_ibge: HashMap::new(),
            sem_ibge: 0,
        },
    };
    rel.prefeitos = tse.por_ibge.len();
    rel.prefeitos_sem_ibge = tse.sem_ibge;

    let v1 = o.out.join("v1");
    let total = totais(&emendas);
    let mut anos: Vec<u16> = emendas.iter().map(|e| e.ano).collect();
    anos.sort_unstable();
    anos.dedup();
    write(
        &v1.join("meta.json"),
        &Meta {
            version: "v1",
            generated_at: agora_iso(),
            fonte: FONTE,
            anos,
            totais: total,
        },
    )?;

    let mut fluxo: HashMap<(norm::TipoEmenda, String, String), i64> = HashMap::new();
    for e in &emendas {
        if let (Some(uf), true) = (&e.uf, e.pago != 0) {
            *fluxo
                .entry((e.tipo, e.funcao.clone(), uf.clone()))
                .or_default() += e.pago;
        }
    }
    let mut fluxo: Vec<Fluxo> = fluxo
        .into_iter()
        .map(|((tipo, funcao, uf), pago)| Fluxo {
            tipo,
            funcao,
            uf,
            pago,
        })
        .collect();
    fluxo.sort_by(|a, b| {
        b.pago
            .cmp(&a.pago)
            .then_with(|| (a.tipo, &a.funcao, &a.uf).cmp(&(b.tipo, &b.funcao, &b.uf)))
    });
    write(
        &v1.join("brasil.json"),
        &Brasil {
            totais: total,
            por_ano: por_ano(&emendas),
            por_tipo: por_tipo(&emendas),
            por_funcao: por_pago(agrupa(&emendas, |e| Some(e.funcao.clone())))
                .into_iter()
                .map(|(funcao, t)| Com {
                    k: Funcao { funcao },
                    t,
                })
                .collect(),
            por_uf: por_pago(agrupa(&emendas, |e| e.uf.clone()))
                .into_iter()
                .map(|(uf, t)| Com {
                    k: UfNome {
                        nome: uf_nome(&uf).unwrap_or_default().to_string(),
                        uf,
                    },
                    t,
                })
                .collect(),
            fluxo,
        },
    )?;
    write(&v1.join("autores.json"), &autores(&emendas))?;

    // índices
    let mut by_uf: HashMap<&str, Vec<&EmendaItem>> = HashMap::new();
    let mut by_mun: HashMap<&str, Vec<&EmendaItem>> = HashMap::new();
    let mut by_aut: BTreeMap<&str, Vec<&EmendaItem>> = BTreeMap::new();
    for e in &emendas {
        if let Some(u) = &e.uf {
            by_uf.entry(u).or_default().push(e);
        }
        if let Some(i) = &e.ibge {
            by_mun.entry(i).or_default().push(e);
        }
        if autor_valido(&e.autor.codigo) {
            by_aut.entry(&e.autor.codigo).or_default().push(e);
        }
    }

    let ufs: Vec<&str> = [
        "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB",
        "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
    ]
    .into_iter()
    .filter_map(uf_sigla_valida)
    .collect();
    let vazio: Vec<&EmendaItem> = Vec::new();
    for uf in ufs {
        let es = by_uf.get(uf).unwrap_or(&vazio);
        let municipios = por_pago(agrupa(es.iter().copied(), |e| e.ibge.clone()))
            .into_iter()
            .map(|(ibge, t)| Com {
                k: MunK {
                    nome: muns.get(&ibge).map(|m| m.nome.clone()).unwrap_or_default(),
                    ibge,
                },
                t,
            })
            .collect();
        write(
            &v1.join(format!("uf/{uf}.json")),
            &Uf {
                uf: uf.to_string(),
                nome: uf_nome(uf).unwrap_or_default().to_string(),
                totais: totais(es.iter().copied()),
                por_tipo: por_tipo(es.iter().copied()),
                por_ano: por_ano(es.iter().copied()),
                municipios,
                autores: autores(es.iter().copied()),
            },
        )?;
    }

    for (ibge, m) in &muns {
        let es = by_mun.get(ibge.as_str()).unwrap_or(&vazio);
        write(
            &v1.join(format!("municipio/{ibge}.json")),
            &Municipio {
                ibge,
                nome: &m.nome,
                uf: m.uf,
                prefeito: tse.por_ibge.get(ibge),
                totais: totais(es.iter().copied()),
                por_tipo: por_tipo(es.iter().copied()),
                autores: autores(es.iter().copied()),
                emendas: es.clone(),
                favorecidos: top_favorecidos(
                    fav_mun.remove(ibge).unwrap_or_default(),
                    TOP_FAV_MUNICIPIO,
                ),
                convenios: conv
                    .get(ibge)
                    .map(|v| v.iter().collect())
                    .unwrap_or_default(),
            },
        )?;
    }
    rel.municipios = muns.len();

    for (codigo, es) in &by_aut {
        let nome = &es[0].autor.nome;
        write(
            &v1.join(format!("autor/{codigo}.json")),
            &Autor {
                codigo,
                nome,
                chave: chave_nome(nome),
                totais: totais(es.iter().copied()),
                por_ano: por_ano(es.iter().copied()),
                por_uf: por_pago(agrupa(es.iter().copied(), |e| e.uf.clone()))
                    .into_iter()
                    .map(|(uf, t)| Com { k: UfK { uf }, t })
                    .collect(),
                por_tipo: por_tipo(es.iter().copied()),
                emendas: es.clone(),
                favorecidos: top_favorecidos(
                    fav_aut.remove(*codigo).unwrap_or_default(),
                    TOP_FAV_AUTOR,
                ),
            },
        )?;
    }
    rel.autores = by_aut.len();
    Ok(rel)
}
