# Changelog

## Unreleased
- ETL: novas saídas `v1/pix.json` + `v1/pix/<ano>.json`, `v1/feed.json` + `v1/feed/<YYYYMM>.json` (24 meses), `v1/abertas.json` (empenhado − pago − RAP pagos − RAP cancelados), `v1/rankings.json` (janelas 1/3/6/12 meses). Contratos aditivos em `@emenda/contracts`.
- Páginas `/pix`, `/ultimas` (feed por mês + rankings por autor/partido/UF/município), `/entenda` e `/entenda/:tema` (13 temas com diagramas e fontes oficiais).
- Deputado/Senador: resumo em linguagem simples, dinheiro indicado, votos em pautas de grande repercussão, linha do tempo de partidos; detalhes completos mantidos abaixo.
- Câmara `/proposicoes`: períodos viram lista de `ano` (a API recusa intervalos de datas > 3 meses).
- API pública aberta `/v1` (host `api.emenda.online` e `/v1` em qualquer host): envelope `{data, meta}`, ETag/304, CORS, cache de borda, rate limit por IP (Workers Rate Limiting). Docs em `/api`.
- Proxy `/api/*`: 4xx da origem agora repassado com status e corpo (sem cache); só 5xx/falha de rede viram 502.
- `wrangler.toml`: custom domains `emenda.online` e `api.emenda.online`.

## 0.10.0
- Primeira versão: site React/Tailwind, Worker Rust na edge com cache, ETL Rust de emendas (inclui Emenda Pix, favorecidos/CNPJ, convênios, prefeitos 2024), páginas de deputados, senadores, proposições e votações, OG dinâmico.
