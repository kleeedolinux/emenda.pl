// Ponto de entrada leve do hero: a cena (ilustração + mapa + partículas) vem em chunk separado.
import { lazy, Suspense } from "react";
import type { HeroSceneProps } from "./hero/HeroScene";

/** Seleção determinística de destinos ponderada por valor (sem Math.random: SSR/teste estáveis). */
export function pickTargets(weights: Record<string, number>, n: number): string[] {
  const entries = Object.entries(weights).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return [];
  const total = entries.reduce((a, [, v]) => a + v, 0);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let t = ((i * 0.6180339887) % 1) * total;
    for (const [k, v] of entries) { if ((t -= v) <= 0) { out.push(k); break; } }
  }
  return out;
}

const loadScene = () => import("./hero/HeroScene");
const Scene = lazy(loadScene);
/** Pré-carrega o chunk da cena (chame cedo, ex.: ao montar a Home). */
export const preloadHeroScene = () => void loadScene();

export function HeroBrasil(p: HeroSceneProps) {
  return <Suspense fallback={null}><Scene {...p} /></Suspense>;
}
