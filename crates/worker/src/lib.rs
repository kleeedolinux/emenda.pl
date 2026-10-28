//! emenda.pl edge worker. Pure modules are native-testable; `glue` is wasm-only.
pub mod analytics;
pub mod api;
pub mod cards;
pub mod meta;
pub mod money;
pub mod route;

#[cfg(target_arch = "wasm32")]
mod glue;
#[cfg(target_arch = "wasm32")]
mod glue_api;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
