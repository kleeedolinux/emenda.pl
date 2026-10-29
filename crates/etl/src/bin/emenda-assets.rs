use clap::Parser;
use etl::assets::executar::{executar, Opts};
use etl::assets::manifesto::Tipo;
use etl::assets::plano::Modo;
use std::path::PathBuf;

/// Espelho de fotos, logos e PDFs oficiais -> diretório do branch `assets` (cdn.emenda.online).
#[derive(Parser)]
#[command(name = "emenda-assets", version)]
struct Cli {
    /// Diretório de saída (checkout anterior do branch `assets`, se houver).
    #[arg(long)]
    out: PathBuf,
    /// incremental: só itens ausentes do manifesto anterior. completo: revalida tudo.
    #[arg(long, default_value = "incremental")]
    modo: Modo,
    /// Pautas polêmicas (camaraId: N).
    #[arg(long, default_value = "apps/web/src/features/legislativo/pautas.ts")]
    pautas: PathBuf,
    /// Tipos: foto,logo,bandeira,pdf.
    #[arg(long, value_delimiter = ',', default_value = "foto,logo,bandeira,pdf")]
    tipos: Vec<String>,
    /// Legislaturas da Câmara (fotos); o exercício atual sempre entra.
    #[arg(long, value_delimiter = ',', default_value = "52,53,54,55,56,57")]
    legislaturas: Vec<u32>,
    /// Meses de votações do Plenário (inteiro teor).
    #[arg(long, default_value_t = 24)]
    meses: i64,
    /// Limite total de saída (MB).
    #[arg(long, default_value_t = 1536)]
    max_total_mb: u64,
    /// Limite por arquivo (MB).
    #[arg(long, default_value_t = 50)]
    max_arquivo_mb: u64,
    /// Requisições paralelas (1..=8).
    #[arg(long, default_value_t = 8)]
    concorrencia: usize,
    /// Máximo de PDFs (execução local).
    #[arg(long)]
    max_pdfs: Option<usize>,
    /// consulta_cand_2024 (zip ou diretório): fotos de prefeitos/vices eleitos (requer --ibge).
    #[arg(long, requires = "ibge")]
    tse: Option<PathBuf>,
    /// consulta_cand_2022 (zip ou diretório): eleitos 2022 (estaduais, governadores, suplentes).
    #[arg(long)]
    tse2022: Option<PathBuf>,
    /// Só mede a cobertura de fotos (manifesto + índice em --out) e grava cobertura.json.
    #[arg(long)]
    cobertura: bool,
    /// Municípios do IBGE (JSON da API de localidades).
    #[arg(long, requires = "tse")]
    ibge: Option<PathBuf>,
}

fn main() -> anyhow::Result<()> {
    let c = Cli::parse();
    let tipos = c
        .tipos
        .iter()
        .map(|t| match t.as_str() {
            "foto" => Ok(Tipo::Foto),
            "logo" => Ok(Tipo::Logo),
            "pdf" => Ok(Tipo::Pdf),
            "bandeira" => Ok(Tipo::Bandeira),
            x => Err(anyhow::anyhow!("tipo inválido: {x}")),
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    let t = std::time::Instant::now();
    let opts = Opts {
        out: c.out,
        modo: c.modo,
        pautas: c.pautas.exists().then_some(c.pautas),
        tipos,
        legislaturas: c.legislaturas,
        senado: (52, 57),
        frentes: 57,
        meses: c.meses,
        max_total: c.max_total_mb * 1024 * 1024,
        max_arquivo: c.max_arquivo_mb * 1024 * 1024,
        concorrencia: c.concorrencia,
        max_pdfs: c.max_pdfs,
        tse: c.tse.zip(c.ibge),
        tse2022: c.tse2022,
    };
    if c.cobertura {
        println!("| categoria | total | antes | depois |\n|---|---:|---:|---:|");
        for l in etl::assets::executar::cobertura(&opts)? {
            let pct = |n: usize| 100.0 * n as f64 / l.total.max(1) as f64;
            println!(
                "| {} | {} | {} ({:.1}%) | {} ({:.1}%) |",
                l.categoria,
                l.total,
                l.antes,
                pct(l.antes),
                l.depois,
                pct(l.depois)
            );
        }
        return Ok(());
    }
    let r = executar(&opts)?;
    for ((tipo, estado), n) in &r.contagem {
        eprintln!("{tipo:?} {estado:?}: {n}");
    }
    for (tipo, (arquivos, bytes)) in &r.saida {
        eprintln!(
            "{tipo:?}: {arquivos} arquivos, {:.1} MB",
            *bytes as f64 / 1048576.0
        );
    }
    eprintln!(
        "removidos: {}; manifesto mudou: {}; {:.1?}",
        r.removidos,
        r.manifesto_mudou,
        t.elapsed()
    );
    // For CI: `mudou=true|false`.
    println!("mudou={}", r.manifesto_mudou);
    Ok(())
}
