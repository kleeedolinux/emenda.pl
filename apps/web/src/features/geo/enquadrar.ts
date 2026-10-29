import { geoCentroid, geoDistance } from "d3-geo";
import type { GeoFC } from "./malhas";

/**
 * Remove ilhas isoladas (ex.: Fernando de Noronha em PE) do cálculo de enquadramento,
 * para o mapa não encolher o continente num canto. Isolado = vizinho mais próximo muito
 * mais distante que o normal do estado (4× o percentil 95).
 */
export function paraEnquadrar(fc: GeoFC): GeoFC {
  const n = fc.features.length;
  if (n < 3) return fc;
  const c = fc.features.map((f) => geoCentroid(f as never));
  const vizinho = c.map((a, i) => Math.min(...c.map((b, j) => (i === j ? Infinity : geoDistance(a, b)))));
  const p95 = [...vizinho].sort((a, b) => a - b)[Math.floor(n * 0.95) - 1]!;
  const features = fc.features.filter((_, i) => vizinho[i]! <= 4 * p95);
  return features.length ? { ...fc, features } : fc;
}
