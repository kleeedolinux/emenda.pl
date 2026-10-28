use clap::Parser;
use std::path::PathBuf;

/// Gera v1/gastos/** (CEAP/CEAPS, pessoal de gabinete, subsídio, auxílios) a partir do cache
/// baixado por `scripts/gastos-fetch.sh`.
#[derive(Parser)]
#[command(name = "emenda-gastos", version)]
struct Cli {
    /// Diretório de cache com `camara/` e `senado/`.
    #[arg(long)]
    cache: PathBuf,
    /// Diretório de saída (gera <out>/v1/gastos/...).
    #[arg(long)]
    out: PathBuf,
    /// Ano corrente (início da legislatura).
    #[arg(long)]
    ano: u16,
}

fn main() -> anyhow::Result<()> {
    let c = Cli::parse();
    let t = std::time::Instant::now();
    let r = etl::gastos::run(&etl::gastos::Opts {
        cache: c.cache,
        out: c.out,
        ano: c.ano,
    })?;
    eprintln!("{r:?} em {:.1?}", t.elapsed());
    Ok(())
}
