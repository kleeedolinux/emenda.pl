use clap::Parser;
use std::path::PathBuf;

/// Gera o JSON estático v1 do emenda.pl a partir dos dados abertos.
#[derive(Parser)]
#[command(name = "emenda-etl", version)]
struct Cli {
    /// Diretório com EmendasParlamentares*.csv (Portal da Transparência).
    #[arg(long)]
    input: PathBuf,
    /// Diretório de saída (gera <out>/v1/...).
    #[arg(long)]
    out: PathBuf,
    /// consulta_cand_2024.zip do TSE (ou diretório com os CSVs).
    #[arg(long)]
    tse: Option<PathBuf>,
    /// JSON de municípios da API de localidades do IBGE.
    #[arg(long)]
    ibge: Option<PathBuf>,
}

fn main() -> anyhow::Result<()> {
    let c = Cli::parse();
    let t = std::time::Instant::now();
    let r = etl::run(&etl::Opts {
        input: c.input,
        out: c.out,
        tse: c.tse,
        ibge: c.ibge,
    })?;
    eprintln!("{r:?} em {:.1?}", t.elapsed());
    Ok(())
}
