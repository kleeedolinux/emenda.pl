use clap::Parser;
use std::path::PathBuf;

/// Gera v1/novidades.json (+ arquivo mensal v1/novidades/<AAAAMM>.json): diff entre o snapshot
/// anterior do branch `data` e o atual + eventos das APIs da Câmara e do Senado.
#[derive(Parser)]
#[command(name = "emenda-novidades", version)]
struct Cli {
    /// Checkout anterior do branch `data` (raiz com v1/). Sem ele: bootstrap.
    #[arg(long)]
    prev: Option<PathBuf>,
    /// Dados atuais (raiz com v1/).
    #[arg(long)]
    cur: PathBuf,
    /// Saída (gera <out>/v1/novidades*).
    #[arg(long)]
    out: PathBuf,
    /// Janela das APIs em dias (sem histórico usa 7).
    #[arg(long, default_value_t = 3)]
    dias: u32,
    /// Instante da execução (ISO-8601 UTC); padrão: agora.
    #[arg(long)]
    agora: Option<String>,
}

fn main() -> anyhow::Result<()> {
    let c = Cli::parse();
    let t = std::time::Instant::now();
    let prev = c.prev.filter(|p| p.join("v1").is_dir());
    let r = etl::novidades::run(
        &etl::novidades::Opts {
            prev,
            cur: c.cur,
            out: c.out,
            agora: c.agora.unwrap_or_else(etl::novidades::agora_iso),
            dias: c.dias,
        },
        &etl::novidades::fontes::Curl,
    )?;
    eprintln!("{r:?} em {:.1?}", t.elapsed());
    Ok(())
}
