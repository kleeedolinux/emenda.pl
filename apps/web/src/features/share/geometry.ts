// Geometria pura dos gráficos desenhados em canvas.

export interface SeatPos { x: number; y: number; a: number }

/** Cadeiras de um hemiciclo em coordenadas unitárias (centro 0,0; raio ≤ 1; y ≤ 0), da esquerda para a direita. */
export function hemiSeats(n: number): SeatPos[] {
  if (n <= 0) return [];
  const rows = Math.max(1, Math.min(12, Math.round(Math.sqrt(n / 4))));
  const radii = Array.from({ length: rows }, (_, i) => (rows === 1 ? 1 : 0.42 + (0.58 * i) / (rows - 1)));
  const sumR = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.floor((n * r) / sumR));
  let rest = n - counts.reduce((a, b) => a + b, 0);
  for (let i = rows - 1; rest > 0; i = (i - 1 + rows) % rows, rest--) counts[i]!++;
  const seats: SeatPos[] = [];
  radii.forEach((r, i) => {
    const k = counts[i]!;
    for (let j = 0; j < k; j++) {
      const a = k === 1 ? Math.PI / 2 : Math.PI - (Math.PI * j) / (k - 1);
      seats.push({ x: r * Math.cos(a), y: -r * Math.sin(a), a });
    }
  });
  return seats.sort((p, q) => q.a - p.a);
}

export type VoteSide = "sim" | "outros" | "nao";
export function voteColors(v: { sim: number; nao: number; outros: number }): VoteSide[] {
  return [...Array<VoteSide>(v.sim).fill("sim"), ...Array<VoteSide>(v.outros).fill("outros"), ...Array<VoteSide>(v.nao).fill("nao")];
}

export function barLayout(bars: Array<{ label: string; value: number }>, max = 5): Array<{ label: string; value: number; ratio: number }> {
  const top = bars.slice(0, max);
  const hi = Math.max(0, ...top.map((b) => b.value));
  return top.map((b) => ({ ...b, ratio: hi > 0 ? Math.max(0, b.value) / hi : 0 }));
}
