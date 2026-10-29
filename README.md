<p align="center">
  <img src="apps/web/public/brand/logo.svg" alt="emenda.online" height="72">
</p>

<p align="center">
  Para onde vai o dinheiro público que deputados e senadores mandam: por cidade, estado e político.<br>
  <a href="https://emenda.online">emenda.online</a> · <a href="https://api.emenda.online/v1/openapi.json">API</a> · GPL-3.0 · Júlia Klee (<a href="https://x.com/klee00z">@klee00z</a>)
</p>

<p align="center">
  <a href="https://emenda.online"><img src="apps/web/public/brand/reel-poster.png" alt="emenda.online" width="720"></a>
</p>

## Visão técnica

Site estático (SPA) + um único Worker Rust na edge + dados pré-computados versionados em git.
Nenhum servidor, nenhum banco: o "banco" é a branch órfã `data`, e a edge é o cache.

```text
fontes oficiais ──> crates/etl (Rust, CI diário) ──> branch `data`   (JSON, v1/*)
imagens oficiais ─> emenda-assets (SHA incremental) ─> branch `assets` (WebP/SVG)
                                                          │
navegador ──> Cloudflare Worker (crates/worker, wasm) ────┤ cache API na edge
                 ├─ /data/*        JSON da branch data     │
                 ├─ cdn.*          imagens da branch assets│
                 ├─ /api/*         proxy Câmara/Senado/IBGE (allowlist)
                 ├─ /og/*          PNG de share (crates/og, resvg)
                 ├─ /v1, /mcp, /rss  API aberta, WebMCP, feeds
                 └─ HTML           SPA + meta/JSON-LD injetados por rota
```

### Ciclo de uma requisição

1. `GET /municipio/2903904` chega ao Worker.
2. O Worker serve o `index.html` da SPA e injeta título, descrição, OG e JSON-LD da rota (`meta.rs`, `seo/`). Crawlers recebem o HTML pré-renderizado; agentes de IA recebem markdown.
3. O React carrega a rota sob demanda (`router.tsx`, chunks lazy, com recarga automática se o chunk sumiu após deploy).
4. A página busca `/data/v1/municipio/2903904.json`. O Worker lê da branch `data` uma vez e responde do cache da edge nas próximas.
5. Fotos e bandeiras vêm de `cdn.emenda.online`. Dados vivos (votações, agenda) passam por `/api/camara|senado`, também cacheados.
6. Ao compartilhar, `/og/municipio/2903904.png` é gerado em Rust (SVG → PNG) e cacheado.

### Pipeline de dados

| Etapa | Onde | Saída |
|---|---|---|
| Download CSV/APIs (Transparência, TSE, IBGE, CEAP, STF) | `scripts/build-data.sh`, `scripts/gastos-fetch.sh` | `data/raw` |
| Normalização: nomes, CNPJ, valores BR → centavos, tipo de emenda | `crates/etl` (`norm.rs`, `read.rs`) | modelo em memória |
| Agregação por Brasil, UF, município, autor, Pix, ranking, gastos | `crates/etl` bins | `data/out/v1/**.json` |
| Diferença diária → feed "Novidades" | `emenda-novidades` | `v1/novidades.json` |
| Publicação | `.github/workflows/data.yml` (diário) | force-push na branch `data` |

O formato está em `packages/contracts`, usado pelo site e espelhado no ETL. Mudanças são aditivas; uma quebra vira `v2`.

### Imagens (assets)

Fotos de parlamentares e prefeitos, logos de partidos, bandeiras de estados e municípios e PDFs oficiais são baixados por `emenda-assets` e `emenda-espelho`. Cada arquivo é identificado pelo SHA do conteúdo: a execução mensal refaz tudo e a diária só envia o que mudou. Tudo é servido por `cdn.emenda.online` com cache imutável. Detalhes em [`archicture/modules/assets.md`](archicture/modules/assets.md).

| Identidade | |
|---|---|
| <img src="apps/web/public/brand/logo-mark.svg" height="48"> | Marca, favicon, ícones PWA: [`apps/web/public/brand`](apps/web/public/brand/BRAND.md) |
| <img src="apps/web/public/brand/og-default.png" width="320"> | OG padrão; cada rota tem OG dinâmico via `/og/*` |

### Frontend

React 19 + Vite + Tailwind v4 + TanStack Query. `src/ui/` é o kit (Card, Avatar, PartyBadge, Tip, gráficos, motion). `src/features/<domínio>/` agrupa dados, hooks e componentes de cada área. Mapas em d3-geo, com GeoJSON do IBGE simplificado e rebobinado no build.

### Edge e cache

| Recurso | TTL / regra |
|---|---|
| `/data/*`, `cdn.*` | cache longo na edge, invalidado pelo SHA/commit |
| `/api/*` upstream | cache curto, só endpoints na allowlist |
| `/v1/*` | rate limit `API_RL` 300 req/60s, `API_RL_MISS` 60/10s em cache miss |
| analytics | Durable Object, anônimo, sem cookie de terceiros, com opt-out (LGPD) |

Mapa completo: [`archicture/README.md`](archicture/README.md) · decisões: [`archicture/adr/`](archicture/adr/).

## Estrutura

| Caminho | Tecnologia | Papel |
|---|---|---|
| `apps/web` | React 19, Tailwind v4, Vite, Bun | Site |
| `apps/worker` | `wrangler.toml` | Rotas, bindings, domínios |
| `apps/reel` | HTML + ffmpeg | Vídeo de demonstração |
| `crates/worker` | Rust, workers-rs → wasm | Edge |
| `crates/og` | Rust, resvg | Imagens de share |
| `crates/etl` | Rust | ETL e espelho de assets |
| `packages/contracts` | TypeScript | Contrato dos dados |

## Comandos

```bash
bun install
scripts/build-data.sh        # baixa + ETL -> data/out/v1
bun run dev                  # web (Vite); junto com: bun run --cwd apps/worker dev
bun run test                 # TS + Rust
bun run deploy               # build + wrangler deploy
scripts/limpar-tmp.sh        # libera /tmp (move downloads para ~/.cache/emenda.pl)
```

| Workflow | Quando | Faz |
|---|---|---|
| `data.yml` | diário + manual | ETL → branch `data` |
| `assets.yml` | mensal + diário incremental | imagens → branch `assets` |
| `deploy.yml` | push em `main` | build + deploy (secret `CLOUDFLARE_API_TOKEN`) |

## Fontes

Portal da Transparência · Câmara Dados Abertos · Senado Dados Abertos · TSE · IBGE · STF · Wikimedia Commons. Toda tela aponta para a fonte oficial do dado.
