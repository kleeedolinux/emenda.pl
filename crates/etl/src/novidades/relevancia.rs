//! Relevância 0–100 por regra explícita (sem aprendizado, auditável). "Alta" = ≥ 70.

fn cap(v: i32) -> u8 {
    v.clamp(0, 100) as u8
}

/// Peso do tipo de proposição.
fn peso_sigla(sigla: &str) -> i32 {
    match sigla {
        "PEC" => 25,
        "MPV" => 15,
        "PLP" => 10,
        "PL" | "PLV" => 0,
        _ => -5,
    }
}

/// Votação em plenário: base 50 + tipo; nominal +10; margem < 20% +10; rejeição +5.
pub fn votacao(sigla: &str, placar: Option<(u32, u32)>, aprovada: bool) -> u8 {
    let mut r = 50 + peso_sigla(sigla);
    if let Some((s, n)) = placar {
        r += 10;
        let t = (s + n).max(1) as f64;
        if ((s as f64 - n as f64).abs() / t) < 0.2 {
            r += 10;
        }
    }
    if !aprovada {
        r += 5;
    }
    cap(r)
}

/// Homenagens, datas comemorativas e denominações.
fn honraria(ementa: &str) -> bool {
    const P: [&str; 9] = [
        "Confere o título",
        "Confere ao Município",
        "Denomina ",
        "Inscreve o nome",
        "Institui o Dia",
        "Institui a Semana",
        "Institui o Mês",
        "Institui a data",
        "Declara Patrono",
    ];
    P.iter().any(|p| ementa.trim_start().starts_with(p))
}

/// Norma publicada: EC 95, LC 75, lei 65; homenagens/denominações 35.
pub fn lei(tipo: &str, ementa: &str) -> u8 {
    match tipo {
        "EMC" => 95,
        "LCP" => 75,
        _ if honraria(ementa) => 35,
        _ => 65,
    }
}

/// Dinheiro: base + 10 por faixa (≥ R$ 1 mi, ≥ R$ 10 mi, ≥ R$ 100 mi).
pub fn valor(base: u8, centavos: i64) -> u8 {
    let reais = centavos / 100;
    let faixas = [1_000_000, 10_000_000, 100_000_000]
        .iter()
        .filter(|&&f| reais >= f)
        .count() as i32;
    cap(base as i32 + 10 * faixas)
}

/// Nova proposição: PEC 65, MPV 55, demais 35.
pub fn proposicao(sigla: &str) -> u8 {
    cap(40 + peso_sigla(sigla))
}

/// Urgência aprovada: 45 + tipo da proposição alvo.
pub fn urgencia(sigla: &str) -> u8 {
    cap(45 + peso_sigla(sigla))
}

/// Pauta do plenário: 40 + maior peso entre os itens.
pub fn agenda(siglas: &[&str]) -> u8 {
    cap(40
        + siglas
            .iter()
            .map(|s| peso_sigla(s))
            .max()
            .unwrap_or(0)
            .max(0))
}

pub fn partido() -> u8 {
    60
}

pub fn gastos() -> u8 {
    50
}
