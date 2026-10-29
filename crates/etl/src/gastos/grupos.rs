//! v1/gastos/fornecedores.json — empresas mais contratadas com a cota, por tipo de gasto,
//! e quais parlamentares contrataram cada uma.

use super::{Casa, Fornecedor};
use serde::Serialize;
use std::collections::HashMap;

pub const TOP_FORNECEDORES: usize = 50;
pub const TOP_CONTRATANTES: usize = 10;

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Grupo {
    Passagens,
    Divulgacao,
    Carros,
    Consultorias,
    Escritorio,
    Hospedagem,
    Seguranca,
    Outros,
}

/// Grupo do dia a dia para a categoria oficial (Câmara ou Senado).
pub fn grupo(categoria: &str) -> Grupo {
    use Grupo::*;
    let c = categoria.to_lowercase();
    let tem = |p: &[&str]| p.iter().any(|x| c.contains(x));
    if tem(&["passage", "aeronave", "embarca"]) {
        Passagens
    } else if tem(&["divulga"]) {
        Divulgacao
    } else if tem(&["veículo", "combust", "locomoção", "táxi", "pedágio"]) {
        Carros
    } else if tem(&["consultori"]) {
        Consultorias
    } else if tem(&["hospedagem", "alimentação"]) {
        Hospedagem
    } else if tem(&["segurança"]) {
        Seguranca
    } else if tem(&[
        "escritório",
        "telefonia",
        "postais",
        "assinatura",
        "token",
        "material de consumo",
    ]) {
        Escritorio
    } else {
        Outros
    }
}

#[derive(Serialize, Clone)]
pub struct Contratante {
    pub casa: Casa,
    pub id: String,
    pub valor: i64,
}

#[derive(Serialize)]
pub struct FornecedorGrupo {
    #[serde(flatten)]
    pub f: Fornecedor,
    pub parlamentares: usize,
    pub contratantes: Vec<Contratante>,
}

#[derive(Serialize)]
pub struct GrupoFornecedores {
    pub grupo: Grupo,
    pub valor: i64,
    pub fornecedores: Vec<FornecedorGrupo>,
}

#[derive(Serialize)]
pub struct Fornecedores {
    pub grupos: Vec<GrupoFornecedores>,
}

#[derive(Default)]
pub(super) struct Acc {
    nome: String,
    valor: i64,
    n: u32,
    contratantes: Vec<Contratante>,
}

/// (grupo, chave do fornecedor) -> acumulado de todas as casas.
#[derive(Default)]
pub(super) struct PorGrupo(HashMap<(Grupo, String), Acc>);

impl PorGrupo {
    /// `v` = (nome, valor, n) do fornecedor neste grupo para um parlamentar.
    pub(super) fn soma(
        &mut self,
        g: Grupo,
        chave: &str,
        casa: Casa,
        id: &str,
        v: &(String, i64, u32),
    ) {
        let a = self.0.entry((g, chave.to_string())).or_default();
        if a.nome.is_empty() {
            a.nome.clone_from(&v.0);
        }
        a.valor += v.1;
        a.n += v.2;
        a.contratantes.push(Contratante {
            casa,
            id: id.to_string(),
            valor: v.1,
        });
    }

    pub(super) fn monta(self) -> Fornecedores {
        let mut por: HashMap<Grupo, Vec<FornecedorGrupo>> = HashMap::new();
        for ((g, k), mut a) in self.0 {
            a.contratantes
                .sort_by(|x, y| y.valor.cmp(&x.valor).then_with(|| x.id.cmp(&y.id)));
            let parlamentares = a.contratantes.len();
            a.contratantes.truncate(TOP_CONTRATANTES);
            por.entry(g).or_default().push(FornecedorGrupo {
                f: Fornecedor {
                    cnpj_cpf: if k.starts_with('#') { String::new() } else { k },
                    nome: a.nome,
                    valor: a.valor,
                    n: a.n,
                },
                parlamentares,
                contratantes: a.contratantes,
            });
        }
        let mut grupos: Vec<GrupoFornecedores> = por
            .into_iter()
            .map(|(grupo, mut fs)| {
                let valor = fs.iter().map(|f| f.f.valor).sum();
                fs.sort_by(|a, b| {
                    b.f.valor
                        .cmp(&a.f.valor)
                        .then_with(|| a.f.nome.cmp(&b.f.nome))
                });
                fs.truncate(TOP_FORNECEDORES);
                GrupoFornecedores {
                    grupo,
                    valor,
                    fornecedores: fs,
                }
            })
            .collect();
        grupos.sort_by(|a, b| b.valor.cmp(&a.valor).then(a.grupo.cmp(&b.grupo)));
        Fornecedores { grupos }
    }
}
