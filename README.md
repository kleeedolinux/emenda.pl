# emenda.pl

Transparência das emendas parlamentares do Brasil: quem mandou, quanto, para qual município, quem recebeu (CNPJ), quem é o prefeito, e como cada parlamentar votou.

Licença: **GPL-3.0** · Autora: **Júlia Klee** ([@klee00z](https://x.com/klee00z))

## Stack

| Parte | Caminho | Tecnologia |
|---|---|---|
| Site | `apps/web` | React 19, Tailwind v4, Vite, Bun |
| Edge | `crates/worker` + `apps/worker/wrangler.toml` | Rust (workers-rs → wasm), Cloudflare Workers + Cache API |
| Imagens OG | `crates/og` | Rust (resvg), PNG 1200×630 por página |
| Dados | `crates/etl` | Rust, CSV oficiais → JSON estático (`/data/v1`) |
| Contrato | `packages/contracts` | Tipos TS compartilhados |

## Fontes

Portal da Transparência (emendas, favorecidos, convênios) · Câmara Dados Abertos · Senado Dados Abertos · IBGE · TSE (prefeitos 2024).

## Comandos

```bash
bun install
scripts/build-data.sh            # baixa + ETL -> data/out/v1
bun run dev                      # web (Vite) — use junto com: bun run --cwd apps/worker dev
bun run test                     # TS + Rust
bun run deploy                   # build + wrangler deploy
```
