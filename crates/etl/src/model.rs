//! Tipos de saída: espelham `packages/contracts/src/index.ts` (camelCase, centavos).

use crate::norm::TipoEmenda;
use serde::Serialize;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Totais {
    pub n: u64,
    pub empenhado: i64,
    pub liquidado: i64,
    pub pago: i64,
    pub rap_pago: i64,
}

impl Totais {
    pub fn add(&mut self, e: &EmendaItem) {
        self.n += 1;
        self.empenhado += e.empenhado;
        self.liquidado += e.liquidado;
        self.pago += e.pago;
        self.rap_pago += e.rap_pago;
    }
}

#[derive(Serialize)]
pub struct Com<K: Serialize> {
    #[serde(flatten)]
    pub k: K,
    #[serde(flatten)]
    pub t: Totais,
}

#[derive(Serialize)]
pub struct Ano {
    pub ano: u16,
}
#[derive(Serialize)]
pub struct Tipo {
    pub tipo: TipoEmenda,
}
#[derive(Serialize)]
pub struct Funcao {
    pub funcao: String,
}
#[derive(Serialize)]
pub struct UfK {
    pub uf: String,
}
#[derive(Serialize)]
pub struct UfNome {
    pub uf: String,
    pub nome: String,
}
#[derive(Serialize)]
pub struct MunK {
    pub ibge: String,
    pub nome: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub version: &'static str,
    pub generated_at: String,
    pub fonte: &'static str,
    pub anos: Vec<u16>,
    pub totais: Totais,
}

#[derive(Serialize)]
pub struct Fluxo {
    pub tipo: TipoEmenda,
    pub funcao: String,
    pub uf: String,
    pub pago: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Brasil {
    pub totais: Totais,
    pub por_ano: Vec<Com<Ano>>,
    pub por_tipo: Vec<Com<Tipo>>,
    pub por_funcao: Vec<Com<Funcao>>,
    pub por_uf: Vec<Com<UfNome>>,
    pub fluxo: Vec<Fluxo>,
}

#[derive(Serialize, Clone)]
pub struct AutorResumo {
    pub codigo: String,
    pub nome: String,
    pub chave: String,
    pub n: u64,
    pub pago: i64,
    pub empenhado: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Uf {
    pub uf: String,
    pub nome: String,
    pub totais: Totais,
    pub por_tipo: Vec<Com<Tipo>>,
    pub por_ano: Vec<Com<Ano>>,
    pub municipios: Vec<Com<MunK>>,
    pub autores: Vec<AutorResumo>,
}

#[derive(Serialize, Clone)]
pub struct AutorRef {
    pub codigo: String,
    pub nome: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmendaItem {
    pub codigo: String,
    pub numero: String,
    pub ano: u16,
    pub tipo: TipoEmenda,
    pub tipo_original: String,
    pub autor: AutorRef,
    pub localidade: String,
    pub ibge: Option<String>,
    pub uf: Option<String>,
    pub funcao: String,
    pub subfuncao: String,
    pub programa: String,
    pub acao: String,
    pub empenhado: i64,
    pub liquidado: i64,
    pub pago: i64,
    pub rap_pago: i64,
    /// interno: usado no saldo aberto (não serializado para manter o contrato)
    #[serde(skip)]
    pub rap_cancelado: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Favorecido {
    pub documento: String,
    pub nome: String,
    pub tipo: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub natureza_juridica: Option<String>,
    pub valor: i64,
}

#[derive(Serialize, Clone)]
pub struct Convenio {
    pub numero: String,
    pub objeto: String,
    pub convenente: String,
    pub data: String,
    pub valor: i64,
    pub emenda: String,
}

#[derive(Serialize, Clone)]
pub struct Vice {
    pub nome: String,
    pub partido: String,
}

#[derive(Serialize, Clone)]
pub struct Prefeito {
    pub nome: String,
    pub partido: String,
    pub eleicao: u16,
    pub situacao: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vice: Option<Vice>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Municipio<'a> {
    pub ibge: &'a str,
    pub nome: &'a str,
    pub uf: &'a str,
    pub prefeito: Option<&'a Prefeito>,
    pub totais: Totais,
    pub por_tipo: Vec<Com<Tipo>>,
    pub autores: Vec<AutorResumo>,
    pub emendas: Vec<&'a EmendaItem>,
    pub favorecidos: Vec<Favorecido>,
    pub convenios: Vec<&'a Convenio>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Autor<'a> {
    pub codigo: &'a str,
    pub nome: &'a str,
    pub chave: String,
    pub totais: Totais,
    pub por_ano: Vec<Com<Ano>>,
    pub por_uf: Vec<Com<UfK>>,
    pub por_tipo: Vec<Com<Tipo>>,
    pub emendas: Vec<&'a EmendaItem>,
    pub favorecidos: Vec<Favorecido>,
}
