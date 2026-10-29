# Arquitetura

Mapa curto. Decisões em `adr/`, detalhe por módulo em `modules/`.

## Fluxo de dados

```text
Fontes oficiais                      GitHub                         Cloudflare edge                 Navegador
───────────────                      ──────                         ───────────────                 ─────────
Portal Transparência ─┐
TSE, IBGE, STF       ─┼─> crates/etl ──> branch `data` (v1/*.json) ──> Worker /data/*  ─(cache)─┐
Câmara/Senado CEAP   ─┘   (dados-diario, diário)                                                ├─> apps/web (SPA)
                                                                                                │
Fotos, logos, bandeiras ─> emenda-assets ─> branch `assets` ──────────> Worker cdn.*  ─(cache)─┤
PDFs oficiais           ─> emenda-espelho (SHA incremental)                                     │
                                                                                                │
Câmara / Senado / IBGE APIs (dados vivos) ─────────────────────────────> Worker /api/* (allowlist + cache)
                                                                         Worker /og/* (crates/og → PNG)
                                                                         Worker /v1, /mcp, /rss, SEO
```

## Pacotes

| Pacote | Papel | Depende de |
|---|---|---|
| `packages/contracts` | Tipos e regras do JSON publicado (centavos, UFs, tipos de emenda) | — |
| `crates/etl` | Bins: `emenda-etl`, `emenda-gastos`, `emenda-novidades`, `emenda-assets`, `emenda-espelho`, `emenda-stf` | — |
| `crates/og` | SVG → PNG 1200×630 (resvg, fontes embutidas) | — |
| `crates/worker` | Entrypoint edge: roteamento, proxy, cache, OG, meta, API, MCP, RSS, SEO, analytics | `og` |
| `apps/web` | SPA React; `features/*` por domínio, `ui/` kit, `pages/` rotas | `contracts` |
| `apps/worker` | Só `wrangler.toml` (rotas, bindings, rate limits) | — |

## Worker (`crates/worker`)

| Rota | Módulo | Faz |
|---|---|---|
| `/data/*` | `glue.rs` | lê `raw.githubusercontent.com/.../data/`, cache longo |
| `/api/camara|senado|ibge/*` | `route.rs` | proxy com allowlist; 4xx do upstream repassado |
| `cdn.*`, `/og-img` | `cdn.rs`, `foto.rs` | imagens espelhadas / fotos otimizadas |
| `/og/*` | `cards.rs` → `crates/og` | imagem de share dinâmica por rota |
| HTML | `meta.rs`, `seo/` | injeta OG/JSON-LD entre `<!-- og:start` e `<!-- og:end -->`; markdown para crawlers de IA |
| `/v1/*` | `api/` | API aberta + OpenAPI; rate limit `API_RL` 300/60s, `API_RL_MISS` 60/10s |
| `/mcp`, `/rss/*` | `mcp.rs`, `feeds.rs` | WebMCP, RSS |
| analytics | `analytics.rs` | Durable Object, anônimo, sem cookie de terceiros (LGPD: legítimo interesse + opt-out) |

## Invariantes

- O site não chama APIs externas direto: tudo passa pelo Worker.
- Dinheiro é inteiro em centavos no contrato.
- Toda tela mostra link para a fonte oficial.
- `data` e `assets` são branches órfãs geradas por CI; nunca editar à mão.
- Mudança de formato em `/data/v1` é aditiva; quebra exige `v2`.
- Mapas: GeoJSON do IBGE é rebobinado para d3 (`geoArea > 2π`), checado no build.

## Operação

| Workflow | Agenda | Saída |
|---|---|---|
| `data.yml` | diário + manual | branch `data` |
| `assets.yml` | mensal completo + diário por SHA | branch `assets` |
| `deploy.yml` | push em `main` | Worker `emenda-pl` (domínios `emenda.online`, `api.`, `cdn.`) |
