# Changelog

## Unreleased
- Hero da Home refeito: ilustração original de Brasília em camadas com parallax (cerrado, Esplanada, Congresso, espelho d'água, Catedral), céu amanhecer→dia, Brasil de vidro com malha real e partículas de dinheiro em canvas ponderadas por `porUf.pago`, faixa com emendas recentes reais; chunk lazy (~8 kB gz), pausa fora da tela, versão estática em reduced-motion.
- Sistema de movimento `src/ui/motion/` (tokens, Reveal/RevealText, CountUp/NumberRoll, Magnetic/Tilt/Parallax, ScrollProgress, transição de rota com faixas da bandeira, título compartilhado via View Transitions, toast) aplicado ao kit e aos gráficos.
- Malhas do IBGE e índice de municípios estáticos em `public/geo` (`bun scripts/fetch-geo.ts`), com correção de enrolamento para d3 (mapas não viram mais um quadrado preenchido). Fontes Inter/Space Grotesk auto-hospedadas; vendors em chunks próprios; `_headers` com cache longo; `robots.txt`.
- LGPD: audiência anônima por legítimo interesse (art. 7º, IX): aviso não bloqueante, opt-out persistido, DNT/GPC respeitados; seção `/sobre#privacidade`.
- Menu: Emenda Pix, Últimas; "Mais" (Estaduais, Partidos, Agenda, Entenda, Sobre); API no rodapé.
- Gastos: binário `emenda-gastos` (`crates/etl/src/gastos`, cache via `scripts/gastos-fetch.sh`) gera `v1/gastos/deputado/<id>.json`, `v1/gastos/senador/<codigo>.json` e `v1/gastos/ranking.json` a partir da CEAP (Câmara), CEAPS (Senado), funcionários/servidores lotados em gabinete, remunerações do Senado e página oficial do deputado (subsídio, cota, verba de gabinete, auxílios). Web: seção "Gastos do mandato" em deputado/senador e aba "Quem mais gasta" em `/deputados`. Contratos aditivos `@emenda/contracts` (`gastosPath`, `GastosParlamentarData`, `GastosRanking`).
- ETL: novas saídas `v1/pix.json` + `v1/pix/<ano>.json`, `v1/feed.json` + `v1/feed/<YYYYMM>.json` (24 meses), `v1/abertas.json` (empenhado − pago − RAP pagos − RAP cancelados), `v1/rankings.json` (janelas 1/3/6/12 meses). Contratos aditivos em `@emenda/contracts`.
- Páginas `/pix`, `/ultimas` (feed por mês + rankings por autor/partido/UF/município), `/entenda` e `/entenda/:tema` (13 temas com diagramas e fontes oficiais).
- Deputado/Senador: resumo em linguagem simples, dinheiro indicado, votos em pautas de grande repercussão, linha do tempo de partidos; detalhes completos mantidos abaixo.
- Câmara `/proposicoes`: períodos viram lista de `ano` (a API recusa intervalos de datas > 3 meses).
- API pública aberta `/v1` (host `api.emenda.online` e `/v1` em qualquer host): envelope `{data, meta}`, ETag/304, CORS, cache de borda, rate limit por IP (Workers Rate Limiting). Docs em `/api`.
- Proxy `/api/*`: 4xx da origem agora repassado com status e corpo (sem cache); só 5xx/falha de rede viram 502.
- `wrangler.toml`: custom domains `emenda.online` e `api.emenda.online`.

## 0.10.0
- Primeira versão: site React/Tailwind, Worker Rust na edge com cache, ETL Rust de emendas (inclui Emenda Pix, favorecidos/CNPJ, convênios, prefeitos 2024), páginas de deputados, senadores, proposições e votações, OG dinâmico.
