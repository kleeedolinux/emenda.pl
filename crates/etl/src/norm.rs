//! Funções puras espelhando `packages/contracts/src/index.ts`.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TipoEmenda {
    Pix,
    Individual,
    Bancada,
    Comissao,
    Relator,
    Outra,
}

impl TipoEmenda {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pix => "pix",
            Self::Individual => "individual",
            Self::Bancada => "bancada",
            Self::Comissao => "comissao",
            Self::Relator => "relator",
            Self::Outra => "outra",
        }
    }
}

/// Igual a `classificarTipo` (TS).
pub fn classificar_tipo(original: &str) -> TipoEmenda {
    let t = sem_acento(original).to_lowercase();
    if t.contains("transferencias especiais") || t.contains("transferencia especial") {
        TipoEmenda::Pix
    } else if t.contains("relator") {
        TipoEmenda::Relator
    } else if t.contains("comissao") {
        TipoEmenda::Comissao
    } else if t.contains("bancada") {
        TipoEmenda::Bancada
    } else if t.contains("individual") {
        TipoEmenda::Individual
    } else {
        TipoEmenda::Outra
    }
}

/// Remove acentos do bloco Latin-1 (suficiente para fontes em ISO-8859-1).
pub fn sem_acento(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'à'..='å' => 'a',
            'À'..='Å' => 'A',
            'ç' => 'c',
            'Ç' => 'C',
            'è'..='ë' => 'e',
            'È'..='Ë' => 'E',
            'ì'..='ï' => 'i',
            'Ì'..='Ï' => 'I',
            'ñ' => 'n',
            'Ñ' => 'N',
            'ò'..='ö' | 'ø' => 'o',
            'Ò'..='Ö' | 'Ø' => 'O',
            'ù'..='ü' => 'u',
            'Ù'..='Ü' => 'U',
            'ý' | 'ÿ' => 'y',
            'Ý' => 'Y',
            c => c,
        })
        .collect()
}

/// Igual a `chaveNome` (TS).
pub fn chave_nome(s: &str) -> String {
    let up: String = sem_acento(s)
        .to_uppercase()
        .chars()
        .map(|c| if c.is_ascii_uppercase() { c } else { ' ' })
        .collect();
    up.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Chave de casamento de município: nome sem espaços/pontuação + UF.
pub fn chave_municipio(nome: &str, uf: &str) -> String {
    format!(
        "{}|{}",
        chave_nome(nome).replace(' ', ""),
        uf.trim().to_uppercase()
    )
}

/// Igual a `parseValorBR` (TS): "1450000,00" -> centavos.
pub fn parse_valor_br(s: &str) -> i64 {
    let v = s.trim();
    if v.is_empty() {
        return 0;
    }
    let (neg, v) = match v.strip_prefix('-') {
        Some(r) => (true, r),
        None => (false, v),
    };
    let v = v.replace('.', "");
    let (int, dec) = v.split_once(',').unwrap_or((&v, ""));
    let int: i64 = if int.is_empty() {
        0
    } else {
        match int.parse() {
            Ok(i) => i,
            Err(_) => return 0,
        }
    };
    let d2: String = format!("{dec}00").chars().take(2).collect();
    let Ok(d) = d2.parse::<i64>() else { return 0 };
    let c = int * 100 + d;
    if neg {
        -c
    } else {
        c
    }
}

const UFS: [(&str, &str, &str); 27] = [
    ("12", "AC", "Acre"),
    ("27", "AL", "Alagoas"),
    ("16", "AP", "Amapá"),
    ("13", "AM", "Amazonas"),
    ("29", "BA", "Bahia"),
    ("23", "CE", "Ceará"),
    ("53", "DF", "Distrito Federal"),
    ("32", "ES", "Espírito Santo"),
    ("52", "GO", "Goiás"),
    ("21", "MA", "Maranhão"),
    ("51", "MT", "Mato Grosso"),
    ("50", "MS", "Mato Grosso do Sul"),
    ("31", "MG", "Minas Gerais"),
    ("15", "PA", "Pará"),
    ("25", "PB", "Paraíba"),
    ("41", "PR", "Paraná"),
    ("26", "PE", "Pernambuco"),
    ("22", "PI", "Piauí"),
    ("33", "RJ", "Rio de Janeiro"),
    ("24", "RN", "Rio Grande do Norte"),
    ("43", "RS", "Rio Grande do Sul"),
    ("11", "RO", "Rondônia"),
    ("14", "RR", "Roraima"),
    ("42", "SC", "Santa Catarina"),
    ("35", "SP", "São Paulo"),
    ("28", "SE", "Sergipe"),
    ("17", "TO", "Tocantins"),
];

/// Sigla da UF a partir dos 2 primeiros dígitos de um código IBGE.
pub fn uf_de_codigo(codigo: &str) -> Option<&'static str> {
    let p = codigo.trim().get(..2)?;
    UFS.iter().find(|u| u.0 == p).map(|u| u.1)
}

pub fn uf_nome(sigla: &str) -> Option<&'static str> {
    UFS.iter().find(|u| u.1 == sigla).map(|u| u.2)
}

pub fn uf_sigla_valida(sigla: &str) -> Option<&'static str> {
    UFS.iter().find(|u| u.1 == sigla.trim()).map(|u| u.1)
}
