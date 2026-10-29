//! Asset mirror (fotos, logos, PDFs) -> branch `assets`, served by the Worker at `cdn.emenda.online`.
//!
//! Pure: `fontes` (API JSON -> sources), `plano` (mode/sha/etag decisions, size caps),
//! `manifesto`, `imagem` (deterministic encoders). I/O: `rede` (HTTP), `executar` (orchestration).

pub mod cobertura;
pub mod executar;
pub mod fontes;
pub mod imagem;
pub mod manifesto;
pub mod nomes;
pub mod plano;
pub mod rede;
pub mod tse;
pub mod zipremoto;

pub const USER_AGENT: &str = "emenda.online asset mirror (+https://emenda.online)";
/// Single file cap (bytes). Bigger files are skipped and logged.
pub const MAX_ARQUIVO: u64 = 50 * 1024 * 1024;
/// Total branch size cap (bytes).
pub const MAX_TOTAL: u64 = 1536 * 1024 * 1024;
/// Parallel requests (politeness).
pub const CONCORRENCIA: usize = 8;
