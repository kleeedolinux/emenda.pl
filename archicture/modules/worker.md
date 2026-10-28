# worker (crates/worker, package `emenda-worker`)

Cloudflare Worker in Rust (workers-rs, `worker-build`). Config: `apps/worker/wrangler.toml`.
The package is `emenda-worker` because `-p worker` would be ambiguous with the `worker` SDK crate.

Pure modules, tested natively with `cargo test -p emenda-worker`: `route` (routing, URL map, TTL, cache key, headers),
`meta` (HTML escaping and og block injection), `money` (centavos -> "R$ 32,4 mi"), `cards` (OG content), `analytics`.
The wasm glue is in `src/glue.rs` (`cfg(target_arch = "wasm32")`).

## Routes (GET/HEAD; OPTIONS -> CORS 204; other methods -> 405)

| Path | Target | Edge TTL |
|---|---|---|
| `/api/camara/deputados*`, `/api/camara/partidos*` | dadosabertos.camara.leg.br/api/v2 | 12h |
| `/api/camara/{proposicoes,votacoes}/:id` | same | 1h |
| `/api/camara/*` (other) | same | 10 min |
| `/api/senado/*` | legis.senado.leg.br/dadosabertos (Accept json) | 6h |
| `/api/ibge/*` | servicodados.ibge.gov.br/api | 30d |
| `/data/*` | `DATA_BASE_URL` + rest; if empty -> ASSETS `/data/*`; `.json` is always served as JSON | 6h |
| `/og/default.png`, `/og/<kind>/<id>.png` | `og::png` card; any failure -> default card | 1d |
| `/deputado/:id` … `/partido/:sigla`, `/` | `index.html` with `<!-- og:start -->…<!-- og:end -->` replaced | 5 min |
| `/assets/*` | static, `immutable` | 1y |
| `/api/health` | `{ok, version}` | no-store |
| `POST /api/hit` | analytics beacon, 204 | no-store |
| `GET /api/stats` | analytics aggregate | 30s |

Cache-Control: `public, max-age=min(ttl,3600), s-maxage=ttl, stale-while-revalidate=86400`.
The Cache API key is the URL with its query sorted. Only 200s are cached. Header: `x-emenda-cache: HIT|MISS`.
Upstream non-200 -> 502 `{error}`. Path segments must match `[A-Za-z0-9._,-]`, with no `..` and no empty segment. Query length <= 512.

## Analytics (audiência pública/anônima)

- Cookie `ep_vid`: 128-bit random hex; HttpOnly, Secure, SameSite=Lax, 1 year. Not set when `DNT: 1` or the UA looks like a bot.
- One Durable Object `Analytics` (name `global`). Stores `v:{day}:{sha256(vid|day|ANALYTICS_SALT)[..32]}` for the current day only
  (the previous day is deleted on rollover), `counts {day: distinct}` (kept 400 days) and `total`. Online = in-memory map, 5 min window.
- `hoje` = today's distinct visitors. `semana`/`mes` = sum of daily distinct visitors (the daily salt prevents linking across days).
  `total` = number of cookies issued. No IPs or raw ids are stored.
