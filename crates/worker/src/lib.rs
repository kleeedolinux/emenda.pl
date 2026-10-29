//! emenda.pl edge worker. Pure modules are native-testable; `glue` is wasm-only.
pub mod analytics;
pub mod api;
pub mod cards;
pub mod cdn;
pub mod espelho;
pub mod feeds;
pub mod foto;
pub mod mcp;
pub mod meta;
pub mod money;
pub mod ogcache;
pub mod route;
pub mod seo;
pub mod viral;

#[cfg(target_arch = "wasm32")]
mod glue;
#[cfg(target_arch = "wasm32")]
mod glue_api;
#[cfg(target_arch = "wasm32")]
mod glue_cdn;
#[cfg(target_arch = "wasm32")]
mod glue_espelho;
#[cfg(target_arch = "wasm32")]
mod glue_feeds;
#[cfg(target_arch = "wasm32")]
mod glue_mcp;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
