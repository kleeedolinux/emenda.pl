// Peças visuais do explorador /emendas: cartão de história, sparkline, aviso de recorte, controle segmentado.
import clsx from "clsx";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { ShareButton, type ShareButtonProps } from "@/features/share";
import { duration, easing } from "@/ui";
import { sparkPath, type Dim } from "./historias";

const NOME_DIM: Record<Dim, string> = { tipo: "tipo", ano: "ano", uf: "estado" };

/** Avisa quais filtros ativos este número não consegue separar. */
export function AvisoRecorte({ ignorados, className }: { ignorados: readonly Dim[]; className?: string }) {
  if (!ignorados.length) return null;
  const n = ignorados.map((d) => NOME_DIM[d]);
  const lista = n.length > 1 ? `${n.slice(0, -1).join(", ")} e ${n.at(-1)}` : n[0];
  return <p className={clsx("text-[11px] leading-snug text-muted", className)}>Este dado não separa por {lista}; mostra o total.</p>;
}

export interface StoryProps {
  id: string;
  icon: ReactNode;
  eyebrow: string;
  title: ReactNode;
  /** cor de destaque (bolha e ícone) */
  cor?: string;
  share?: Omit<ShareButtonProps, "compact">;
  footer?: ReactNode;
  ignorados?: readonly Dim[];
  className?: string;
  children: ReactNode;
}

/** Cartão "Descubra": ícone + rótulo, título, número grande, mini-gráfico, rodapé. Entra com subida. */
export function Story({ id, icon, eyebrow, title, cor = "#009c3b", share, footer, ignorados = [], className, children }: StoryProps) {
  const reduce = useReducedMotion();
  return (
    <motion.article
      id={id}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      transition={{ duration: duration.slow, ease: easing.expo }}
      className={clsx("card group relative flex min-w-0 scroll-mt-40 flex-col overflow-hidden p-5 sm:p-6", className)}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full opacity-[0.13] blur-2xl transition-opacity duration-500 group-hover:opacity-25" style={{ background: cor }} aria-hidden />
      <header className="relative flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          <span className="inline-flex size-7 items-center justify-center rounded-lg text-white [&_svg]:size-4" style={{ background: cor }} aria-hidden>{icon}</span>
          {eyebrow}
        </p>
        {share && <ShareButton compact {...share} />}
      </header>
      <h3 className="relative mt-3 text-[15px] font-medium leading-snug text-muted text-pretty">{title}</h3>
      <div className="relative mt-2 flex flex-1 flex-col">{children}</div>
      {(footer || ignorados.length > 0) && (
        <footer className="relative mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-line pt-3 text-sm">
          <AvisoRecorte ignorados={ignorados} className="max-w-[60%]" />
          {footer}
        </footer>
      )}
    </motion.article>
  );
}

/** Número de destaque das histórias. */
export function Grande({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx("font-display text-[2.1rem] font-bold leading-none tracking-tight tabular sm:text-[2.5rem]", className)}>{children}</p>;
}

/** Linha da série (área + traço) que se desenha ao aparecer. */
export function Sparkline({ values, color = "#009c3b", className, label }: { values: readonly number[]; color?: string; className?: string; label?: string }) {
  const reduce = useReducedMotion();
  const W = 120, H = 32;
  const d = sparkPath(values, W, H);
  if (!d) return <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden />;
  const area = `${d}L${W},${H}L0,${H}Z`;
  return (
    <motion.svg
      viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={clsx("overflow-visible", className)}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      initial={reduce ? false : { clipPath: "inset(-4px 100% -4px 0)" }} whileInView={{ clipPath: "inset(-4px 0% -4px 0)" }} viewport={{ once: true }}
      transition={{ duration: duration.slower, ease: easing.expo }}
    >
      <path d={area} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </motion.svg>
  );
}

/** Barras verticais mínimas (série por ano), com destaque opcional. */
export function MiniColunas({ data, destaque, color = "#009c3b", format }: { data: ReadonlyArray<{ x: number; y: number }>; destaque?: number; color?: string; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...data.map((d) => d.y));
  return (
    <div className="flex h-16 items-end gap-[3px]" role="img" aria-label={data.map((d) => `${d.x}: ${format(d.y)}`).join("; ")}>
      {data.map((d, i) => (
        <motion.span
          key={d.x}
          title={`${d.x}: ${format(d.y)}`}
          className="block flex-1 origin-bottom rounded-t-[3px]"
          style={{ height: `${Math.max(3, (d.y / max) * 100)}%`, background: color, opacity: destaque && destaque !== d.x ? 0.3 : 0.9 }}
          initial={reduce ? false : { scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }}
          transition={{ duration: duration.slow, ease: easing.expo, delay: i * 0.03 }}
        />
      ))}
    </div>
  );
}

/** Controle segmentado acessível (radiogroup). */
export function Segmento<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: ReadonlyArray<{ value: T; label: ReactNode }>; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-surface-2 p-1 text-sm">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={clsx("press rounded-lg px-3 py-1.5 font-semibold transition", value === o.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
