#!/usr/bin/env bash
# Libera espaço no /tmp (tmpfs) ocupado por scratchpads do Claude Code e caches do bunx.
# Downloads caros (dl, assets-out) são movidos para ~/.cache/emenda.pl; o resto é regenerável e apagado.
# Uso: scripts/limpar-tmp.sh [--dry-run]
set -euo pipefail

DRY=0; [[ "${1:-}" == "--dry-run" ]] && DRY=1
CACHE="$HOME/.cache/emenda.pl"
BASE="/tmp/claude-$(id -u)"
APAGAR=(target w wt harness databranch data fr wasmsize)
MOVER=(dl assets-out)

run() { if ((DRY)); then echo "[dry] $*"; else "$@"; fi; }

echo "Antes:"; df -h /tmp | tail -1
mkdir -p "$CACHE"

shopt -s nullglob
for sp in "$BASE"/*/*/scratchpad; do
  for d in "${MOVER[@]}"; do
    [[ -d "$sp/$d" ]] || continue
    echo "mover  $sp/$d -> $CACHE/$d"
    run mkdir -p "$CACHE/$d"
    run cp -a "$sp/$d/." "$CACHE/$d/"
    run rm -rf "$sp/$d"
  done
  for d in "${APAGAR[@]}"; do
    [[ -e "$sp/$d" ]] || continue
    echo "apagar $sp/$d ($(du -sh "$sp/$d" 2>/dev/null | cut -f1))"
    run rm -rf "$sp/$d"
  done
done

for d in /tmp/bunx-*; do
  echo "apagar $d"
  run rm -rf "$d"
done

echo "Depois:"; df -h /tmp | tail -1
