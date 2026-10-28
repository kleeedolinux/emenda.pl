#!/usr/bin/env bash
# Baixa dados abertos (Portal da Transparência, TSE, IBGE) e gera o JSON estático v1.
# Uso: scripts/build-data.sh [--out DIR] [--cache DIR]   (padrão: data/out, data/cache)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/data/out"
cache="${XDG_CACHE_HOME:-$HOME/.cache}/emenda.pl"
while [ $# -gt 0 ]; do
  case "$1" in
    --out) out="$2"; shift 2 ;;
    --cache) cache="$2"; shift 2 ;;
    *) echo "uso: $0 [--out DIR] [--cache DIR]" >&2; exit 2 ;;
  esac
done
mkdir -p "$cache/emendas"
get() { if [ ! -s "$2" ]; then curl -fL --retry 3 -o "$2.tmp" "$1" && mv "$2.tmp" "$2"; fi; }
get https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/UNICO "$cache/emendas.zip"
get https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2024.zip "$cache/consulta_cand_2024.zip"
get https://servicodados.ibge.gov.br/api/v1/localidades/municipios "$cache/ibge_municipios.json"
unzip -oq "$cache/emendas.zip" -d "$cache/emendas"
cargo run -q -p etl --release --manifest-path "$root/Cargo.toml" -- \
  --input "$cache/emendas" --out "$out" \
  --tse "$cache/consulta_cand_2024.zip" --ibge "$cache/ibge_municipios.json"
echo "ok: $out/v1 ($(du -sh "$out/v1" | cut -f1))"
