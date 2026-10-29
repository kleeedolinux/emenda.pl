// Gera src/features/geo/hero/paths.ts: caminhos SVG das UFs já projetados no viewBox do hero.
// O hero não baixa a malha nem carrega d3-geo/topojson. Rodar quando public/geo/br-uf.json mudar:
//   cd apps/web && bun scripts/hero-paths.ts
import { UF_POR_CODIGO } from "@emenda/contracts";
import { geoMercator, geoPath } from "d3-geo";
import { readFileSync, writeFileSync } from "node:fs";
import { toFeatureCollection } from "../src/features/geo/malhas";
import { MAP } from "../src/features/geo/hero/GlassMap";

const raw = JSON.parse(readFileSync(new URL("../public/geo/br-uf.json", import.meta.url), "utf8"));
const fc = toFeatureCollection(raw);
const geo = fc as unknown as Parameters<ReturnType<typeof geoMercator>["fitSize"]>[1];
const proj = geoMercator().fitExtent([[14, 14], [MAP.w - 14, MAP.h - 14]], geo);
const gp = geoPath(proj).digits(1);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Número curto: 1 casa, sem zero à esquerda (".5", "-.5"). */
const num = (n: number) => { const t = String(Math.round(n * 10) / 10); return t.replace(/^(-?)0\./, "$1."); };
/** Simplifica (descarta pontos a menos de 0,7 unidade do anterior) e escreve com comandos relativos numa grade de 0,1. */
function compactar(d: string): string {
  const out: string[] = [];
  for (const ring of d.split("M").filter(Boolean)) {
    const nums = ring.replace(/Z/g, "").split(/[ ,L]+/).filter(Boolean).map(Number);
    const pts: Array<[number, number]> = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const q: [number, number] = [Math.round(nums[i]! * 10), Math.round(nums[i + 1]! * 10)];
      const l = pts.at(-1);
      if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) >= 7) pts.push(q);
    }
    if (pts.length < 3) continue;
    let s = `M${num(pts[0]![0] / 10)} ${num(pts[0]![1] / 10)}l`;
    for (let i = 1; i < pts.length; i++) {
      const dx = num((pts[i]![0] - pts[i - 1]![0]) / 10), dy = num((pts[i]![1] - pts[i - 1]![1]) / 10);
      s += `${i > 1 && !dx.startsWith("-") ? " " : ""}${dx}${dy.startsWith("-") ? "" : " "}${dy}`;
    }
    out.push(s + "z");
  }
  return out.join("");
}
const ufs = fc.features.map((f) => {
  const g = f as unknown as Parameters<typeof gp>[0];
  const [x, y] = gp.centroid(g);
  return { key: UF_POR_CODIGO[String(f.properties.codarea)] ?? String(f.properties.codarea), d: compactar(gp(g) ?? ""), c: [r1(x), r1(y)] as [number, number] };
}).sort((a, b) => a.key.localeCompare(b.key));

const out = `// GERADO por scripts/hero-paths.ts a partir de public/geo/br-uf.json. Não editar à mão.
import type { Pt } from "./flow";

export const HERO_UF: ReadonlyArray<{ key: string; d: string; c: Pt }> = ${JSON.stringify(ufs)};
`;
writeFileSync(new URL("../src/features/geo/hero/paths.ts", import.meta.url), out);
console.log(`${ufs.length} UFs, ${out.length} bytes`);
