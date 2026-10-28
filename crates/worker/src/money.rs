/// Centavos -> pt-BR compact BRL ("R$ 32,4 mi"). One decimal, trailing ",0" dropped.
pub fn compact_brl(centavos: i64) -> String {
    let sign = if centavos < 0 { "-" } else { "" };
    let reais = centavos.unsigned_abs() as f64 / 100.0;
    const UNITS: [(f64, &str); 4] = [(1e12, " tri"), (1e9, " bi"), (1e6, " mi"), (1e3, " mil")];
    for (i, (div, suffix)) in UNITS.iter().enumerate() {
        if reais >= *div {
            let v = (reais / div * 10.0).round() / 10.0;
            // rounding up to 1000 promotes to next unit
            if v >= 1000.0 && i > 0 {
                return format!("{sign}R$ 1{}", UNITS[i - 1].1);
            }
            return format!("{sign}R$ {}{suffix}", decimal(v));
        }
    }
    format!("{sign}R$ {}", reais.round() as u64)
}

fn decimal(v: f64) -> String {
    let tenths = (v * 10.0).round() as u64;
    match tenths % 10 {
        0 => (tenths / 10).to_string(),
        d => format!("{},{d}", tenths / 10),
    }
}
