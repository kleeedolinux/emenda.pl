# emenda.pl — marca

Fonte única: `crates/og/src/brand.rs` (`MARK_BODY`). Regerar arquivos:
`cargo run -p og --example brand -- apps/web/public`.

## Cores

| token | hex | uso |
|---|---|---|
| verde | `#009c3b` | símbolo, theme-color, ".pl" em fundo claro |
| verde-claro | `#1fc35f` | ".pl" e destaques em fundo escuro |
| amarelo | `#ffdf00` | coluna central, eyebrow, destaque de valor |
| azul | `#002776` | texto do logo em fundo claro, linha-base |
| marinho | `#001a4f` → `#000c26` | fundo OG / modo escuro |
| branco | `#ffffff` | colunas laterais, texto em fundo escuro |

## Tipo

- Wordmark e títulos: Space Grotesk Bold (700), tracking -0.5.
- Texto/rótulos: Inter 400/600. Valores em R$: Inter Bold, "R$" menor e atenuado.
- Eyebrow: Inter 600, CAIXA ALTA, tracking +2.6.

## Símbolo

- Grade 64×64, módulo 4: colunas 12/16/12, linha-base 48×4, raio 16. Simétrico no eixo vertical.
- Nítido em 16 e 32 px. Mínimo: 16 px (símbolo), 96 px de largura (logo completo).
- Área de proteção: 1/4 da altura do símbolo em todos os lados.

## Arquivos

| arquivo | uso |
|---|---|
| `logo.svg` | símbolo + wordmark, fundo claro |
| `logo-mark.svg` / `/favicon.svg` | só símbolo |
| `logo-mono.svg` | uma cor (`currentColor`) |
| `wordmark-dark.svg` | wordmark para fundo escuro |
| `favicon-32.png`, `apple-touch-icon.png`, `icon-192/512.png`, `maskable-512.png` | ícones |
| `og-default.png` (= `/og/default.png`) | OG 1200×630 |
| `@/ui/brand/Logo` | React; wordmark herda `currentColor` |

## Faça / não faça

- Faça: símbolo sobre branco, marinho ou verde puro; wordmark sempre minúsculo.
- Faça: valores monetários com numerais grandes e rótulo curto embaixo.
- Não: recolorir as colunas, girar, aplicar sombra, contorno ou gradiente no símbolo.
- Não: reproduzir a bandeira ou brasões oficiais; a paleta evoca, não copia.
- Não: esticar, comprimir ou trocar a fonte do wordmark.
