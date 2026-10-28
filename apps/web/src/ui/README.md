# src/ui — UI kit (importe de `@/ui`)

| Export | Uso |
|---|---|
| `AppShell`, `NAV` | Layout raiz: header (Logo, nav, busca Ctrl+K, tema, online), drawer móvel, barra inferior móvel, footer, transições, scroll restoration, hits. |
| `SearchDialog`, `openSearch(q?)` | Busca global (autores, UFs, municípios IBGE, deputado/proposição). |
| `PageHeader` | `{eyebrow?, title, subtitle?, actions?, breadcrumbs?, media?}`. |
| `Card`, `Section` | Cartão com título/tip/ações; seção com título e âncora `id`. |
| `Stat`, `StatGrid` | KPI com tip; grade animada. |
| `Money`, `NumberFmt`, `CountUp` | Centavos→BRL; número pt-BR; contagem animada. |
| `Tip`, `Term`, `GLOSSARIO`, `termo`, `tipOf` | Tooltip info; termo com definição; glossário leigo. `tip` aceita chave do glossário. |
| `Badge`, `PartyBadge`, `VoteBadge` | Selo por tom; partido com cor determinística (link /partido); voto. |
| `Avatar` | Foto com fallback de iniciais. |
| `DataTable<T>` | Ordenação, filtro, paginação, cabeçalho fixo, CSV (`exportName`). |
| `Tabs` | Abas sincronizadas com `?tab=`. |
| `Skeleton`, `Spinner`, `ErrorState`, `EmptyState` | Estados de carregamento/erro/vazio. |
| `Bars`, `Donut`, `LineArea`, `Hemicycle`, `Sankey`, `Choropleth` | Gráficos animados (SVG/d3). |
| `Timeline`, `KeyValue`, `ExternalLink`, `ButtonLink`, `NextSteps` | Linha do tempo; pares rótulo/valor; link externo; botão; "próximos passos". |
| `Reveal`, `fadeUp`, `stagger` | Animação em cascata (respeita reduced-motion). |
| `useTheme` | Tema claro/escuro (persistido, segue sistema). |
| `ConsentBanner`, `OnlinePill`, `Audiencia`, `usePageHits`, `useStats` | Analytics anônimo, aviso LGPD, online agora, painel público. |
| `useApi`, `useCamara`, `camara`, `fetchJson`, `ibge`, `externo` | Dados same-origin (`src/lib/data.ts`). |
| `formatCNPJ`, `formatDocumento`, `formatNumber`, `formatPct`, `formatDate`, `toCSV`, `partyColor` | Utilidades puras (`src/lib`). |
