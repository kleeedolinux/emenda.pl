# Arquitetura

- `adr/` decisões. `modules/` notas por módulo.
- Fluxo: CSV oficiais → `crates/etl` → JSON `/data/v1` (contrato `packages/contracts`) → Worker (`crates/worker`) → Web (`apps/web`).
- APIs vivas (Câmara, Senado, IBGE) só via Worker (allowlist + cache de edge).
