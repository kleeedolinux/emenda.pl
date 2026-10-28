# src/ui — UI kit (importe de `@/ui`)

| Export | Uso |
|---|---|
| `AppShell`, `NAV` | Layout raiz: header (Logo, nav, busca Ctrl+K, tema, online), drawer móvel, barra inferior móvel, footer, transições, scroll restoration, hits. |
| `SearchDialog`, `openSearch(q?)` | Busca global (autores, UFs, municípios IBGE, deputado/proposição). |
| `PageHeader` | `{eyebrow?, title, subtitle?, actions?, breadcrumbs?, media?}`. |
| `Card`, `Section` | Cartão com título/tip/ações; seção com título e âncora `id`. |
| `Stat`, `StatGrid` | KPI com tip; grade animada. |
| `Money`, `NumberFmt` | Centavos→BRL; número pt-BR. |
| `Tip`, `Term`, `GLOSSARIO`, `termo`, `tipOf` | Tooltip info; termo com definição; glossário leigo. `tip` aceita chave do glossário. |
| `Badge`, `PartyBadge`, `VoteBadge` | Selo por tom; partido com cor determinística (link /partido); voto. |
| `Avatar` | Foto com fallback de iniciais. |
| `DataTable<T>` | Ordenação, filtro, paginação, cabeçalho fixo, CSV (`exportName`). |
| `Tabs` | Abas sincronizadas com `?tab=`. |
| `Skeleton`, `Spinner`, `ErrorState`, `EmptyState` | Estados de carregamento/erro/vazio. |
| `Bars`, `Donut`, `LineArea`, `Hemicycle`, `Sankey`, `Choropleth` | Gráficos com entrada animada: barras crescem (scaleX), linha desenha (pathLength), donut varre, nós do Sankey crescem e vínculos fluem no hover, assentos do hemiciclo caem, estado do mapa levanta + tooltip com mola. |
| `Timeline`, `KeyValue`, `ExternalLink`, `ButtonLink`, `NextSteps` | Linha do tempo; pares rótulo/valor; link externo; botão; "próximos passos". |
| `useMalha(url)` | Malha TopoJSON/GeoJSON → FeatureCollection pronta para d3 (enrolamento corrigido). Malhas estáticas em `public/geo` (`bun scripts/fetch-geo.ts`). |
| `useTheme` | Tema claro/escuro (persistido, segue sistema). |
| `AvisoPrivacidade` (alias `ConsentBanner`), `PrivacidadeControle`, `OnlinePill`, `Audiencia`, `usePageHits`, `useStats` | Audiência anônima por legítimo interesse (LGPD art. 7º, IX): aviso não bloqueante, opt-out persistido, respeita DNT/GPC; online agora; painel público. |
| `useApi`, `useCamara`, `camara`, `fetchJson`, `ibge`, `externo` | Dados same-origin (`src/lib/data.ts`). |
| `formatCNPJ`, `formatDocumento`, `formatNumber`, `formatPct`, `formatDate`, `toCSV`, `partyColor` | Utilidades puras (`src/lib`). |

## Movimento — `src/ui/motion/` (exportado por `@/ui`)

Regras: só `transform`/`opacity`; tudo respeita `prefers-reduced-motion`; loops pausam fora da tela/aba oculta (`useActive`).

| Export | Uso |
|---|---|
| `duration`, `easing`, `spring`, `staggerStep`, `staggerDelay`, `cssEase`, `cubicBezier`, `pickMotion` | Tokens puros. Espelho CSS: `--motion-ease-*`, `--motion-dur-*` em `styles.css` (teste `css-sync`). |
| `Reveal` / `Stagger` + `.Item` | Cascata ao entrar na tela. `step` ajusta o passo. |
| `RevealText` | Título palavra a palavra (máscara + subida). |
| `CountUp` | Conta até o valor ao aparecer; mudanças animam do valor atual. |
| `NumberRoll` | Odômetro de dígitos (dinheiro ao vivo). |
| `Magnetic`, `Tilt`, `Parallax` | Atração ao ponteiro; inclinação 3D; deslocamento por rolagem. |
| `pressable`, `liftable` | Props para `motion.*`: press afunda, hover eleva. CSS: utilitários `press`, `sheen`. |
| `ScrollProgress` | Barra de leitura com as cores da bandeira (montada no `AppShell`). |
| `RouteTransition` | Troca de rota com "wipe" verde/amarelo/azul + subida do conteúdo (no `AppShell`). |
| `TransitionLink`, `sharedTitleProps` | Elemento compartilhado via View Transitions: `[data-shared-source]` do link vira o `h1` do `PageHeader`. |
| `toast(msg)`, `Toaster` | Confirmação discreta (`aria-live`). Ex.: CSV baixado. |
| `useActive(ref)` | `true` se visível e aba ativa. |

Utilitários CSS: `skeleton-sheen`, `row-in` (linhas de tabela, `--i`), `sankey-flow`, `map-lift`.
