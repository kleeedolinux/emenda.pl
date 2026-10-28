# reel

30 s demo video for emenda.online. Output goes to `media/`.

| output | format |
|---|---|
| `media/emenda-online-reel-16x9.mp4` | 1920×1080, 60 fps, H.264 yuv420p + AAC, faststart |
| `media/emenda-online-reel-4x5.mp4` | 1080×1350, same |
| `media/reel-poster.png` | 1920×1080, frame at 29.5 s |

## Re-render

```sh
# once: build lutier (sound engine)
git clone https://github.com/ctresb/lutier /path/to/lutier && (cd /path/to/lutier && cargo build --release)

LUTIER=/path/to/lutier apps/reel/build.sh          # music + both videos + poster
FPS=30 LUTIER=/path/to/lutier apps/reel/build.sh   # 30 fps
```

Needs `bun`, `ffmpeg`, and Chrome/Chromium. By default it uses Playwright's cached browser; otherwise set `CHROME=/path/to/chrome`. No npm deps.

Preview one frame: `bun apps/reel/render.ts --w 1080 --h 1350 --still 12 --out /tmp/f.png`.

## Layout

| path | role |
|---|---|
| `src/reel.{html,js,css}` | scenes. `seek(t)` sets every element from time `t`, so frames are deterministic. |
| `render.ts` | headless Chrome (CDP) → JPEG frames → ffmpeg |
| `music/reel.{synth,score}` | lutier sources. 128 BPM, 64 beats = 30 s. |
| `data/reel-data.json` | figures shown in the video |
| `assets/` | fonts (OFL), Câmara photos, brand copies (`logo-mark.svg`, `logo.svg`, `wordmark-dark.svg`) from `apps/web/public/brand`. Re-copy them when the brand changes. |

Cuts land on beats 0 8 20 32 44 48 52 56 (beat = 60/128 s). If you change one, change it in both `reel.js` and `reel.score`.

## Data (real, no invented figures)

- Emendas: Portal da Transparência/CGU, `EmendasParlamentares.csv` + `_PorFavorecido.csv`, downloaded 2026-10-28. Pago = Valor Pago + Restos a Pagar Pagos.
- Deputados and votações: Câmara Dados Abertos API v2 (`/deputados`, `/votacoes/2196833-373/votos`, `/proposicoes/2430143/votacoes`).
- Prefeito: TSE 2024 (`consulta_cand`).
- Map: IBGE malhas API v3, UF level.

## Credits

Música: Lutier (github.com/ctresb).
