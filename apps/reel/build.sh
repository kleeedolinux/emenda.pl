#!/bin/sh
# Rebuild soundtrack + both reels + poster.
# Requires: bun, ffmpeg, a Chrome/Chromium (CHROME=...), lutier built at $LUTIER (repo dir).
set -eu
REEL=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$REEL/../.." && pwd)
LUTIER=${LUTIER:?set LUTIER=/path/to/lutier (cargo build --release done)}
TMP=${TMPDIR:-/tmp}/emenda-reel
mkdir -p "$TMP" "$ROOT/media"

# 1. music (imports in reel.synth are relative to the lutier repo)
(cd "$LUTIER" && ./target/release/lutier "$REEL/music/reel.synth" "$REEL/music/reel.score" -o "$TMP/raw.wav" --seed 1)
# 2. master: cut at 30 s, -14 LUFS, true peak < -1.5 dBTP
ffmpeg -v error -y -i "$TMP/raw.wav" \
  -af "atrim=0:30,afade=t=out:st=29.6:d=0.4,volume=2.2dB,aresample=192000,alimiter=limit=0.8:attack=2:release=60:level=false,aresample=48000" \
  -c:a pcm_s24le "$TMP/master.wav"
# 3. video
FPS=${FPS:-60}
bun "$REEL/render.ts" --w 1920 --h 1080 --fps "$FPS" --audio "$TMP/master.wav" --out "$ROOT/media/emenda-online-reel-16x9.mp4"
bun "$REEL/render.ts" --w 1080 --h 1350 --fps "$FPS" --audio "$TMP/master.wav" --out "$ROOT/media/emenda-online-reel-4x5.mp4"
bun "$REEL/render.ts" --w 1920 --h 1080 --still 29.5 --out "$ROOT/media/reel-poster.png"
