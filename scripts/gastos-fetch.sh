#!/usr/bin/env bash
# Baixa as fontes oficiais de gastos parlamentares (Câmara + Senado) para o cache
# e gera v1/gastos/** com `emenda-gastos`.
# Uso: scripts/gastos-fetch.sh [--out DIR] [--cache DIR] [--desde ANO]
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/data/out"
cache="${XDG_CACHE_HOME:-$HOME/.cache}/emenda.pl/gastos"
desde=2019
while [ $# -gt 0 ]; do
  case "$1" in
    --out) out="$2"; shift 2 ;;
    --cache) cache="$2"; shift 2 ;;
    --desde) desde="$2"; shift 2 ;;
    *) echo "uso: $0 [--out DIR] [--cache DIR] [--desde ANO]" >&2; exit 2 ;;
  esac
done
ano="$(date +%Y)"
mkdir -p "$cache/camara/deputados" "$cache/senado"
get() { if [ ! -s "$2" ]; then curl -fsSL --retry 3 -o "$2.tmp" "$1" && mv "$2.tmp" "$2"; fi; }
# ano corrente e anterior sempre rebaixados (arquivos mudam diariamente)
fresh() { rm -f "$2"; get "$1" "$2"; }

C=https://www.camara.leg.br
for y in $(seq "$desde" "$ano"); do
  f="$cache/camara/Ano-$y.csv.zip"
  if [ "$y" -ge $((ano - 1)) ]; then fresh "$C/cotas/Ano-$y.csv.zip" "$f"; else get "$C/cotas/Ano-$y.csv.zip" "$f"; fi
done
fresh https://dadosabertos.camara.leg.br/arquivos/funcionarios/csv/funcionarios.csv "$cache/camara/funcionarios.csv"
fresh "https://dadosabertos.camara.leg.br/api/v2/deputados?itens=1000&ordem=ASC&ordenarPor=nome" "$cache/camara/deputados.json"
# página oficial do deputado: subsídio, imóvel funcional, auxílio-moradia, viagens, cota e verba de gabinete do ano
grep -o '"id":[0-9]*' "$cache/camara/deputados.json" | cut -d: -f2 | sort -u |
  xargs -P 8 -I{} sh -c 'f="$1/camara/deputados/$2.html"; [ -s "$f" ] || curl -fsSL --retry 3 -o "$f" "https://www.camara.leg.br/deputados/$2" || rm -f "$f"' _ "$cache" {}

S=https://adm.senado.gov.br/adm-dadosabertos/api/v1
for y in $(seq "$desde" "$ano"); do
  f="$cache/senado/ceaps-$y.json"
  if [ "$y" -ge $((ano - 1)) ]; then fresh "$S/senadores/despesas_ceaps/$y" "$f"; else get "$S/senadores/despesas_ceaps/$y" "$f"; fi
done
fresh "$S/senadores/auxilio-moradia-imoveis-funcionais" "$cache/senado/auxmoradia.json"
fresh "$S/servidores/servidores/ativos" "$cache/senado/servidores.json"
fresh https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json "$cache/senado/atual.json"
# folha mais recente publicada (até 3 meses atrás)
rm -f "$cache"/senado/remuneracoes-*.json
for k in 0 1 2 3; do
  ym="$(date -d "$(date +%Y-%m-15) -$k month" +%Y/%-m)"
  f="$cache/senado/remuneracoes-${ym/\//-}.json"
  if curl -fsSL --retry 3 -o "$f.tmp" "$S/servidores/remuneracoes/$ym" && [ "$(head -c 2 "$f.tmp")" = "[{" -o "$(head -c 3 "$f.tmp")" = $'[\n{' ]; then
    mv "$f.tmp" "$f"; break
  fi
  rm -f "$f.tmp"
done

cargo run -q -p etl --release --bin emenda-gastos --manifest-path "$root/Cargo.toml" -- \
  --cache "$cache" --out "$out" --ano "$ano"
echo "ok: $out/v1/gastos ($(du -sh "$out/v1/gastos" | cut -f1))"
