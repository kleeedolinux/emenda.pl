# UX: perguntas que cada página responde

Regra: a 1ª tela responde a pergunta, em português do dia a dia. Detalhe técnico vai para "Ver tudo" (`ModoDetalhado`).

| Página | Pergunta (job) | 1ª tela |
|---|---|---|
| `/` | Quanto dinheiro chegou na minha cidade e quem mandou? | Busca de cidade (modos), 3 números clicáveis, mapa com estados clicáveis |
| `/municipio/:ibge` | Quanto chegou aqui, de quem, de que jeito? | R$ + por morador + frase + barra de tipos + 3 rostos |
| `/uf/:uf` | Para onde vai o dinheiro do meu estado? | R$ + por morador + barra de tipos + quem mais mandou |
| `/deputado/:id`, `/senador/:id` | O que fez com o dinheiro e como votou? | Foto, frase, 4 blocos (dinheiro, cota, votos, projetos) |
| `/pix` | Alguém está mandando sem dizer para quê? | R$ + % do total + "sua cidade recebeu assim?" + rostos |
| `/auditar` | Devo votar de novo nessa pessoa? | Busca de deputado/senador → boletim |

## Palavras

| Jargão | Na tela | Cor |
|---|---|---|
| Emenda parlamentar | dinheiro que o deputado/senador mandou | — |
| Individual | Com destino definido | verde |
| Bancada | Mandado pelo grupo do estado | azul |
| Comissão | Mandado por uma comissão | roxo |
| Emenda Pix | Sem dizer para quê | amarelo |
| RP9 / relator | Orçamento secreto | vermelho |

Fonte única do texto: `apps/web/src/ui/glossario.ts` (`TIPOS_LEIGO`), usado pelo Tip/glossário e pelo painel do gráfico. Cor e ícone: `features/linguagem/linguagem.ts` (`TIPO_DINHEIRO`). Jargão só em Tip ou entre parênteses.

## Componentes

- `features/linguagem`: `TipoChip`, `BarraTipos`, `LegendaTipos`, `QuemMandou`, `AreasGasto`, `ListaVerMais`, `ModoDetalhado`, `usePopulacao`.
- `BarraTipos`: tocar numa cor abre painel (sentido, R$, % do total, principais nomes, "Ver mais"). Toda divisão por tipo usa ela.
- `Tip`: área de toque ≥ 44 px; toque abre/fecha; fora ou Esc fecha; < 640 px abre painel inferior.
- `features/busca`: `BuscaUniversal` (Home, topo/Ctrl+K, Pix, Emendas, Auditar, `/busca`). Índice `/data/v1/busca.json` (1 requisição no 1º foco; reserva: APIs ao vivo). Estado → chip de filtro (`uf`) para cidade/deputado/senador. Enter sem seleção → `/busca?q=&modo=&uf=`. Ranqueador puro em `ranker.ts`.

## Listas

- Padrão: 3–8 itens + "Ver mais". Tabelas completas só dentro de `ModoDetalhado`.
- Todo número grande e todo estado no mapa é link.

## Responsividade

- Auditoria: `cd apps/web && bun run audit:responsivo` (rotas de `e2e/rotas.ts` × 280–1920 px × Chromium + WebKit, temas claro/escuro, carregando, "ver mais", busca/menu/dica abertos). Sai 1 se houver achado. Rodar antes de deploy. `BASE=`, `ENGINES=`, `WIDTHS=`, `ROTAS=`, `GRUPO=k/n` (lotes) restringem.
- Rota nova no `router.tsx` precisa de exemplo em `e2e/rotas.ts` (teste `src/test/rotas-e2e.test.ts`).
- Toque (`@media (pointer: coarse)` em `styles.css`): controles ≥ 44 px, links ≥ 24 px via `::after`, sem mudar o layout.
- `DataTable`: 4+ colunas viram cartões abaixo de `md` (`stack`), com rótulo por célula e seletor de ordem.
- `data-tap-equiv`: alvo pequeno com controle equivalente grande na mesma tela (WCAG 2.5.8).
