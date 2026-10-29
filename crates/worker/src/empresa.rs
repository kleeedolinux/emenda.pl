//! One company (`/empresa/<cnpj>`): joins `v1/gastos/fornecedores.json` (hired with the
//! parliamentary allowance), `v1/beneficiados.json` (paid by amendments) and
//! `v1/gastos/ranking.json` (names of who hired). Pure.

use crate::cards::{i, s};
use serde_json::Value;

/// Plain-language label of a `GrupoGasto` (same as the site).
pub fn grupo_rotulo(g: &str) -> &'static str {
    match g {
        "passagens" => "Passagens e voos",
        "divulgacao" => "Propaganda e marketing",
        "carros" => "Carros e combustível",
        "consultorias" => "Consultorias",
        "escritorio" => "Escritório",
        "hospedagem" => "Hotel e comida",
        "seguranca" => "Segurança",
        _ => "Outros",
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Contratante {
    pub casa: String,
    pub id: String,
    pub valor: i64,
    pub nome: Option<String>,
    /// "MDB-AP"
    pub sigla: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Empresa {
    pub cnpj: String,
    pub nome: String,
    /// Allowance (cota) paid to the company, cents.
    pub cota: i64,
    pub parlamentares: i64,
    /// (grupo, cents), largest first.
    pub grupos: Vec<(String, i64)>,
    pub contratantes: Vec<Contratante>,
    /// Amendment money received, cents.
    pub emendas: i64,
}

fn arr<'a>(v: &'a Value, ptr: &str) -> &'a [Value] {
    v.pointer(ptr)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

pub fn monta(
    cnpj: &str,
    forn: Option<&Value>,
    ben: Option<&Value>,
    ranking: Option<&Value>,
) -> Option<Empresa> {
    let mut e = Empresa {
        cnpj: cnpj.into(),
        ..Default::default()
    };
    let mut cs: Vec<Contratante> = Vec::new();
    for g in forn.map_or(&[][..], |f| arr(f, "/grupos")) {
        let Some(f) = arr(g, "/fornecedores")
            .iter()
            .find(|f| s(f, "/cnpjCpf").as_deref() == Some(cnpj))
        else {
            continue;
        };
        let v = i(f, "/valor").unwrap_or(0);
        if e.nome.is_empty() {
            e.nome = s(f, "/nome").unwrap_or_default();
        }
        e.cota += v;
        e.parlamentares = e.parlamentares.max(i(f, "/parlamentares").unwrap_or(0));
        e.grupos.push((s(g, "/grupo").unwrap_or_default(), v));
        for c in arr(f, "/contratantes") {
            let (casa, id) = (
                s(c, "/casa").unwrap_or_default(),
                s(c, "/id").unwrap_or_default(),
            );
            let v = i(c, "/valor").unwrap_or(0);
            match cs.iter_mut().find(|x| x.casa == casa && x.id == id) {
                Some(x) => x.valor += v,
                None => cs.push(Contratante {
                    casa,
                    id,
                    valor: v,
                    nome: None,
                    sigla: None,
                }),
            }
        }
    }
    for k in ["/empresas", "/entidades", "/fundos"] {
        if let Some(b) = ben
            .map_or(&[][..], |b| arr(b, k))
            .iter()
            .find(|b| s(b, "/documento").as_deref() == Some(cnpj))
        {
            e.emendas += i(b, "/valor").unwrap_or(0);
            if e.nome.is_empty() {
                e.nome = s(b, "/nome").unwrap_or_default();
            }
        }
    }
    if e.nome.is_empty() {
        return None;
    }
    let ps = ranking.map_or(&[][..], |r| arr(r, "/parlamentares"));
    for c in &mut cs {
        if let Some(p) = ps.iter().find(|p| {
            s(p, "/casa").as_deref() == Some(&c.casa) && s(p, "/id").as_deref() == Some(&c.id)
        }) {
            c.nome = s(p, "/nome");
            c.sigla = match (s(p, "/partido"), s(p, "/uf")) {
                (Some(pa), Some(uf)) => Some(format!("{pa}-{uf}")),
                (Some(pa), None) => Some(pa),
                _ => None,
            };
        }
    }
    cs.sort_by(|a, b| b.valor.cmp(&a.valor).then_with(|| a.id.cmp(&b.id)));
    e.grupos.sort_by_key(|g| std::cmp::Reverse(g.1));
    e.contratantes = cs;
    Some(e)
}
