// Utilidades geográficas puras + malhas estáticas (public/geo, geradas por scripts/fetch-geo.ts).
import { UF_POR_CODIGO, UFS, type SiglaUf } from "@emenda/contracts";
import { geoArea } from "d3-geo";
import { feature } from "topojson-client";

export const isSiglaUf = (s: string): s is SiglaUf => s.toUpperCase() in UFS;
export const nomeUf = (s: string) => (isSiglaUf(s) ? UFS[s.toUpperCase() as SiglaUf] : s);
/** Código IBGE de UF (2 dígitos) -> sigla. */
export const siglaPorCodigo = (cod: string) => UF_POR_CODIGO[cod.slice(0, 2)];

export interface GeoFeature { type: "Feature"; properties: { codarea: string }; geometry: { type: string; coordinates: unknown } }
export interface GeoFC { type: "FeatureCollection"; features: GeoFeature[] }

type Ring = unknown[];
/**
 * d3-geo exige anel exterior em sentido horário (esférico). GeoJSON RFC 7946 usa anti-horário:
 * d3 leria "o globo menos o estado" (área > 2π sr) e o preenchimento cobriria tudo. Inverte os anéis nesse caso.
 */
export function rewindForD3(fc: GeoFC): GeoFC {
  for (const f of fc.features) {
    if (geoArea(f as never) <= 2 * Math.PI) continue;
    const g = f.geometry as { type: string; coordinates: Ring[] | Ring[][] };
    if (g.type === "Polygon") for (const r of g.coordinates as Ring[]) r.reverse();
    else if (g.type === "MultiPolygon") for (const p of g.coordinates as Ring[][]) for (const r of p) r.reverse();
  }
  return fc;
}

/** Códigos de feições ainda grandes demais (> 0,1 sr): malha inválida para d3. */
export const featuresInvalidas = (fc: GeoFC) => fc.features.filter((f) => geoArea(f as never) > 0.1).map((f) => f.properties.codarea);

/** Aceita TopoJSON (arquivos estáticos) ou GeoJSON e devolve FeatureCollection pronta para d3. */
export function toFeatureCollection(data: unknown): GeoFC {
  const d = data as { type?: string };
  if (d?.type !== "Topology") return rewindForD3(data as GeoFC);
  type Topo = Parameters<typeof feature>[0];
  const t = data as Topo;
  const key = Object.keys(t.objects)[0]!;
  return rewindForD3(feature(t, t.objects[key] as never) as unknown as GeoFC);
}

// ---------- índice de municípios ----------
export type MunicipioCompacto = [id: number, nome: string, uf: string];
interface ApiMunicipio {
  id: number;
  nome: string;
  microrregiao?: { mesorregiao?: { UF?: { sigla: string } } } | null;
  "regiao-imediata"?: { "regiao-intermediaria"?: { UF?: { sigla: string } } } | null;
}
export const compactMunicipios = (rows: ApiMunicipio[]): MunicipioCompacto[] =>
  rows
    .map((m): MunicipioCompacto => [m.id, m.nome, m.microrregiao?.mesorregiao?.UF?.sigla ?? m["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ?? ""])
    .sort((a, b) => a[0] - b[0]);
export const expandMunicipios = (rows: MunicipioCompacto[]) => rows.map(([id, nome, uf]) => ({ id, nome, uf }));
