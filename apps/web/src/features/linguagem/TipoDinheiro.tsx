// Vocabulário visual único dos tipos de dinheiro: cor + ícone + rótulo leigo (jargão só no Tip).
import type { TipoEmenda } from "@emenda/contracts";
import clsx from "clsx";
import { ArrowRight, CircleDashed, EyeOff, Landmark, Target, Users, X, Zap, type LucideIcon } from "lucide-react";
import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router";
import { formatBRL } from "@/lib/format";
import { Tip } from "@/ui/Tip";
import { fatiasPorTipo, ORDEM_TIPOS, TIPO_DINHEIRO, type Fatia, type TopItem } from "./linguagem";

export const ICONE_TIPO: Record<TipoEmenda, LucideIcon> = {
  individual: Target, bancada: Users, comissao: Landmark, pix: Zap, relator: EyeOff, outra: CircleDashed,
};

function Explicacao({ tipo }: { tipo: TipoEmenda }) {
  const t = TIPO_DINHEIRO[tipo];
  return <><b>{t.rotulo}.</b> {t.explica} <span className="text-muted">Nome técnico: {t.jargao}.</span></>;
}

/** Selo de um tipo: bolinha colorida + ícone + rótulo. `tip` mostra explicação e nome técnico. */
export function TipoChip({ tipo, tip = true, className }: { tipo: TipoEmenda; tip?: boolean; className?: string }) {
  const t = TIPO_DINHEIRO[tipo];
  const Icon = ICONE_TIPO[tipo];
  return (
    <span className={clsx("inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", className)}
      style={{ background: `${t.cor}1a`, color: "var(--color-fg)", boxShadow: `inset 0 0 0 1px ${t.cor}55` }}>
      <span className="grid size-4 shrink-0 place-items-center rounded-full text-white" style={{ background: t.cor }}><Icon className="size-2.5" aria-hidden /></span>
      {t.rotulo}
      {tip && <Tip content={<Explicacao tipo={tipo} />} label={`O que é “${t.rotulo}”?`} />}
    </span>
  );
}

/** Legenda completa (todos os tipos relevantes), uma linha por tipo. */
export function LegendaTipos({ tipos = ["individual", "bancada", "pix", "relator"], className }: { tipos?: TipoEmenda[]; className?: string }) {
  return (
    <ul className={clsx("grid gap-2 sm:grid-cols-2", className)}>
      {tipos.map((k) => {
        const t = TIPO_DINHEIRO[k];
        const Icon = ICONE_TIPO[k];
        return (
          <li key={k} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-white" style={{ background: t.cor }}><Icon className="size-4" aria-hidden /></span>
            <span className="min-w-0 text-sm">
              <b className="block">{t.rotulo}</b>
              <span className="text-muted">{t.explica}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Conteúdo do painel de um tipo: principais nomes e link para ver tudo. */
export interface DetalheTipo { titulo?: string; itens?: TopItem[]; verMais?: string }

/**
 * Barra empilhada única: quanto de cada tipo. Tocar numa fatia (ou na legenda) destaca o tipo e abre um painel
 * com o sentido em palavras simples, valor, % do total e os principais nomes (`detalhe`).
 * `href(tipo)` vira o link "Ver mais" do painel.
 */
export function BarraTipos({ porTipo, href, detalhe, compacta = false }: {
  porTipo: ReadonlyArray<{ tipo: TipoEmenda; pago: number }>;
  href?: (t: TipoEmenda) => string | undefined;
  detalhe?: (t: TipoEmenda) => DetalheTipo | undefined;
  compacta?: boolean;
}) {
  const reduce = useReducedMotion();
  const [sel, setSel] = useState<TipoEmenda | null>(null);
  const painelId = useId();
  const fatias = fatiasPorTipo(porTipo);
  if (!fatias.length) return null;
  const escolher = (t: TipoEmenda) => setSel((s) => (s === t ? null : t));
  const atual = fatias.find((f) => f.tipo === sel);
  return (
    <div>
      <div className={clsx("flex w-full overflow-hidden rounded-full bg-surface-2", compacta ? "h-3" : "h-5")} data-tap-equiv role={compacta ? "img" : "group"}
        aria-label={compacta ? fatias.map((f) => `${TIPO_DINHEIRO[f.tipo].rotulo}: ${Math.round(f.pct * 100)}%`).join("; ") : "Toque numa cor para entender"}>
        {fatias.map((f, i) => {
          const t = TIPO_DINHEIRO[f.tipo];
          const estilo = { width: `${f.pct * 100}%`, background: t.cor, opacity: sel && sel !== f.tipo ? 0.35 : 1 };
          const anim = { initial: reduce ? false : { scaleX: 0 }, animate: { scaleX: 1 }, transition: { duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] as const } };
          return compacta
            ? <motion.span key={f.tipo} className="h-full origin-left first:rounded-l-full last:rounded-r-full" style={estilo} {...anim} />
            : <motion.button key={f.tipo} type="button" aria-pressed={sel === f.tipo} aria-controls={painelId} aria-label={`${t.rotulo}: ${Math.round(f.pct * 100)}%`}
                onClick={() => escolher(f.tipo)} className="h-full origin-left cursor-pointer transition-opacity first:rounded-l-full last:rounded-r-full focus-visible:outline-2 focus-visible:outline-offset-2" style={estilo} {...anim} />;
        })}
      </div>
      {!compacta && (
        <ul className="mt-3 grid gap-1">
          {fatias.map((f) => (
            <li key={f.tipo}>
              <button type="button" aria-pressed={sel === f.tipo} aria-controls={painelId} onClick={() => escolher(f.tipo)}
                className={clsx("flex min-h-11 w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-1 py-0.5 text-left transition hover:bg-surface-2", sel === f.tipo && "bg-surface-2 ring-1 ring-inset ring-line", sel && sel !== f.tipo && "opacity-60")}>
                <TipoChip tipo={f.tipo} tip={false} />
                <span className="ml-auto shrink-0 whitespace-nowrap text-sm tabular"><b>{Math.round(f.pct * 100)}%</b> <span className="text-muted">· {formatBRL(f.valor, true)}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div id={painelId} aria-live="polite">
        {atual && <PainelTipo f={atual} d={detalhe?.(atual.tipo)} verMais={detalhe?.(atual.tipo)?.verMais ?? href?.(atual.tipo)} onFechar={() => setSel(null)} />}
      </div>
    </div>
  );
}

function PainelTipo({ f, d, verMais, onFechar }: { f: Fatia; d?: DetalheTipo; verMais?: string; onFechar: () => void }) {
  const t = TIPO_DINHEIRO[f.tipo];
  const Icon = ICONE_TIPO[f.tipo];
  const tituloId = useId();
  const itens = d?.itens ?? [];
  const max = itens[0]?.pago || 1;
  return (
    <section role="region" aria-labelledby={tituloId} className="mt-3 rounded-2xl border bg-surface p-4" style={{ borderColor: `${t.cor}66`, background: `linear-gradient(${t.cor}10, transparent)` }}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full text-white" style={{ background: t.cor }}><Icon className="size-4.5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h4 id={tituloId} className="font-semibold">{t.rotulo}</h4>
          <p className="text-sm">{t.explica} <span className="text-muted">({t.jargao})</span></p>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar explicação" className="-m-2 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:text-fg"><X className="size-4" aria-hidden /></button>
      </div>
      <p className="mt-3 text-sm"><b className="text-lg tabular">{formatBRL(f.valor, true)}</b> <span className="text-muted">· {Math.round(f.pct * 100)}% do total</span></p>
      {itens.length > 0 && (
        <>
          <h5 className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">{d?.titulo ?? "Principais"}</h5>
          <ol className="mt-1.5 grid gap-1">
            {itens.map((x) => {
              const corpo = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{x.nome}</span>
                    <span className="mt-0.5 block h-1.5 rounded-full" style={{ width: `${Math.max(4, (x.pago / max) * 100)}%`, background: t.cor }} />
                  </span>
                  <span className="shrink-0 text-sm tabular">{formatBRL(x.pago, true)}</span>
                </>
              );
              return <li key={x.chave}>{x.href ? <Link to={x.href} className="flex min-h-11 items-center gap-3 rounded-lg px-1 hover:bg-surface-2">{corpo}</Link> : <span className="flex min-h-11 items-center gap-3 px-1">{corpo}</span>}</li>;
            })}
          </ol>
        </>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4">
        {f.tipo === "relator" && <Link to="/orcamento-secreto" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent">A história do orçamento secreto <ArrowRight className="size-4" aria-hidden /></Link>}
        {verMais && <Link to={verMais} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent">Ver mais <ArrowRight className="size-4" aria-hidden /></Link>}
      </div>
    </section>
  );
}

export { ORDEM_TIPOS };
