//! Câmara: CEAP (Ano-YYYY.csv[.zip]), funcionários (dados abertos) e página oficial do deputado.

use super::{
    acumula, doc, texto_html, Accs, Atual, Casa, CasaDados, Cota, Despesa, Extras, Fonte, MesGasto,
    Pessoa, Pessoal, VerbaGabinete,
};
use crate::norm::parse_valor_br;
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;

pub const URL_COTAS: &str = "https://www.camara.leg.br/cotas/";
pub const URL_FUNCIONARIOS: &str =
    "https://dadosabertos.camara.leg.br/arquivos/funcionarios/csv/funcionarios.csv";

/// CSV UTF-8 `;` com cabeçalho; chama `f(get)` por linha.
fn csv_utf8(r: impl Read, mut f: impl FnMut(&dyn Fn(&str) -> String)) -> Result<()> {
    let mut rdr = csv::ReaderBuilder::new()
        .delimiter(b';')
        .flexible(true)
        .from_reader(r);
    let idx: HashMap<String, usize> = rdr
        .byte_headers()?
        .iter()
        .enumerate()
        .map(|(i, h)| {
            let h = String::from_utf8_lossy(h);
            (h.trim_start_matches('\u{feff}').trim().to_string(), i)
        })
        .collect();
    let mut rec = csv::ByteRecord::new();
    while rdr.read_byte_record(&mut rec)? {
        let get = |c: &str| {
            idx.get(c)
                .and_then(|&i| rec.get(i))
                .map(|b| String::from_utf8_lossy(b).trim().to_string())
                .unwrap_or_default()
        };
        f(&get);
    }
    Ok(())
}

fn centavos_ponto(s: &str) -> i64 {
    s.trim()
        .parse::<f64>()
        .map(super::reais_para_centavos)
        .unwrap_or(0)
}

/// Lê uma linha da CEAP. Linhas sem `ideCadastro` (lideranças) são ignoradas.
fn despesa(get: &dyn Fn(&str) -> String) -> Option<Despesa> {
    let id = get("ideCadastro");
    if id.is_empty() {
        return None;
    }
    let ano: u16 = get("numAno").parse().ok()?;
    let mes: u8 = get("numMes").parse().ok()?;
    let data = get("datEmissao");
    let data = match data.get(..10) {
        Some(d) if d.as_bytes()[4] == b'-' => d.to_string(),
        _ => format!("{ano}-{mes:02}"),
    };
    let s = |c| Some(get(c)).filter(|v| !v.is_empty());
    Some(Despesa {
        id,
        nome: get("txNomeParlamentar"),
        partido: get("sgPartido"),
        uf: get("sgUF"),
        ano,
        mes,
        data,
        categoria: get("txtDescricao"),
        fornecedor: get("txtFornecedor"),
        cnpj_cpf: doc(&get("txtCNPJCPF")),
        valor: centavos_ponto(&get("vlrLiquido")),
        url: s("urlDocumento"),
        det: s("txtTrecho"),
    })
}

fn arquivos_ceap(dir: &Path) -> Result<Vec<std::path::PathBuf>> {
    let mut v: Vec<_> = std::fs::read_dir(dir)
        .with_context(|| format!("lendo {}", dir.display()))?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            let n = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            n.starts_with("Ano-") && (n.ends_with(".csv") || n.ends_with(".csv.zip"))
        })
        .collect();
    v.sort();
    Ok(v)
}

pub fn despesas(dir: &Path, accs: &mut Accs) -> Result<usize> {
    let mut n = 0;
    for p in arquivos_ceap(dir)? {
        let mut f = |get: &dyn Fn(&str) -> String| {
            if let Some(d) = despesa(get) {
                n += 1;
                acumula(accs, d);
            }
        };
        let file = std::fs::File::open(&p)?;
        if p.extension().is_some_and(|e| e == "zip") {
            let mut z = zip::ZipArchive::new(file)?;
            let name = (0..z.len())
                .find(|&i| {
                    z.by_index(i)
                        .map(|e| e.name().ends_with(".csv"))
                        .unwrap_or(false)
                })
                .with_context(|| format!("sem CSV em {}", p.display()))?;
            csv_utf8(std::io::BufReader::new(z.by_index(name)?), &mut f)?;
        } else {
            csv_utf8(std::io::BufReader::new(file), &mut f)?;
        }
    }
    Ok(n)
}

/// Deputados em exercício (`/api/v2/deputados`).
pub fn atuais(p: &Path) -> Result<HashMap<String, Atual>> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct D {
        id: u64,
        nome: String,
        #[serde(default)]
        sigla_partido: Option<String>,
        #[serde(default)]
        sigla_uf: Option<String>,
    }
    #[derive(serde::Deserialize)]
    struct R {
        dados: Vec<D>,
    }
    let r: R = serde_json::from_slice(&std::fs::read(p)?)?;
    Ok(r.dados
        .into_iter()
        .map(|d| {
            (
                d.id.to_string(),
                Atual {
                    nome: d.nome,
                    partido: d.sigla_partido.unwrap_or_default(),
                    uf: d.sigla_uf.unwrap_or_default(),
                },
            )
        })
        .collect())
}

/// Pessoal lotado em gabinete de deputado (`uriLotacao` = .../deputados/<id>).
pub fn pessoal(p: &Path) -> Result<HashMap<String, Vec<Pessoa>>> {
    let mut m: HashMap<String, Vec<Pessoa>> = HashMap::new();
    csv_utf8(std::io::BufReader::new(std::fs::File::open(p)?), |get| {
        let uri = get("uriLotacao");
        let Some((_, id)) = uri.rsplit_once("/deputados/") else {
            return;
        };
        // o próprio deputado aparece lotado no gabinete
        if get("grupo") == "Parlamentar" {
            return;
        }
        let desde = Some(get("dataNomeacao"))
            .filter(|s| !s.is_empty())
            .or_else(|| Some(get("dataInicioHistorico")).filter(|s| !s.is_empty()));
        m.entry(id.to_string()).or_default().push(Pessoa {
            nome: get("nome"),
            cargo: get("cargo"),
            grupo: get("grupo"),
            desde,
            ..Default::default()
        });
    })?;
    for v in m.values_mut() {
        v.sort_by(|a, b| a.nome.cmp(&b.nome));
    }
    Ok(m)
}

/// Dados extraídos da página oficial `camara.leg.br/deputados/<id>`.
#[derive(Debug, Default)]
pub struct Pagina {
    pub ano: Option<u16>,
    pub subsidio: Option<i64>,
    pub cota_gasto: Option<i64>,
    pub cota_nao_utilizado: Option<i64>,
    pub verba_gasto: Option<i64>,
    pub verba_nao_utilizado: Option<i64>,
    pub verba_mes: Vec<(u8, i64)>,
    pub imovel_funcional: Option<String>,
    pub auxilio_moradia: Option<String>,
    pub auxilio_moradia_valor: Option<i64>,
    pub viagens_missao: Option<u32>,
}

const MESES: [&str; 12] = [
    "JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
];

/// Texto entre `a` (após) e `b` (antes), a partir de `de`.
fn entre<'a>(t: &'a str, a: &str, b: &str) -> Option<&'a str> {
    let i = t.find(a)? + a.len();
    let r = &t[i..];
    let j = r.find(b)?;
    Some(r[..j].trim().trim_start_matches('?').trim())
}

fn valor_apos(t: &str, rotulo: &str) -> Option<i64> {
    let i = t.find(rotulo)? + rotulo.len();
    let tok = t[i..].split_whitespace().next()?;
    tok.chars()
        .next()
        .filter(|c| c.is_ascii_digit())
        .map(|_| parse_valor_br(tok))
}

/// Bloco "Total ... Gasto mensal ... JAN v p% FEV v p%" -> (gasto, não utilizado, meses).
fn bloco(t: &str) -> (Option<i64>, Option<i64>, Vec<(u8, i64)>) {
    let gasto = valor_apos(t, "Percentual Gasto");
    let nao = valor_apos(t, "Não utilizado");
    let mut meses = Vec::new();
    if let Some(i) = t.find("Gasto mensal") {
        let toks: Vec<&str> = t[i..].split_whitespace().collect();
        for w in toks.windows(2) {
            if let Some(m) = MESES.iter().position(|m| *m == w[0]) {
                if w[1].starts_with(|c: char| c.is_ascii_digit()) {
                    meses.push((m as u8 + 1, parse_valor_br(w[1])));
                }
            }
        }
    }
    (gasto, nao, meses)
}

pub fn pagina(html: &str) -> Pagina {
    let t = texto_html(html);
    let mut p = Pagina::default();
    let Some(g) = t.find("Gastos e recursos") else {
        return p;
    };
    let t = &t[g..];
    p.ano = t["Gastos e recursos".len()..]
        .split_whitespace()
        .next()
        .and_then(|a| a.parse().ok());
    if let Some(c) = entre(t, "Cota parlamentar", "Verba de gabinete") {
        let (g, n, _) = bloco(c);
        p.cota_gasto = g;
        p.cota_nao_utilizado = n;
    }
    if let Some(v) = entre(t, "Verba de gabinete", "Pessoal de gabinete") {
        let (g, n, m) = bloco(v);
        p.verba_gasto = g;
        p.verba_nao_utilizado = n;
        p.verba_mes = m;
    }
    p.subsidio = entre(t, "Salário mensal bruto", "Imóvel funcional")
        .and_then(|s| s.strip_prefix("R$"))
        .map(parse_valor_br);
    p.imovel_funcional = entre(t, "Imóvel funcional", "Auxílio-moradia").map(str::to_string);
    p.auxilio_moradia =
        entre(t, "Auxílio-moradia", "Viagens em missão oficial").map(str::to_string);
    p.auxilio_moradia_valor = p
        .auxilio_moradia
        .as_deref()
        .and_then(|s| s.split_once("R$"))
        .map(|(_, v)| parse_valor_br(v));
    p.viagens_missao = t.find("Viagens em missão oficial").and_then(|i| {
        t[i + "Viagens em missão oficial".len()..]
            .split_whitespace()
            .find(|w| *w != "?")?
            .parse()
            .ok()
    });
    p
}

fn extras(p: Pagina, pessoas: Option<Vec<Pessoa>>) -> Extras {
    let ano = p.ano.unwrap_or(0);
    let cota = match (p.cota_gasto, p.cota_nao_utilizado) {
        (Some(g), Some(n)) => Some(Cota {
            ano,
            gasto: g,
            teto: g + n,
        }),
        _ => None,
    };
    let ult = p.verba_mes.last().copied();
    let verba = p.verba_gasto.map(|g| VerbaGabinete {
        ano,
        gasto: g,
        nao_utilizado: p.verba_nao_utilizado.unwrap_or(0),
        por_mes: p
            .verba_mes
            .iter()
            .map(|&(mes, gasto)| MesGasto { mes, gasto })
            .collect(),
    });
    Extras {
        cota,
        verba,
        pessoal: pessoas.map(|lista| Pessoal {
            n: lista.len(),
            custo_mensal: ult.map(|u| u.1),
            referencia: ult.map(|(m, _)| format!("{ano}-{m:02}")),
            lista,
        }),
        subsidio: p.subsidio,
        auxilios: super::Auxilios {
            imovel_funcional: p.imovel_funcional,
            auxilio_moradia: p.auxilio_moradia,
            auxilio_moradia_valor: p.auxilio_moradia_valor,
            viagens_missao: p.viagens_missao,
        },
        mandato_inicio: None,
    }
}

fn fontes(id: &str) -> Vec<Fonte> {
    vec![
        Fonte {
            nome: "Cota parlamentar (CEAP) — arquivos anuais da Câmara",
            url: URL_COTAS.to_string(),
        },
        Fonte {
            nome: "Página do deputado (gastos e recursos)",
            url: format!("https://www.camara.leg.br/deputados/{id}"),
        },
        Fonte {
            nome: "Verba de gabinete",
            url: format!("https://www.camara.leg.br/deputados/{id}/verba-gabinete"),
        },
        Fonte {
            nome: "Pessoal de gabinete (remuneração individual)",
            url: format!("https://www.camara.leg.br/deputados/{id}/pessoal-gabinete"),
        },
        Fonte {
            nome: "Funcionários — dados abertos da Câmara",
            url: URL_FUNCIONARIOS.to_string(),
        },
    ]
}

/// Lê tudo da Câmara em `dir` (= <cache>/camara).
pub fn le(dir: &Path, n: &mut usize) -> Result<CasaDados> {
    let mut accs = Accs::new();
    *n = despesas(dir, &mut accs)?;
    let atuais = match dir.join("deputados.json") {
        p if p.exists() => atuais(&p)?,
        _ => HashMap::new(),
    };
    let mut pess = match dir.join("funcionarios.csv") {
        p if p.exists() => pessoal(&p)?,
        _ => HashMap::new(),
    };
    let mut ex = HashMap::new();
    let ids: std::collections::BTreeSet<String> =
        accs.keys().chain(atuais.keys()).cloned().collect();
    for id in ids {
        let pag = std::fs::read_to_string(dir.join(format!("deputados/{id}.html")))
            .map(|h| pagina(&h))
            .unwrap_or_default();
        let pessoas = pess.remove(&id);
        if pessoas.is_some() || pag.ano.is_some() {
            ex.insert(id, extras(pag, pessoas));
        }
    }
    Ok(CasaDados {
        casa: Casa::Camara,
        accs,
        atuais,
        extras: ex,
        fontes,
    })
}
