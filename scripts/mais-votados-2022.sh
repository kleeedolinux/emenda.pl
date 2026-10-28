#!/usr/bin/env bash
# Gera v1/eleicao2022/mais-votados.json (deputados federais e senadores eleitos em 2022, votos nominais) a partir do TSE.
set -euo pipefail
OUT=${1:-data/out}; CACHE=${CACHE:-$HOME/.cache/emenda.pl}
mkdir -p "$CACHE" "$OUT/v1/eleicao2022"
Z="$CACHE/votacao_candidato_munzona_2022.zip"
[ -f "$Z" ] || curl -sfL -o "$Z" https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip
F=$(unzip -Z1 "$Z" | grep -i '_BRASIL\.csv$' || unzip -Z1 "$Z" | grep -i '\.csv$' | head -1)
unzip -p "$Z" "$F" | iconv -f latin1 -t utf8 | bun "$(dirname "$0")/mais-votados-2022.ts" > "$OUT/v1/eleicao2022/mais-votados.json"
