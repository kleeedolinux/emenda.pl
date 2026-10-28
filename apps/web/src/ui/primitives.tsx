import clsx from "clsx";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowUpRight, ChevronRight, Inbox, Loader2, RotateCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { partyColor, contrastText } from "@/lib/colors";
import { Tip } from "./Tip";
import { termo } from "./glossario";
import { fadeUp, inSharedTransition, liftable, sharedTitleProps, TransitionLink, duration, easing, spring } from "./motion";

/** `tip` aceita chave do glossário ("empenhado") ou conteúdo livre. */
export type TipProp = ReactNode;
const resolveTip = (t: TipProp) => (typeof t === "string" ? (termo(t) ?? t) : t);
export function MaybeTip({ tip }: { tip?: TipProp }) {
  return tip ? <Tip content={resolveTip(tip)} /> : null;
}

// ---------- Layout ----------
export interface Crumb { label: string; to?: string }

export function PageHeader({
  eyebrow, title, subtitle, actions, breadcrumbs, media,
}: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; breadcrumbs?: Crumb[]; media?: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <header className="relative mb-8">
      {breadcrumbs?.length ? (
        <nav aria-label="Trilha de navegação" className="mb-4 text-sm text-muted">
          <ol className="flex flex-wrap items-center gap-1">
            {breadcrumbs.map((c, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5 opacity-60" aria-hidden />}
                {c.to ? <Link className="hover:text-fg hover:underline" to={c.to}>{c.label}</Link> : <span aria-current="page" className="text-fg">{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <motion.div
        initial={reduce || inSharedTransition() ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.slow, ease: easing.expo }}
        className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-4">
          {media}
          <div className="min-w-0">
            {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>}
            <h1 {...sharedTitleProps} className="w-fit text-3xl font-bold leading-tight text-balance sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-2 max-w-3xl text-base text-muted text-pretty">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </motion.div>
    </header>
  );
}

export function Card({
  title, tip, actions, children, className,
}: { title?: ReactNode; tip?: TipProp; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <motion.section variants={fadeUp} className={clsx("card relative min-w-0 p-5", className)}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          {title && (
            <h2 className="flex items-center gap-1.5 text-base font-semibold">
              {title}
              <MaybeTip tip={tip} />
            </h2>
          )}
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </motion.section>
  );
}

export function Section({ title, tip, children, id }: { title: ReactNode; tip?: TipProp; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-12 scroll-mt-24 first:mt-0">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold sm:text-2xl">
        <span className="h-5 w-1 rounded-full bandeira" aria-hidden />
        {title}
        <MaybeTip tip={tip} />
      </h2>
      {children}
    </section>
  );
}

// ---------- Números ----------
export function Stat({ label, value, hint, tip }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tip?: TipProp }) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -3 }}
      transition={spring.lift}
      className="card group relative overflow-hidden p-4 transition-shadow hover:shadow-[0_0_0_1px_var(--color-accent),0_10px_40px_-10px_var(--color-glow)] sm:p-5"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-verde/10 blur-2xl transition group-hover:bg-verde/20" aria-hidden />
      <dt className="flex items-center gap-1 text-[13px] font-medium text-muted">
        {label}
        <MaybeTip tip={tip} />
      </dt>
      <dd className="mt-1.5 font-display text-2xl font-bold tabular leading-none tracking-tight sm:text-[1.75rem]">{value}</dd>
      {hint && <dd className="mt-1.5 text-xs text-muted">{hint}</dd>}
    </motion.div>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.dl
      initial={reduce ? false : "hidden"}
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className={clsx("grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4", className)}
    >
      {children}
    </motion.dl>
  );
}

// ---------- Badges ----------
const TONES = {
  verde: "bg-verde/12 text-verde-700 ring-verde/30 dark:text-[#5fe39a]",
  amarelo: "bg-amarelo/25 text-amarelo-700 ring-amarelo/50 dark:bg-amarelo/15 dark:text-amarelo",
  azul: "bg-azul/10 text-azul ring-azul/25 dark:bg-azul-400/20 dark:text-[#a9c3ff]",
  vermelho: "bg-vermelho/10 text-vermelho ring-vermelho/30 dark:text-[#ff8a80]",
  neutro: "bg-surface-2 text-muted ring-line",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutro", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function PartyBadge({ sigla, link = true }: { sigla: string; link?: boolean }) {
  const bg = partyColor(sigla);
  const el = (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold tracking-wide"
      style={{ background: bg, color: contrastText(bg.startsWith("#") ? bg : "#333") }}
      title={`Partido: ${sigla}`}
    >
      {sigla || "S/PART"}
    </span>
  );
  return link && sigla ? <Link to={`/partido/${encodeURIComponent(sigla)}`} className="rounded-md">{el}</Link> : el;
}

const VOTO_TONE: Record<string, Tone> = { sim: "verde", "não": "vermelho", nao: "vermelho", "abstenção": "amarelo", abstencao: "amarelo", obstrução: "azul", obstrucao: "azul", "art. 17": "neutro" };
export function VoteBadge({ voto }: { voto: string }) {
  const k = voto.trim().toLowerCase();
  return <Badge tone={VOTO_TONE[k] ?? "neutro"}>{voto || "—"}</Badge>;
}

// ---------- Avatar ----------
const SIZES = { sm: "size-8 text-xs", md: "size-12 text-sm", lg: "size-20 text-xl", xl: "size-28 text-3xl" } as const;
export function Avatar({ src, name, size = "md" }: { src?: string | null; name: string; size?: keyof typeof SIZES }) {
  const [err, setErr] = useState(false);
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <span className={clsx("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-verde to-azul font-bold text-white ring-2 ring-surface", SIZES[size])}>
      {src && !err ? (
        <img src={src} alt={name} loading="lazy" decoding="async" onError={() => setErr(true)} className="size-full object-cover" />
      ) : (
        <span aria-label={name}>{ini}</span>
      )}
    </span>
  );
}

// ---------- Estados ----------
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={clsx("relative overflow-hidden rounded-lg bg-surface-2", className ?? "h-4 w-full")}>
      <div className="skeleton-sheen absolute inset-0" />
    </div>
  );
}

export function Spinner({ label = "Carregando…" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error ?? "Erro desconhecido");
  return (
    <div role="alert" className="card flex flex-col items-start gap-3 border-vermelho/30 p-5">
      <div className="flex items-center gap-2 font-semibold text-vermelho"><AlertTriangle className="size-5" aria-hidden />Não foi possível carregar</div>
      <p className="text-sm text-muted">{msg}</p>
      {retry && (
        <button type="button" onClick={retry} className="press inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
          <RotateCw className="size-4" aria-hidden />Tentar de novo
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <Inbox className="size-8 text-muted" aria-hidden />
      <p className="font-semibold">{title}</p>
      {hint && <p className="max-w-md text-sm text-muted">{hint}</p>}
    </div>
  );
}

// ---------- Conteúdo ----------
export function KeyValue({ items }: { items: Array<[ReactNode, ReactNode, TipProp?]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
      {items.map(([k, v, tip], i) => (
        <div key={i} className="contents">
          <dt className="flex items-center gap-1 text-sm text-muted">{k}<MaybeTip tip={tip} /></dt>
          <dd className="-mt-2 text-sm font-medium break-words sm:mt-0">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={clsx("link inline-flex items-center gap-0.5", className)}>
      {children}
      <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only"> (abre em nova aba)</span>
    </a>
  );
}

export function Timeline({ items }: { items: Array<{ date: ReactNode; title: ReactNode; desc?: ReactNode; href?: string }> }) {
  const reduce = useReducedMotion();
  return (
    <ol className="relative ml-2 border-l-2 border-line">
      {items.map((it, i) => (
        <motion.li
          key={i}
          initial={reduce ? false : { opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: Math.min(i, 10) * 0.03 }}
          className="relative mb-5 pl-5 last:mb-0"
        >
          <span className="absolute -left-[7px] top-1.5 size-3 rounded-full border-2 border-surface bg-verde" aria-hidden />
          <p className="text-xs font-medium text-muted tabular">{it.date}</p>
          <p className="font-semibold">
            {it.href ? (it.href.startsWith("http") ? <ExternalLink href={it.href}>{it.title}</ExternalLink> : <Link className="link" to={it.href}>{it.title}</Link>) : it.title}
          </p>
          {it.desc && <p className="mt-0.5 text-sm text-muted">{it.desc}</p>}
        </motion.li>
      ))}
    </ol>
  );
}

/** Botão/link secundário consistente. */
export function ButtonLink({ to, children, primary }: { to: string; children: ReactNode; primary?: boolean }) {
  const cls = clsx(
    "press inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition",
    primary ? "sheen bg-verde-700 text-white shadow-[0_8px_24px_-8px_rgb(0_156_59/0.6)] hover:bg-[#005c23]" : "border border-line bg-surface hover:bg-surface-2",
  );
  return to.startsWith("http") ? <a className={cls} href={to} target="_blank" rel="noopener noreferrer">{children}</a> : <Link className={cls} to={to}>{children}</Link>;
}

/** Cartões de "próximo passo" para guiar a navegação entre páginas. */
export function NextSteps({ title = "Próximos passos", items }: { title?: ReactNode; items: Array<{ to: string; label: ReactNode; desc?: ReactNode; icon?: ReactNode }> }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Próximos passos" className="mt-12">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted">{title}</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it, i) => {
          const body = (
            <>
              {it.icon && <span className="text-accent">{it.icon}</span>}
              <span className="min-w-0 flex-1">
                <span data-shared-source className="block w-fit font-semibold">{it.label}</span>
                {it.desc && <span className="mt-0.5 block text-sm text-muted">{it.desc}</span>}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-accent" aria-hidden />
            </>
          );
          const cls = "card press group flex h-full items-center gap-3 p-4 transition-colors hover:border-accent";
          return (
            <motion.li key={i} {...liftable}>
              {it.to.startsWith("http") ? <a className={cls} href={it.to} target="_blank" rel="noopener noreferrer">{body}</a> : <TransitionLink className={cls} to={it.to}>{body}</TransitionLink>}
            </motion.li>
          );
        })}
      </ul>
    </nav>
  );
}
