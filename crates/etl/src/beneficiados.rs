//! v1/beneficiados.json — quem mais recebe no Brasil, em três grupos:
//! empresas privadas, entidades sem fins lucrativos e fundos públicos.
//! Estatais (Caixa, BB), governos e órgãos ficam de fora: são intermediários, não destino final.

use crate::model::Favorecido;
use crate::write;
use anyhow::Result;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

pub const TOP: usize = 100;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Classe {
    Empresa,
    Entidade,
    Fundo,
}

/// Classe pela natureza jurídica do Portal; `None` = não entra no ranking.
pub fn classe(tipo: &str, natureza: &str) -> Option<Classe> {
    if tipo != "Pessoa Jurídica" {
        return None;
    }
    const EMPRESA: [&str; 12] = [
        "Sociedade Empresária",
        "Sociedade Anônima",
        "Sociedade Simples",
        "Sociedade Unipessoal",
        "Sociedade em Conta",
        "Empresário",
        "Empresa Individual",
        "Empresa Simples",
        "Empresa Domiciliada no Exterior",
        "Estabelecimento, no Brasil, de Sociedade Estrangeira",
        "Consórcio de Sociedades",
        "Cooperativa",
    ];
    const ENTIDADE: [&str; 7] = [
        "Associação Privada",
        "Fundação Privada",
        "Organização Social",
        "Organização Religiosa",
        "Serviço Social Autônomo",
        "Entidade Sindical",
        "Condomínio",
    ];
    if natureza.starts_with("Fundo Público") {
        Some(Classe::Fundo)
    } else if EMPRESA.iter().any(|p| natureza.starts_with(p)) {
        Some(Classe::Empresa)
    } else if ENTIDADE.iter().any(|p| natureza.starts_with(p)) {
        Some(Classe::Entidade)
    } else {
        None
    }
}

#[derive(Serialize)]
pub struct Beneficiado {
    #[serde(flatten)]
    pub favorecido: Favorecido,
    pub uf: String,
    pub municipio: String,
}

#[derive(Serialize)]
pub struct Totais {
    pub empresas: i64,
    pub entidades: i64,
    pub fundos: i64,
}

#[derive(Serialize)]
pub struct Beneficiados {
    pub totais: Totais,
    pub empresas: Vec<Beneficiado>,
    pub entidades: Vec<Beneficiado>,
    pub fundos: Vec<Beneficiado>,
}

#[derive(Default)]
struct Acc {
    nome: String,
    tipo: String,
    natureza: String,
    uf: String,
    municipio: String,
    valor: i64,
}

/// Acumula linhas de PorFavorecido.csv por classe e documento.
#[derive(Default)]
pub struct Ranking(HashMap<Classe, HashMap<String, Acc>>);

impl Ranking {
    #[allow(clippy::too_many_arguments)]
    pub fn somar(
        &mut self,
        documento: &str,
        nome: &str,
        tipo: &str,
        natureza: &str,
        uf: &str,
        municipio: &str,
        valor: i64,
    ) {
        let Some(c) = classe(tipo, natureza) else {
            return;
        };
        let a = self
            .0
            .entry(c)
            .or_default()
            .entry(documento.to_string())
            .or_default();
        if a.nome.is_empty() {
            a.nome = nome.to_string();
            a.tipo = tipo.to_string();
            a.natureza = natureza.to_string();
            a.uf = uf.to_string();
            a.municipio = municipio.to_string();
        }
        a.valor += valor;
    }

    fn total(&self, c: Classe) -> i64 {
        self.0
            .get(&c)
            .map_or(0, |m| m.values().map(|a| a.valor).sum())
    }

    fn top(&mut self, c: Classe) -> Vec<Beneficiado> {
        let mut v: Vec<_> = self.0.remove(&c).unwrap_or_default().into_iter().collect();
        v.sort_by(|a, b| b.1.valor.cmp(&a.1.valor).then_with(|| a.0.cmp(&b.0)));
        v.truncate(TOP);
        v.into_iter()
            .map(|(documento, a)| Beneficiado {
                favorecido: Favorecido {
                    documento,
                    nome: a.nome,
                    tipo: a.tipo,
                    natureza_juridica: Some(a.natureza),
                    valor: a.valor,
                },
                uf: a.uf,
                municipio: a.municipio,
            })
            .collect()
    }

    pub fn escrever(mut self, v1: &Path) -> Result<()> {
        let totais = Totais {
            empresas: self.total(Classe::Empresa),
            entidades: self.total(Classe::Entidade),
            fundos: self.total(Classe::Fundo),
        };
        let b = Beneficiados {
            totais,
            empresas: self.top(Classe::Empresa),
            entidades: self.top(Classe::Entidade),
            fundos: self.top(Classe::Fundo),
        };
        write(&v1.join("beneficiados.json"), &b)
    }
}
