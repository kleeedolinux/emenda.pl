#!/usr/bin/env bun
// Baixa uma vez as malhas do IBGE (TopoJSON, qualidade mínima) e o índice de municípios
// para apps/web/public/geo. Os arquivos são estáticos e versionados: o site não depende
// de /api/ibge para desenhar mapas.
//   bun scripts/fetch-geo.ts
import { mkdir, writeFile } from "node:fs/promises";
import { UFS } from "../packages/contracts/src/index";
import { compactMunicipios, featuresInvalidas, toFeatureCollection } from "../apps/web/src/features/geo/malhas";

const OUT = new URL("../apps/web/public/geo/", import.meta.url).pathname;
const API = "https://servicodados.ibge.gov.br/api";
const Q = "formato=application/json&qualidade=minima";

async function get(url: string): Promise<unknown> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (r.ok) return r.json();
    await Bun.sleep(800 * (i + 1));
  }
  throw new Error(`falha: ${url}`);
}
/** TopoJSON do IBGE com coordenadas já quantizadas; só arredonda o `transform`. */
/** Garante que cada feição é lida por d3-geo como o estado/município, não como o globo invertido. */
const check = (path: string, data: unknown) => {
  const bad = featuresInvalidas(toFeatureCollection(structuredClone(data)));
  if (bad.length) throw new Error(`${path}: feições inválidas para d3: ${bad.join(", ")}`);
};
const save = async (path: string, data: unknown) => {
  if (path !== "municipios.json") check(path, data);
  const s = JSON.stringify(data, (_, v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1e7) / 1e7 : v));
  await writeFile(OUT + path, s);
  console.log(path, (s.length / 1024).toFixed(1), "kB");
};

await mkdir(OUT + "uf", { recursive: true });
await save("br-uf.json", await get(`${API}/v3/malhas/paises/BR?intrarregiao=UF&${Q}`));
for (const uf of Object.keys(UFS)) await save(`uf/${uf}.json`, await get(`${API}/v3/malhas/estados/${uf}?intrarregiao=municipio&${Q}`));
await save("municipios.json", compactMunicipios((await get(`${API}/v1/localidades/municipios`)) as never));
