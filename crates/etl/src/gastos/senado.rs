//! Senado: CEAPS, senadores em exercício, servidores lotados em gabinete, remunerações, auxílios.

use super::{
    acumula, doc, reais_para_centavos, ym, Accs, Atual, Auxilios, Casa, CasaDados, Despesa, Extras,
    Fonte, Pessoa, Pessoal,
};
use crate::norm::{chave_nome, parse_valor_br};
use anyhow::Result;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

pub const API: &str = "https://adm.senado.gov.br/adm-dadosabertos/api/v1";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Ceaps {
    ano: u16,
    mes: u8,
    cod_senador: u64,
    nome_senador: String,
    tipo_despesa: Option<String>,
    cpf_cnpj: Option<String>,
    fornecedor: Option<String>,
    data: Option<String>,
    detalhamento: Option<String>,
    valor_reembolsado: f64,
}

fn arquivos(dir: &Path, prefixo: &str) -> Result<Vec<std::path::PathBuf>> {
    let mut v: Vec<_> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            let n = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            n.starts_with(prefixo) && n.ends_with(".json")
        })
        .collect();
    v.sort();
    Ok(v)
}

pub fn despesas(dir: &Path, accs: &mut Accs) -> Result<usize> {
    let mut n = 0;
    for p in arquivos(dir, "ceaps-")? {
        let v: Vec<Ceaps> = serde_json::from_slice(&std::fs::read(&p)?)?;
        for c in v {
            let data = c
                .data
                .filter(|d| d.len() >= 10)
                .map(|d| d[..10].to_string())
                .unwrap_or_else(|| format!("{}-{:02}", c.ano, c.mes));
            n += 1;
            acumula(
                accs,
                Despesa {
                    id: c.cod_senador.to_string(),
                    nome: c.nome_senador,
                    partido: String::new(),
                    uf: String::new(),
                    ano: c.ano,
                    mes: c.mes,
                    data,
                    categoria: c.tipo_despesa.unwrap_or_default(),
                    fornecedor: c.fornecedor.unwrap_or_default(),
                    cnpj_cpf: doc(c.cpf_cnpj.as_deref().unwrap_or("")),
                    valor: reais_para_centavos(c.valor_reembolsado),
                    url: None,
                    det: c.detalhamento.filter(|d| !d.trim().is_empty()),
                },
            );
        }
    }
    Ok(n)
}

pub struct Senador {
    pub atual: Atual,
    pub nome_completo: String,
    pub inicio: Option<(u16, u8)>,
}

/// `legis.senado.leg.br/dadosabertos/senador/lista/atual.json`.
pub fn atuais(p: &Path) -> Result<HashMap<String, Senador>> {
    let v: serde_json::Value = serde_json::from_slice(&std::fs::read(p)?)?;
    let lista = &v["ListaParlamentarEmExercicio"]["Parlamentares"]["Parlamentar"];
    let s = |x: &serde_json::Value| x.as_str().unwrap_or("").to_string();
    Ok(lista
        .as_array()
        .map(|a| a.as_slice())
        .unwrap_or_default()
        .iter()
        .map(|p| {
            let i = &p["IdentificacaoParlamentar"];
            let ini = p["Mandato"]["PrimeiraLegislaturaDoMandato"]["DataInicio"]
                .as_str()
                .and_then(ym);
            (
                s(&i["CodigoParlamentar"]),
                Senador {
                    atual: Atual {
                        nome: s(&i["NomeParlamentar"]),
                        partido: s(&i["SiglaPartidoParlamentar"]),
                        uf: s(&i["UfParlamentar"]),
                    },
                    nome_completo: s(&i["NomeCompletoParlamentar"]),
                    inicio: ini,
                },
            )
        })
        .collect())
}

#[derive(Deserialize)]
struct Nome {
    nome: Option<String>,
}

#[derive(Deserialize)]
struct Servidor {
    nome: String,
    vinculo: Option<String>,
    cargo: Option<Nome>,
    funcao: Option<Nome>,
    lotacao: Option<Nome>,
    ano_admissao: Option<u16>,
}

#[derive(Deserialize)]
struct Remuneracao {
    nome: String,
    ano: u16,
    mes: u8,
    tipo_folha: Option<String>,
    remuneracao_basica: Option<String>,
    vantagens_pessoais: Option<String>,
    funcao_comissionada: Option<String>,
}

/// Remuneração bruta fixa (básica + vantagens pessoais + função) da folha normal, por nome.
/// Nomes repetidos ficam de fora (não há chave estável entre os dois conjuntos).
fn remuneracoes(dir: &Path) -> Result<(HashMap<String, i64>, Option<String>)> {
    let Some(p) = arquivos(dir, "remuneracoes-")?.into_iter().max_by_key(|p| {
        let n = p
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let mut it = n.trim_start_matches("remuneracoes-").split('-');
        let a: u32 = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
        let m: u32 = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
        a * 100 + m
    }) else {
        return Ok((HashMap::new(), None));
    };
    let v: Vec<Remuneracao> = serde_json::from_slice(&std::fs::read(&p)?)?;
    let mut m: HashMap<String, Option<i64>> = HashMap::new();
    let mut refm = None;
    for r in v {
        if r.tipo_folha.as_deref() != Some("Normal") {
            continue;
        }
        refm = Some(format!("{}-{:02}", r.ano, r.mes));
        let f = |s: &Option<String>| s.as_deref().map(parse_valor_br).unwrap_or(0);
        let bruto = f(&r.remuneracao_basica) + f(&r.vantagens_pessoais) + f(&r.funcao_comissionada);
        m.entry(chave_nome(&r.nome))
            .and_modify(|e| *e = None)
            .or_insert(Some(bruto));
    }
    Ok((
        m.into_iter().filter_map(|(k, v)| Some((k, v?))).collect(),
        refm,
    ))
}

fn capitaliza(s: &str) -> String {
    let l = s.to_lowercase();
    let mut c = l.chars();
    c.next()
        .map(|f| f.to_uppercase().collect::<String>() + c.as_str())
        .unwrap_or_default()
}

/// "Gabinete do Senador X" / "Escritório de Apoio nº 1 da Senadora X" -> (local, chave do nome).
fn lotacao_gabinete(l: &str) -> Option<(String, String)> {
    for sep in [" do Senador ", " da Senadora "] {
        if let Some((local, nome)) = l.split_once(sep) {
            if local.starts_with("Gabinete") || local.starts_with("Escritório") {
                return Some((local.trim().to_string(), chave_nome(nome)));
            }
        }
    }
    None
}

#[derive(Deserialize)]
struct Aux {
    #[serde(rename = "nomeParlamentar")]
    nome: Option<String>,
    #[serde(rename = "auxilioMoradia")]
    auxilio: Option<String>,
    #[serde(rename = "imovelFuncional")]
    imovel: Option<String>,
}

#[derive(Deserialize)]
struct Envelope<T> {
    data: T,
}

fn fontes(id: &str) -> Vec<Fonte> {
    vec![
        Fonte {
            nome: "CEAPS — dados abertos administrativos do Senado",
            url: "https://adm.senado.gov.br/adm-dadosabertos/swagger-ui/index.html".to_string(),
        },
        Fonte {
            nome: "Recursos utilizados pelo senador",
            url: format!("{API}/senadores/{id}/recursos-utilizados"),
        },
        Fonte {
            nome: "Servidores ativos (lotação)",
            url: format!("{API}/servidores/servidores/ativos"),
        },
        Fonte {
            nome: "Auxílio-moradia e imóveis funcionais",
            url: format!("{API}/senadores/auxilio-moradia-imoveis-funcionais"),
        },
        Fonte {
            nome: "Página do senador",
            url: format!("https://www25.senado.leg.br/web/senadores/senador/-/perfil/{id}"),
        },
    ]
}

fn le_json<T: serde::de::DeserializeOwned>(p: &Path) -> Result<Option<T>> {
    if !p.exists() {
        return Ok(None);
    }
    Ok(Some(serde_json::from_slice(&std::fs::read(p)?)?))
}

/// Lê tudo do Senado em `dir` (= <cache>/senado).
pub fn le(dir: &Path, n: &mut usize) -> Result<CasaDados> {
    let mut accs = Accs::new();
    *n = despesas(dir, &mut accs)?;
    let sen = match dir.join("atual.json") {
        p if p.exists() => atuais(&p)?,
        _ => HashMap::new(),
    };
    let (rem, refm) = remuneracoes(dir)?;
    let servidores: Vec<Servidor> = le_json(&dir.join("servidores.json"))?.unwrap_or_default();
    let aux: Vec<Aux> = le_json::<Envelope<Vec<Aux>>>(&dir.join("auxmoradia.json"))?
        .map(|e| e.data)
        .unwrap_or_default();

    let mut por_nome: HashMap<String, Vec<Pessoa>> = HashMap::new();
    for s in servidores {
        if s.vinculo.as_deref() == Some("PARLAMENTAR") {
            continue;
        }
        let Some((local, chave)) = s
            .lotacao
            .as_ref()
            .and_then(|l| l.nome.as_deref())
            .and_then(lotacao_gabinete)
        else {
            continue;
        };
        let local = local.trim_start_matches("Gabinete").trim();
        let local = if local.is_empty() { "Gabinete" } else { local };
        let cargo = s
            .cargo
            .and_then(|c| c.nome)
            .or_else(|| s.funcao.and_then(|f| f.nome))
            .unwrap_or_default();
        por_nome.entry(chave).or_default().push(Pessoa {
            remuneracao: rem.get(&chave_nome(&s.nome)).copied(),
            nome: s.nome,
            cargo,
            grupo: capitaliza(s.vinculo.as_deref().unwrap_or("")),
            local: Some(local.to_string()),
            desde: s.ano_admissao.map(|a| a.to_string()),
        });
    }
    let aux: HashMap<String, Aux> = aux
        .into_iter()
        .filter_map(|a| Some((chave_nome(a.nome.as_deref()?), a)))
        .collect();

    let mut atuais = HashMap::new();
    let mut extras = HashMap::new();
    for (id, s) in sen {
        let chave = chave_nome(&s.atual.nome);
        // lotação pode usar nome mais longo ("Weverton" -> "Weverton Rocha"); só se único
        let chave_lot = if por_nome.contains_key(&chave) {
            chave.clone()
        } else {
            let pref = format!("{chave} ");
            let mut c = por_nome.keys().filter(|k| k.starts_with(&pref));
            match (c.next(), c.next()) {
                (Some(k), None) => k.clone(),
                _ => chave.clone(),
            }
        };
        let lista = por_nome.remove(&chave_lot).map(|mut l| {
            l.sort_by(|a, b| a.nome.cmp(&b.nome));
            l
        });
        let a = aux
            .get(&chave)
            .or_else(|| aux.get(&chave_nome(&s.nome_completo)));
        let sim_nao = |v: Option<&str>, s: &str, n: &str| match v {
            Some("S") => Some(s.to_string()),
            Some("N") => Some(n.to_string()),
            _ => None,
        };
        extras.insert(
            id.clone(),
            Extras {
                pessoal: lista.map(|lista| Pessoal {
                    n: lista.len(),
                    custo_mensal: lista
                        .iter()
                        .any(|p| p.remuneracao.is_some())
                        .then(|| lista.iter().filter_map(|p| p.remuneracao).sum()),
                    referencia: refm.clone(),
                    lista,
                }),
                subsidio: rem.get(&chave_nome(&s.nome_completo)).copied(),
                auxilios: Auxilios {
                    imovel_funcional: a
                        .and_then(|a| sim_nao(a.imovel.as_deref(), "Utiliza", "Não utiliza")),
                    auxilio_moradia: a
                        .and_then(|a| sim_nao(a.auxilio.as_deref(), "Recebe", "Não recebe")),
                    ..Default::default()
                },
                mandato_inicio: s.inicio,
                ..Default::default()
            },
        );
        atuais.insert(id, s.atual);
    }
    Ok(CasaDados {
        casa: Casa::Senado,
        accs,
        atuais,
        extras,
        fontes,
    })
}
