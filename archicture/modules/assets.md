# assets (crates/etl/src/assets, bin `emenda-assets`)

Espelho de arquivos oficiais -> branch órfão `assets` -> Worker `cdn.emenda.online` (ADR 0002).
Workflow `.github/workflows/assets.yml`: diário `incremental`, dia 1 `completo`; push só se `manifest.json` mudar.

| Caminho | Origem | Variantes |
|---|---|---|
| `foto/deputado/{id}` | Câmara `urlFoto`, legislaturas 52–57 + exercício | `-160.webp`, `-512.webp`, `-512.jpg` |
| `foto/senador/{codigo}` | Senado `fotos-oficiais`, legislaturas 52–57 + atual | idem |
| `foto/prefeito/{ibge}`, `foto/vice-prefeito/{ibge}` | TSE `foto_cand2024_{UF}_div.zip` (range requests), eleitos 2024 via `read::tse` | idem |
| `foto/tse/2022/{sq}` | TSE `foto_cand2022_{UF}_div.zip`: eleitos 2022 (estaduais/distritais, governadores, suplentes de senador) | idem |
| `foto/nome/{UF\|XX}/{slug}-…` | alias no Worker via `indice/nomes/{letra}.json` (`{slug: [[uf, chave]]}`; mesma UF, ou única UF quando `XX`) | — |
| `logo/partido/{sigla}` | Câmara `urlLogo` (partidos desde 2015) | `.webp` ou `.svg` |
| `bandeira/uf/{UF}`, `bandeira/pais/BR` | Wikimedia Commons (domínio público; `licenca` no manifesto) | `.svg`, `-64.webp` |
| `bandeira/municipio/{ibge}`, `brasao/municipio/{ibge}` | Wikidata (P1585 IBGE, P41, P94) -> miniatura 256 px do Commons; crédito em `credito/municipio/{ibge}.json` | `-64.webp`, `-256.webp` |
| `pdf/proposicao/{id}` | `urlInteiroTeor`: pautas.ts, depois Plenário 24 meses (mais recente primeiro) | `.pdf` |
| `pdf/frente/{id}` | `urlDocumento`, legislatura 57 (por último) | `.pdf` |

- `manifest.json`: `{gerado, itens:[{chave, origem, tipo, bytes, sha256, etag?, modificado?, variantes, licenca?}]}`, ordenado; `gerado` só muda se itens mudarem.
- `incremental`: item com arquivos presentes -> sem requisição. `completo`: GET condicional (`If-None-Match`/`If-Modified-Since`); 304 ou mesmo sha256 -> não reescreve. TSE: ETag do zip por item.
- Limites: arquivo ≤ 50 MB, total ≤ 1,5 GB (PDFs na ordem acima; imagens sempre). Concorrência ≤ 8, 4 tentativas, UA `emenda.online asset mirror (+https://emenda.online)`.
- Imagens recodificadas (sem metadados), saída determinística; arquivo só é gravado se o conteúdo mudar.
- Worker: `Cache-Control: public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=604800` (manifest: 1h na borda), ETag/304, CORS `*`, nosniff, SVG com CSP `sandbox`. 404: foto/logo -> 302 para a URL oficial; PDF -> 302 via API da Câmara.
- TSE: zips lidos por faixas HTTP (`zipremoto`); versão fixada pelo ETag da 1ª faixa (o CDN do TSE responde HEAD e GET com versões diferentes).
- Cobertura: `emenda-assets --cobertura --out DIR [--tse … --ibge … --tse2022 …]` -> tabela + `cobertura.json` (antes/depois por categoria).
- Web: `apps/web/src/lib/cdn.ts` (`VITE_CDN_BASE`, padrão `/cdn` na mesma origem; com o domínio: `https://cdn.emenda.online`; vazio desliga); `Avatar` troca URL oficial por srcset 160/512 e volta à oficial em erro; `EmblemaMunicipio` (bandeira -> brasão -> UF, crédito quando a licença exige); autor sem id -> `fotoPorNome`.
