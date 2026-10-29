# emenda.online

Para onde vai o dinheiro público que deputados e senadores mandam — por cidade, estado e político.
Quanto chegou na sua cidade, quem mandou, quem recebeu, como cada um votou e quanto gastou no cargo.

Site: **[emenda.online](https://emenda.online)** · API: **[api.emenda.online](https://api.emenda.online)**
Licença: **GPL-3.0** · Autora: **Júlia Klee** ([@klee00z](https://x.com/klee00z))

## O que tem

| Área | Rotas |
|---|---|
| Mapa Brasil → estado → município | `/`, `/uf/:uf`, `/municipio/:ibge` |
| Dinheiro mandado (emendas, Pix, bancada, RP9) | `/emendas`, `/pix`, `/ultimas`, `/dinheiro` |
| Parlamentares, mandatos, gastos (CEAP, gabinete) | `/deputados`, `/senadores`, `/estaduais`, `/deputado/:id`, `/senador/:id` |
| PLs, PECs, leis, votações nominais | `/proposicoes`, `/proposicao/:id`, `/votacao/:id` |
| Partidos, federações, bancadas, comissões | `/partidos`, `/federacoes`, `/bancadas`, `/comissoes` |
| Congresso, agenda, STF | `/congresso`, `/agenda`, `/stf` |
| Audite seu candidato, novidades, explicações | `/auditar`, `/novidades`, `/entenda` |

Todo dado aponta para a fonte oficial. Neutro, sem opinião.

## Fontes

Portal da Transparência · Câmara Dados Abertos · Senado Dados Abertos · TSE · IBGE · STF · Wikimedia Commons (bandeiras/brasões).

## Arquitetura

| Parte | Caminho | Tecnologia |
|---|---|---|
| Site | `apps/web` | React 19, Tailwind v4, Vite, Bun |
| Edge | `crates/worker`, `apps/worker/wrangler.toml` | Rust (workers-rs → wasm), Cloudflare Workers + Cache API |
| Imagens OG | `crates/og` | Rust (resvg), PNG 1200×630 dinâmico por rota |
| ETL | `crates/etl` | Rust, CSV/APIs oficiais → JSON estático |
| Contrato | `packages/contracts` | Tipos TS compartilhados (dinheiro em centavos) |
| Reel | `apps/reel` | HTML + ffmpeg |

Dados ficam na branch órfã `data` (`v1/…`), atualizada diariamente pelo workflow `dados-diario`.
O Worker serve `/data/*` a partir dela com cache na edge — o site não depende das APIs externas em tempo real.
Imagens (fotos, bandeiras, logos) são espelhadas em `cdn.emenda.online`, com atualização incremental por SHA.

## API aberta

| Endpoint | Uso |
|---|---|
| `api.emenda.online/v1` | REST JSON, OpenAPI em `/v1/openapi.json`, rate limit por IP |
| `/mcp` | WebMCP para agentes de IA |
| `/rss/*` | Agenda, emendas, novidades |
| `/llms.txt` | Mapa para IA; páginas respondem em markdown para crawlers de IA |

## Comandos

```bash
bun install
scripts/build-data.sh        # baixa + ETL -> data/out/v1
bun run dev                  # web (Vite); junto com: bun run --cwd apps/worker dev
bun run test                 # TS + Rust
bun run deploy               # build + wrangler deploy
scripts/limpar-tmp.sh        # libera /tmp (move downloads para ~/.cache/emenda.pl)
```

## Workflows

| Workflow | Quando | O que faz |
|---|---|---|
| `data.yml` | diário 09:00 UTC + manual | ETL, gastos, novidades → branch `data` |
| `assets.yml` | mensal + diário incremental | espelha imagens para a CDN |
| `deploy.yml` | push em `main` | build + deploy (secret `CLOUDFLARE_API_TOKEN`) |
