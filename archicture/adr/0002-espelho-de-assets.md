# 0002 - espelho de assets (cdn.emenda.online)
Status: accepted
Context: fotos/logos/PDFs vêm de servidores oficiais lentos (Câmara, Senado, TSE); páginas com muitas fotos travam.
Decision: `emenda-assets` (`crates/etl/src/assets`) espelha em branch órfão `assets` (force-push, histórico mínimo); Worker serve em `cdn.emenda.online` e `/cdn/*` (`src/cdn.rs`, `src/glue_cdn.rs`) a partir de raw.githubusercontent, com Cache API e cache de 30 dias. Sem arquivo -> 302 para a origem oficial.
Consequences: sem novo serviço nem storage pago; branch limitado a ~1,5 GB (PDFs por prioridade); caminhos estáveis (não versionados) -> atualização leva até 30 dias na borda.
