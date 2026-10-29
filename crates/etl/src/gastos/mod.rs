//! v1/gastos/** — gastos de deputados (CEAP, verba de gabinete) e senadores (CEAPS, pessoal).
//!
//! Entrada: cache de arquivos oficiais baixados por `scripts/gastos-fetch.sh`:
//! - `camara/Ano-YYYY.csv[.zip]`, `camara/funcionarios.csv`, `camara/deputados.json`,
//!   `camara/deputados/<id>.html` (página oficial do deputado).
//! - `senado/ceaps-YYYY.json`, `senado/atual.json`, `senado/servidores.json`,
//!   `senado/remuneracoes-YYYY-M.json`, `senado/auxmoradia.json`.
//!
//! Saída: `v1/gastos/deputado/<id>.json`, `v1/gastos/senador/<codigo>.json`, `v1/gastos/ranking.json`.
//! Valores em centavos.

pub mod camara;
pub mod grupos;
pub mod senado;

use crate::write;
use anyhow::Result;
pub use grupos::{grupo, Grupo};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

pub const MAX_ITENS: usize = 500;
pub const TOP_FORNECEDORES: usize = 30;
pub const TOP_RANKING_FORNECEDORES: usize = 100;
pub const TOP_CATEGORIA: usize = 5;

pub struct Opts {
    /// Diretório de cache (ver doc do módulo).
    pub cache: PathBuf,
    /// Diretório de saída (gera <out>/v1/gastos/...).
    pub out: PathBuf,
    /// Ano corrente (define o início da legislatura).
    pub ano: u16,
}

#[derive(Debug, Default)]
pub struct Relatorio {
    pub despesas_camara: usize,
    pub despesas_senado: usize,
    pub deputados: usize,
    pub senadores: usize,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Casa {
    Camara,
    Senado,
}

/// Uma despesa normalizada (linha da CEAP/CEAPS).
pub struct Despesa {
    pub id: String,
    pub nome: String,
    pub partido: String,
    pub uf: String,
    pub ano: u16,
    pub mes: u8,
    /// AAAA-MM-DD (ou AAAA-MM quando a fonte não traz a data).
    pub data: String,
    pub categoria: String,
    pub fornecedor: String,
    pub cnpj_cpf: String,
    pub valor: i64,
    pub url: Option<String>,
    pub det: Option<String>,
}

/// CNPJ/CPF só com dígitos; vazio para códigos fictícios (ex.: "000.000.000/0000-1").
pub fn doc(s: &str) -> String {
    let d: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
    if d.trim_start_matches('0').len() < 4 {
        String::new()
    } else {
        d
    }
}

/// Primeiro ano da legislatura (4 anos, a 57ª começou em 2023) que contém `ano`.
pub fn inicio_legislatura(ano: u16) -> u16 {
    let a = ano as i32;
    (2023 + (a - 2023).div_euclid(4) * 4) as u16
}

pub fn reais_para_centavos(v: f64) -> i64 {
    (v * 100.0).round() as i64
}

fn ym(s: &str) -> Option<(u16, u8)> {
    let (a, m) = (s.get(0..4)?.parse().ok()?, s.get(5..7)?.parse().ok()?);
    Some((a, m))
}

fn meses_entre(ini: (u16, u8), fim: (u16, u8)) -> i64 {
    let f = |(a, m): (u16, u8)| a as i64 * 12 + m as i64;
    (f(fim) - f(ini) + 1).max(1)
}

// ---------------------------------------------------------------- saída

#[derive(Serialize, Clone)]
pub struct Fonte {
    pub nome: &'static str,
    pub url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mandato {
    pub inicio: String,
    pub total: i64,
    pub meses: i64,
    pub media_mensal: i64,
}

#[derive(Serialize)]
pub struct AnoValor {
    pub ano: u16,
    pub valor: i64,
    pub n: u32,
}

#[derive(Serialize)]
pub struct CategoriaValor {
    pub categoria: String,
    pub valor: i64,
    pub n: u32,
}

#[derive(Serialize)]
pub struct CategoriaAno {
    pub ano: u16,
    pub categoria: String,
    pub valor: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Fornecedor {
    pub cnpj_cpf: String,
    pub nome: String,
    pub valor: i64,
    pub n: u32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub data: String,
    pub categoria: String,
    pub fornecedor: String,
    pub cnpj_cpf: String,
    pub valor: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub det: Option<String>,
}

#[derive(Serialize)]
pub struct Cota {
    pub ano: u16,
    pub gasto: i64,
    pub teto: i64,
}

#[derive(Serialize)]
pub struct MesGasto {
    pub mes: u8,
    pub gasto: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerbaGabinete {
    pub ano: u16,
    pub gasto: i64,
    pub nao_utilizado: i64,
    pub por_mes: Vec<MesGasto>,
}

#[derive(Serialize, Default)]
pub struct Pessoa {
    pub nome: String,
    pub cargo: String,
    pub grupo: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub desde: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remuneracao: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pessoal {
    pub n: usize,
    pub custo_mensal: Option<i64>,
    pub referencia: Option<String>,
    pub lista: Vec<Pessoa>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Auxilios {
    pub imovel_funcional: Option<String>,
    pub auxilio_moradia: Option<String>,
    pub auxilio_moradia_valor: Option<i64>,
    pub viagens_missao: Option<u32>,
}

/// Dados de fora da CEAP para um parlamentar em exercício.
#[derive(Default)]
pub struct Extras {
    pub cota: Option<Cota>,
    pub verba: Option<VerbaGabinete>,
    pub pessoal: Option<Pessoal>,
    pub subsidio: Option<i64>,
    pub auxilios: Auxilios,
    pub mandato_inicio: Option<(u16, u8)>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Gastos {
    pub casa: Casa,
    pub id: String,
    pub nome: String,
    pub partido: Option<String>,
    pub uf: Option<String>,
    pub em_exercicio: bool,
    pub dados_ate: Option<String>,
    pub total: i64,
    pub mandato: Mandato,
    pub por_ano: Vec<AnoValor>,
    pub por_categoria: Vec<CategoriaValor>,
    pub por_categoria_ano: Vec<CategoriaAno>,
    pub top_fornecedores: Vec<Fornecedor>,
    pub n_itens: usize,
    pub itens: Vec<Item>,
    pub cota: Option<Cota>,
    pub verba_gabinete: Option<VerbaGabinete>,
    pub pessoal: Option<Pessoal>,
    pub subsidio: Option<i64>,
    pub auxilios: Auxilios,
    pub fontes: Vec<Fonte>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankingParlamentar {
    pub casa: Casa,
    pub id: String,
    pub nome: String,
    pub partido: Option<String>,
    pub uf: Option<String>,
    pub em_exercicio: bool,
    pub mandato: i64,
    pub por_ano: BTreeMap<u16, i64>,
}

#[derive(Serialize)]
pub struct IdValor {
    pub id: String,
    pub valor: i64,
}

#[derive(Serialize)]
pub struct RankingCategoria {
    pub casa: Casa,
    pub ano: u16,
    pub categoria: String,
    pub valor: i64,
    pub n: u32,
    pub top: Vec<IdValor>,
}

#[derive(Serialize)]
pub struct RankingFornecedor {
    #[serde(flatten)]
    pub f: Fornecedor,
    pub parlamentares: usize,
}

#[derive(Serialize)]
pub struct DadosAte {
    pub camara: Option<String>,
    pub senado: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ranking {
    pub anos: Vec<u16>,
    pub dados_ate: DadosAte,
    pub parlamentares: Vec<RankingParlamentar>,
    pub categorias: Vec<RankingCategoria>,
    pub fornecedores: Vec<RankingFornecedor>,
}

// ---------------------------------------------------------------- agregação

#[derive(Default)]
struct FornAcc {
    nome: String,
    valor: i64,
    n: u32,
    ids: usize,
}

/// Agregado por parlamentar, alimentado em streaming.
#[derive(Default)]
pub struct Acc {
    nome: String,
    partido: String,
    uf: String,
    ultimo: (u16, u8),
    por_mes: BTreeMap<(u16, u8), i64>,
    cat_ano: BTreeMap<(u16, String), (i64, u32)>,
    forn: HashMap<String, FornAcc>,
    forn_grupo: HashMap<(Grupo, String), (String, i64, u32)>,
    itens: Vec<((u16, u8), Item)>,
    n: usize,
}

fn chave_forn(cnpj_cpf: &str, nome: &str) -> String {
    if cnpj_cpf.is_empty() {
        format!("#{}", nome.trim().to_uppercase())
    } else {
        cnpj_cpf.to_string()
    }
}

impl Acc {
    pub fn add(&mut self, d: Despesa) {
        if (d.ano, d.mes) >= self.ultimo {
            self.ultimo = (d.ano, d.mes);
            self.nome.clone_from(&d.nome);
            if !d.partido.is_empty() {
                self.partido.clone_from(&d.partido);
            }
            if !d.uf.is_empty() {
                self.uf.clone_from(&d.uf);
            }
        }
        *self.por_mes.entry((d.ano, d.mes)).or_default() += d.valor;
        let c = self
            .cat_ano
            .entry((d.ano, d.categoria.clone()))
            .or_default();
        c.0 += d.valor;
        c.1 += 1;
        let f = self
            .forn
            .entry(chave_forn(&d.cnpj_cpf, &d.fornecedor))
            .or_default();
        if f.nome.is_empty() {
            f.nome.clone_from(&d.fornecedor);
        }
        f.valor += d.valor;
        f.n += 1;
        let fg = self
            .forn_grupo
            .entry((grupo(&d.categoria), chave_forn(&d.cnpj_cpf, &d.fornecedor)))
            .or_default();
        if fg.0.is_empty() {
            fg.0.clone_from(&d.fornecedor);
        }
        fg.1 += d.valor;
        fg.2 += 1;
        self.n += 1;
        self.itens.push((
            (d.ano, d.mes),
            Item {
                data: d.data,
                categoria: d.categoria,
                fornecedor: d.fornecedor,
                cnpj_cpf: d.cnpj_cpf,
                valor: d.valor,
                url: d.url,
                det: d.det,
            },
        ));
        if self.itens.len() >= MAX_ITENS * 4 {
            self.poda();
        }
    }

    /// Mantém só os `MAX_ITENS` mais recentes (competência, data).
    fn poda(&mut self) {
        self.itens
            .sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.data.cmp(&a.1.data)));
        self.itens.truncate(MAX_ITENS);
    }
}

/// Acumula despesas por parlamentar.
pub type Accs = HashMap<String, Acc>;

pub fn acumula(accs: &mut Accs, d: Despesa) {
    accs.entry(d.id.clone()).or_default().add(d);
}

fn dados_ate(accs: &Accs) -> Option<(u16, u8)> {
    accs.values().map(|a| a.ultimo).max()
}

fn fmt_ym((a, m): (u16, u8)) -> String {
    format!("{a}-{m:02}")
}

/// Identificação de um parlamentar em exercício.
pub struct Atual {
    pub nome: String,
    pub partido: String,
    pub uf: String,
}

fn opt(s: &str) -> Option<String> {
    (!s.is_empty()).then(|| s.to_string())
}

#[allow(clippy::too_many_arguments)]
fn monta(
    casa: Casa,
    id: &str,
    acc: Option<&mut Acc>,
    atual: Option<&Atual>,
    extras: Extras,
    ate: Option<(u16, u8)>,
    leg: (u16, u8),
    fontes: Vec<Fonte>,
) -> Gastos {
    let mut vazio = Acc::default();
    let acc = acc.unwrap_or(&mut vazio);
    acc.poda();
    let ini = extras.mandato_inicio.unwrap_or(leg);
    let total_mandato: i64 = acc.por_mes.range(ini..).map(|(_, v)| v).sum();
    let meses = ate.map_or(1, |f| meses_entre(ini, f));
    let mut por_ano: BTreeMap<u16, (i64, u32)> = BTreeMap::new();
    let mut por_cat: HashMap<&str, (i64, u32)> = HashMap::new();
    for ((ano, cat), (v, n)) in &acc.cat_ano {
        let a = por_ano.entry(*ano).or_default();
        a.0 += v;
        a.1 += n;
        let c = por_cat.entry(cat).or_default();
        c.0 += v;
        c.1 += n;
    }
    let mut por_categoria: Vec<CategoriaValor> = por_cat
        .into_iter()
        .map(|(c, (valor, n))| CategoriaValor {
            categoria: c.to_string(),
            valor,
            n,
        })
        .collect();
    por_categoria.sort_by(|a, b| b.valor.cmp(&a.valor).then(a.categoria.cmp(&b.categoria)));
    let mut top: Vec<Fornecedor> = acc
        .forn
        .iter()
        .map(|(k, f)| Fornecedor {
            cnpj_cpf: if k.starts_with('#') {
                String::new()
            } else {
                k.clone()
            },
            nome: f.nome.clone(),
            valor: f.valor,
            n: f.n,
        })
        .collect();
    top.sort_by(|a, b| b.valor.cmp(&a.valor).then(a.nome.cmp(&b.nome)));
    top.truncate(TOP_FORNECEDORES);
    let (nome, partido, uf) = match atual {
        Some(a) => (a.nome.clone(), a.partido.clone(), a.uf.clone()),
        None => (acc.nome.clone(), acc.partido.clone(), acc.uf.clone()),
    };
    Gastos {
        casa,
        id: id.to_string(),
        nome,
        partido: opt(&partido),
        uf: opt(&uf),
        em_exercicio: atual.is_some(),
        dados_ate: ate.map(fmt_ym),
        total: acc.por_mes.values().sum(),
        mandato: Mandato {
            inicio: fmt_ym(ini),
            total: total_mandato,
            meses,
            media_mensal: (total_mandato as f64 / meses as f64).round() as i64,
        },
        por_ano: por_ano
            .into_iter()
            .map(|(ano, (valor, n))| AnoValor { ano, valor, n })
            .collect(),
        por_categoria,
        por_categoria_ano: acc
            .cat_ano
            .iter()
            .map(|((ano, categoria), (valor, _))| CategoriaAno {
                ano: *ano,
                categoria: categoria.clone(),
                valor: *valor,
            })
            .collect(),
        top_fornecedores: top,
        n_itens: acc.n,
        itens: acc.itens.drain(..).map(|(_, i)| i).collect(),
        cota: extras.cota,
        verba_gabinete: extras.verba,
        pessoal: extras.pessoal,
        subsidio: extras.subsidio,
        auxilios: extras.auxilios,
        fontes,
    }
}

/// Uma casa já lida: despesas acumuladas + quem está em exercício + extras.
pub struct CasaDados {
    pub casa: Casa,
    pub accs: Accs,
    pub atuais: HashMap<String, Atual>,
    pub extras: HashMap<String, Extras>,
    pub fontes: fn(&str) -> Vec<Fonte>,
}

struct Saida {
    ranking: Vec<RankingParlamentar>,
    categorias: Vec<RankingCategoria>,
    forn: HashMap<String, FornAcc>,
    por_grupo: grupos::PorGrupo,
    anos: std::collections::BTreeSet<u16>,
}

fn escreve_casa(
    dir: &Path,
    mut c: CasaDados,
    leg: (u16, u8),
    s: &mut Saida,
) -> Result<(usize, Option<String>)> {
    let ate = dados_ate(&c.accs);
    // categorias por ano (antes de consumir os acumulados)
    let mut cats: BTreeMap<(u16, &str), (i64, u32, Vec<IdValor>)> = BTreeMap::new();
    for (id, a) in &c.accs {
        for ((ano, cat), (v, n)) in &a.cat_ano {
            let e = cats.entry((*ano, cat)).or_default();
            e.0 += v;
            e.1 += n;
            e.2.push(IdValor {
                id: id.clone(),
                valor: *v,
            });
        }
        for (k, f) in &a.forn {
            let g = s.forn.entry(k.clone()).or_default();
            if g.nome.is_empty() {
                g.nome.clone_from(&f.nome);
            }
            g.valor += f.valor;
            g.n += f.n;
            g.ids += 1;
        }
        for ((gr, k), v) in &a.forn_grupo {
            s.por_grupo.soma(*gr, k, c.casa, id, v);
        }
    }
    for ((ano, cat), (valor, n, mut top)) in cats {
        top.sort_by(|a, b| b.valor.cmp(&a.valor).then(a.id.cmp(&b.id)));
        top.truncate(TOP_CATEGORIA);
        s.anos.insert(ano);
        s.categorias.push(RankingCategoria {
            casa: c.casa,
            ano,
            categoria: cat.to_string(),
            valor,
            n,
            top,
        });
    }
    let mut ids: Vec<String> = c.accs.keys().chain(c.atuais.keys()).cloned().collect();
    ids.sort();
    ids.dedup();
    let mut rk = Vec::new();
    for id in &ids {
        let ex = c.extras.remove(id).unwrap_or_default();
        let g = monta(
            c.casa,
            id,
            c.accs.get_mut(id),
            c.atuais.get(id),
            ex,
            ate,
            leg,
            (c.fontes)(id),
        );
        write(&dir.join(format!("{id}.json")), &g)?;
        rk.push(RankingParlamentar {
            casa: g.casa,
            id: g.id,
            nome: g.nome,
            partido: g.partido,
            uf: g.uf,
            em_exercicio: g.em_exercicio,
            mandato: g.mandato.total,
            por_ano: g.por_ano.iter().map(|a| (a.ano, a.valor)).collect(),
        });
    }
    rk.sort_by(|a, b| b.mandato.cmp(&a.mandato).then(a.id.cmp(&b.id)));
    s.ranking.extend(rk);
    Ok((ids.len(), ate.map(fmt_ym)))
}

pub fn run(o: &Opts) -> Result<Relatorio> {
    let g = o.out.join("v1/gastos");
    let leg = (inicio_legislatura(o.ano), 2);
    let mut r = Relatorio::default();
    let mut s = Saida {
        ranking: Vec::new(),
        categorias: Vec::new(),
        forn: HashMap::new(),
        por_grupo: Default::default(),
        anos: Default::default(),
    };
    let cam = camara::le(&o.cache.join("camara"), &mut r.despesas_camara)?;
    let (nd, ate_c) = escreve_casa(&g.join("deputado"), cam, leg, &mut s)?;
    r.deputados = nd;
    let sen = senado::le(&o.cache.join("senado"), &mut r.despesas_senado)?;
    let (ns, ate_s) = escreve_casa(&g.join("senador"), sen, leg, &mut s)?;
    r.senadores = ns;
    write(
        &g.join("fornecedores.json"),
        &std::mem::take(&mut s.por_grupo).monta(),
    )?;
    let mut forn: Vec<RankingFornecedor> = s
        .forn
        .into_iter()
        .map(|(k, f)| RankingFornecedor {
            f: Fornecedor {
                cnpj_cpf: if k.starts_with('#') { String::new() } else { k },
                nome: f.nome,
                valor: f.valor,
                n: f.n,
            },
            parlamentares: f.ids,
        })
        .collect();
    forn.sort_by(|a, b| b.f.valor.cmp(&a.f.valor).then(a.f.nome.cmp(&b.f.nome)));
    forn.truncate(TOP_RANKING_FORNECEDORES);
    write(
        &g.join("ranking.json"),
        &Ranking {
            anos: s.anos.into_iter().collect(),
            dados_ate: DadosAte {
                camara: ate_c,
                senado: ate_s,
            },
            parlamentares: s.ranking,
            categorias: s.categorias,
            fornecedores: forn,
        },
    )?;
    Ok(r)
}

/// Remove tags/scripts/estilos e colapsa espaços (páginas HTML oficiais).
pub fn texto_html(h: &str) -> String {
    let mut out = String::with_capacity(h.len() / 4);
    let mut rest = h;
    while let Some(i) = rest.find('<') {
        out.push_str(&rest[..i]);
        out.push(' ');
        let tail = &rest[i..];
        let lower = tail.get(..8).unwrap_or("").to_ascii_lowercase();
        let fim = if lower.starts_with("<script") {
            tail.find("</script>").map(|j| j + 9)
        } else if lower.starts_with("<style") {
            tail.find("</style>").map(|j| j + 8)
        } else {
            tail.find('>').map(|j| j + 1)
        };
        match fim {
            Some(j) => rest = &tail[j..],
            None => {
                rest = "";
            }
        }
    }
    out.push_str(rest);
    let out = out
        .replace("&nbsp;", " ")
        .replace("&rarr;", "→")
        .replace("&amp;", "&")
        .replace("&#39;", "'")
        .replace("&quot;", "\"");
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}
