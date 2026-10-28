import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/format";
import { spring } from "../motion/tokens";

export interface Seat { key: string; color: string; label: string; group: string }

/** Posições de assentos em semicírculo (fileiras proporcionais ao raio). Pura. */
export function hemicycleLayout(n: number, r0 = 0.38, r1 = 1) {
  if (n <= 0) return [] as { x: number; y: number; a: number }[];
  const rows = Math.max(1, Math.round(Math.sqrt(n / 4)));
  const radii = Array.from({ length: rows }, (_, i) => (rows === 1 ? r1 : r0 + ((r1 - r0) * i) / (rows - 1)));
  const sum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.floor((n * r) / sum));
  for (let left = n - counts.reduce((a, b) => a + b, 0), i = rows - 1; left > 0; left--, i = (i - 1 + rows) % rows) counts[i]!++;
  const pts: { x: number; y: number; a: number }[] = [];
  radii.forEach((r, ri) => {
    const c = counts[ri]!;
    for (let j = 0; j < c; j++) {
      const a = Math.PI - (c === 1 ? Math.PI / 2 : (Math.PI * j) / (c - 1));
      pts.push({ x: r * Math.cos(a), y: -r * Math.sin(a), a });
    }
  });
  return pts.sort((p, q) => q.a - p.a);
}

/** Hemiciclo animado. Assentos são ordenados pelo grupo (ordem de chegada). */
export function Hemicycle({ seats }: { seats: Seat[] }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const pos = useMemo(() => hemicycleLayout(seats.length), [seats.length]);
  const groups = useMemo(() => {
    const m = new Map<string, { group: string; color: string; n: number }>();
    for (const s of seats) { const g = m.get(s.group); if (g) g.n++; else m.set(s.group, { group: s.group, color: s.color, n: 1 }); }
    return [...m.values()];
  }, [seats]);
  const r = Math.min(0.045, 1.6 / Math.sqrt(Math.max(seats.length, 1)) / 4);
  const cur = hover ? seats.find((s) => s.key === hover) : null;
  return (
    <figure>
      <svg viewBox="-1.08 -1.08 2.16 1.16" className="w-full" role="img" aria-label={groups.map((g) => `${g.group}: ${g.n}`).join("; ")}>
        {seats.map((s, i) => {
          const p = pos[i];
          if (!p) return null;
          return (
            <motion.circle
              key={s.key}
              cx={p.x} cy={p.y} r={r}
              fill={s.color}
              stroke={hover === s.key ? "var(--color-fg)" : "none"}
              strokeWidth={0.008}
              fillOpacity={hover && cur?.group !== s.group ? 0.35 : 1}
              style={{ transformBox: "fill-box", transformOrigin: "center", transition: "fill-opacity .2s" }}
              initial={reduce ? false : { opacity: 0, y: -0.35, scale: 0.4 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ ...spring.bouncy, delay: reduce ? 0 : Math.min(i * 0.0028, 1.3), opacity: { duration: 0.15, delay: reduce ? 0 : Math.min(i * 0.0028, 1.3) } }}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{s.label}</title>
            </motion.circle>
          );
        })}
        <text x={0} y={-0.12} textAnchor="middle" className="fill-fg font-display" fontSize={0.16} fontWeight={700}>{cur ? cur.group : formatNumber(seats.length)}</text>
        <text x={0} y={-0.02} textAnchor="middle" className="fill-muted" fontSize={0.065}>{cur ? cur.label.slice(0, 34) : "assentos"}</text>
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs">
        {groups.map((g) => (
          <span key={g.group} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: g.color }} aria-hidden />
            {g.group} <b className="tabular">{g.n}</b>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
