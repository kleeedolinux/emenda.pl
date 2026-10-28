// Diagrama de passos em SVG inline: nós numerados ligados por setas que se desenham ao entrar na tela.
import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import type { Passo } from "./temas";

const W = 200, H = 150, R = 26;

export function DiagramaPassos({ passos, cor = "var(--color-verde, #009c3b)" }: { passos: Passo[]; cor?: string }) {
  const reduce = useReducedMotion();
  const id = useId().replace(/:/g, "");
  const n = passos.length;
  const largura = n * W;
  const cy = 52;
  const anim = (delay: number) => (reduce ? {} : { initial: "hidden", whileInView: "show", viewport: { once: true, margin: "-40px" }, transition: { delay } });
  return (
    <svg viewBox={`0 0 ${largura} ${H}`} className="h-auto w-full" role="img" aria-label={passos.map((p, i) => `${i + 1}. ${p.titulo}`).join(" → ")}>
      <defs>
        <marker id={`seta-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={cor} />
        </marker>
      </defs>
      {passos.slice(0, -1).map((_, i) => {
        const x1 = i * W + W / 2 + R + 6, x2 = (i + 1) * W + W / 2 - R - 8;
        return (
          <motion.path key={`l${i}`} d={`M${x1} ${cy} L${x2} ${cy}`} stroke={cor} strokeWidth={3} fill="none" strokeLinecap="round" markerEnd={`url(#seta-${id})`}
            variants={{ hidden: { pathLength: 0, opacity: 0 }, show: { pathLength: 1, opacity: 1, transition: { duration: 0.5, delay: 0.25 + i * 0.35 } } }}
            {...anim(0)} />
        );
      })}
      {passos.map((p, i) => {
        const cx = i * W + W / 2;
        return (
          <motion.g key={p.titulo}
            variants={{ hidden: { opacity: 0, scale: 0.6 }, show: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4, duration: 0.6, delay: i * 0.35 } } }}
            style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: "view-box" }}
            {...anim(0)}>
            <circle cx={cx} cy={cy} r={R} fill={cor} opacity={0.14} />
            <circle cx={cx} cy={cy} r={R - 6} fill={cor} />
            <text x={cx} y={cy + 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="#fff">{i + 1}</text>
            <text x={cx} y={cy + R + 26} textAnchor="middle" fontSize="15" fontWeight="600" className="fill-current">{p.titulo}</text>
          </motion.g>
        );
      })}
    </svg>
  );
}

/** Barra empilhada animada: partes de um todo (ex.: pago / restos pagos / cancelado / em aberto). */
export function BarraPartes({ partes, format }: { partes: Array<{ label: string; valor: number; cor: string }>; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const total = partes.reduce((s, p) => s + Math.max(0, p.valor), 0) || 1;
  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={partes.map((p) => `${p.label}: ${format(p.valor)}`).join("; ")}>
        {partes.map((p, i) => (
          <motion.div key={p.label} style={{ background: p.cor, transformOrigin: "left" }} className="h-full"
            initial={reduce ? false : { width: 0 }} whileInView={{ width: `${(Math.max(0, p.valor) / total) * 100}%` }} viewport={{ once: true }}
            transition={{ duration: 0.8, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {partes.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: p.cor }} aria-hidden />
            {p.label}: <b className="tabular">{format(p.valor)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
