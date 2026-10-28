//! Formatação pt-BR e datas (sem dependências extras).

/// "R$ 12,3 mi" a partir de centavos.
pub fn brl_curto(centavos: i64) -> String {
    let neg = centavos < 0;
    let r = (centavos as f64).abs() / 100.0;
    let (v, suf) = if r >= 1e9 {
        (r / 1e9, " bi")
    } else if r >= 1e6 {
        (r / 1e6, " mi")
    } else if r >= 1e3 {
        (r / 1e3, " mil")
    } else {
        (r, "")
    };
    let s = if suf.is_empty() {
        format!("{}", v.round() as i64)
    } else {
        let s = format!("{:.1}", (v * 10.0).round() / 10.0);
        s.strip_suffix(".0").unwrap_or(&s).replace('.', ",")
    };
    format!("{}R$ {s}{suf}", if neg { "-" } else { "" })
}

/// Inteiro com separador de milhar pt-BR ("15.526").
pub fn milhar(n: i64) -> String {
    let s = n.abs().to_string();
    let mut o = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i).is_multiple_of(3) {
            o.push('.');
        }
        o.push(c);
    }
    if n < 0 {
        format!("-{o}")
    } else {
        o
    }
}

/// Corta em `max` caracteres Unicode, terminando em "…" quando corta (preferindo fim de palavra).
pub fn limita(s: &str, max: usize) -> String {
    let s = s.trim();
    if s.chars().count() <= max {
        return s.to_string();
    }
    let corte: String = s.chars().take(max.saturating_sub(1)).collect();
    let base = match corte.rfind(' ') {
        Some(i) if corte[..i].chars().count() > max / 2 => &corte[..i],
        _ => corte.as_str(),
    };
    format!("{}…", base.trim_end_matches([' ', ',', ';', ':', '.', '-']))
}

/// Ementa sem cauda burocrática, 1º parágrafo/frase, até `max` caracteres.
pub fn ementa_curta(e: &str, max: usize) -> String {
    let mut s = e.split_whitespace().collect::<Vec<_>>().join(" ");
    for cauda in [", e dá outras providências", " e dá outras providências"] {
        if let Some(i) = s.find(cauda) {
            s.truncate(i);
        }
    }
    let s = s.trim_end_matches(['.', ' ', ';']);
    limita(s, max)
}

const MESES: [&str; 12] = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
];

/// 202609 -> "setembro/2026".
pub fn mes_extenso(aaaamm: u32) -> String {
    let m = (aaaamm % 100) as usize;
    match MESES.get(m.wrapping_sub(1)) {
        Some(n) => format!("{n}/{}", aaaamm / 100),
        None => aaaamm.to_string(),
    }
}

/// "BANCADA DE MINAS GERAIS" -> "Bancada de Minas Gerais"; nomes já mistos ficam como estão.
pub fn titulo_nome(s: &str) -> String {
    let s = s.trim();
    if s.chars().any(|c| c.is_lowercase()) {
        return s.to_string();
    }
    const MIN: [&str; 9] = ["de", "da", "do", "das", "dos", "e", "em", "a", "o"];
    s.split_whitespace()
        .enumerate()
        .map(|(i, w)| {
            let l = w.to_lowercase();
            if i > 0 && MIN.contains(&l.as_str()) {
                l
            } else if w.len() <= 3 && !w.chars().any(|c| "AEIOUÁÉÍÓÚÃÕÂÊÔ".contains(c)) {
                w.to_string() // siglas (PT, MDB, PSB)
            } else {
                let mut c = l.chars();
                c.next()
                    .map(|f| f.to_uppercase().collect::<String>() + c.as_str())
                    .unwrap_or_default()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

// ---------- datas ----------

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

fn n(s: &str, a: usize, b: usize) -> Option<i64> {
    s.get(a..b)?.parse().ok()
}

/// Segundos Unix de um ISO "AAAA-MM-DD[THH:MM[:SS]][Z|±HH:MM]" (sem fuso = BRT, -03:00).
pub fn epoch(iso: &str) -> Option<i64> {
    let (y, m, d) = (n(iso, 0, 4)?, n(iso, 5, 7)?, n(iso, 8, 10)?);
    let (hh, mm, ss) = if iso.len() >= 16 {
        (
            n(iso, 11, 13)?,
            n(iso, 14, 16)?,
            n(iso, 17, 19).unwrap_or(0),
        )
    } else {
        (0, 0, 0)
    };
    let resto = iso.get(19..).or_else(|| iso.get(16..)).unwrap_or("");
    let off = if resto.ends_with('Z') {
        0
    } else if let Some(i) = resto.rfind(['+', '-']) {
        let t = &resto[i..];
        let sinal = if t.starts_with('-') { -1 } else { 1 };
        sinal * (n(t, 1, 3).unwrap_or(0) * 3600 + n(t, 4, 6).unwrap_or(0) * 60)
    } else {
        -3 * 3600
    };
    Some(days_from_civil(y, m, d) * 86400 + hh * 3600 + mm * 60 + ss - off)
}

/// ISO em UTC ("…Z"), para ordenar datas de fusos diferentes.
pub fn iso_utc(iso: &str) -> Option<String> {
    let s = epoch(iso)?;
    let (y, m, d) = civil_from_days(s.div_euclid(86400));
    let r = s.rem_euclid(86400);
    Some(format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        r / 3600,
        r % 3600 / 60,
        r % 60
    ))
}

/// Data civil (AAAA-MM-DD) em Brasília de um ISO qualquer.
pub fn data_brt(iso: &str) -> String {
    match epoch(iso) {
        Some(s) => {
            let (y, m, d) = civil_from_days((s - 3 * 3600).div_euclid(86400));
            format!("{y:04}-{m:02}-{d:02}")
        }
        None => iso.get(0..10).unwrap_or(iso).to_string(),
    }
}

/// "2026-10-28" + n dias.
pub fn somar_dias(data: &str, dias: i64) -> String {
    match (n(data, 0, 4), n(data, 5, 7), n(data, 8, 10)) {
        (Some(y), Some(m), Some(d)) => {
            let (y, m, d) = civil_from_days(days_from_civil(y, m, d) + dias);
            format!("{y:04}-{m:02}-{d:02}")
        }
        _ => data.to_string(),
    }
}

/// "2026-10-29" -> "29/10".
pub fn dia_mes(data: &str) -> String {
    match (data.get(8..10), data.get(5..7)) {
        (Some(d), Some(m)) => format!("{d}/{m}"),
        _ => data.to_string(),
    }
}

/// Agora em ISO UTC (relógio do sistema).
pub fn agora_iso() -> String {
    let s = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let (y, m, d) = civil_from_days(s.div_euclid(86400));
    let r = s.rem_euclid(86400);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        r / 3600,
        r % 3600 / 60,
        r % 60
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn datas() {
        assert_eq!(
            iso_utc("2026-10-27T21:41:06-03:00").unwrap(),
            "2026-10-28T00:41:06Z"
        );
        assert_eq!(iso_utc("2026-10-27T21:41").unwrap(), "2026-10-28T00:41:00Z");
        assert_eq!(
            iso_utc("2026-10-28T09:30:00Z").unwrap(),
            "2026-10-28T09:30:00Z"
        );
        assert_eq!(data_brt("2026-10-28T02:00:00Z"), "2026-10-27");
        assert_eq!(somar_dias("2026-03-01", -1), "2026-02-28");
        assert_eq!(somar_dias("2026-12-31", 1), "2027-01-01");
        assert_eq!(dia_mes("2026-10-29"), "29/10");
    }

    #[test]
    fn nomes_e_numeros() {
        assert_eq!(
            titulo_nome("BANCADA DE MINAS GERAIS"),
            "Bancada de Minas Gerais"
        );
        assert_eq!(
            titulo_nome("COM. DE INTEGRACAO NACIONAL"),
            "Com. de Integracao Nacional"
        );
        assert_eq!(titulo_nome("Hildo do Candango"), "Hildo do Candango");
        assert_eq!(milhar(15526), "15.526");
        assert_eq!(milhar(141), "141");
        assert_eq!(mes_extenso(202609), "setembro/2026");
    }
}
