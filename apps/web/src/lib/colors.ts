// Cores puras: partidos, escalas de mapa, contraste.
import { scaleLinear } from "d3-scale";

/** Cores aproximadas das identidades visuais dos partidos (fixas para os mais comuns). */
const PARTIDOS: Record<string, string> = {
  PT: "#c4122d", PL: "#1b3f8b", UNIAO: "#2d5bd7", PP: "#1f6fb5", PSD: "#f0a20b", MDB: "#2f9a48",
  REPUBLICANOS: "#2b6cb0", PSB: "#e6732e", PDT: "#c53030", PSDB: "#0b5fa5", PODE: "#4aa3df",
  PSOL: "#a21caf", PCDOB: "#b91c1c", NOVO: "#f97316", AVANTE: "#0891b2", SOLIDARIEDADE: "#ea580c",
  PRD: "#155e75", CIDADANIA: "#db2777", PV: "#16a34a", REDE: "#0d9488", AGIR: "#7c3aed", MOBILIZA: "#65a30d",
  PCB: "#991b1b", PSTU: "#7f1d1d", DC: "#1e40af", PMB: "#be185d", PRTB: "#15803d", S_PART: "#64748b",
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Cor determinística por sigla (case/acento-insensível). */
export function partyColor(sigla: string): string {
  const k = norm(sigla);
  const fixed = PARTIDOS[k] ?? (k === "" || k === "SPART" || k === "SEMPARTIDO" ? PARTIDOS.S_PART : undefined);
  if (fixed) return fixed;
  const h = hash(k);
  return `hsl(${h % 360} ${55 + (h >> 9) % 20}% ${38 + (h >> 17) % 10}%)`;
}

const MAPA = ["#eef7e9", "#9fdcaa", "#2fb35d", "#00703c", "#002776"];

/** Escala sequencial (claro -> verde -> azul). Nulo -> token neutro. */
export function sequentialScale([min, max]: [number, number]) {
  const hi = max > min ? max : min + 1;
  const stops = MAPA.map((_, i) => min + ((hi - min) * i) / (MAPA.length - 1));
  const s = scaleLinear<string>().domain(stops).range(MAPA).clamp(true);
  return (v: number | null | undefined): string => (v === null || v === undefined ? "var(--color-mapa-vazio)" : s(v));
}

function rgb(c: string): [number, number, number] {
  const h = c.replace("#", "");
  if (h.length === 6) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  const m = c.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
  return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0];
}

/** Texto legível (WCAG) sobre uma cor de fundo hex/rgb. */
export function contrastText(bg: string): "#0b1220" | "#ffffff" {
  const [r, g, b] = rgb(bg).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.4 ? "#0b1220" : "#ffffff";
}

/** Paleta categórica institucional (verde, azul, amarelo...) para gráficos. */
export const PALETA = ["#009c3b", "#002776", "#e0b800", "#2f80ed", "#0f766e", "#c2410c", "#7c3aed", "#db2777", "#64748b"];
export const corCategoria = (i: number) => PALETA[i % PALETA.length]!;
