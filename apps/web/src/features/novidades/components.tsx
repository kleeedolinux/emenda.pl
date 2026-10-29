import clsx from "clsx";
import { motion, useReducedMotion } from "motion/react";
import {
  Banknote, CalendarClock, Copy, FilePlus, Landmark, MapPin, Receipt, Repeat2, ScrollText, User, Vote, Zap, type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { ALTA_RELEVANCIA, TIPOS_NOVIDADE, novidadesPath, type Novidade, type NovidadeEntidade, type NovidadesRecentes, type TipoNovidade } from "@emenda/contracts";
import { PartyBadge, Skeleton, toast, useApi } from "@/ui";
import { ShareButton } from "@/features/share";
import { leigo, ROTULO_NOVIDADE, corpo, dataCompleta, formatarNumero, linkInterno, shareDe, tempoRelativo, textoParaCopiar } from "./novidades";

/** Ícone e cor por tipo (cores da marca). */
export const META_TIPO: Record<TipoNovidade, { icon: LucideIcon; cls: string }> = {
  votacao: { icon: Vote, cls: "bg-azul/10 text-azul dark:bg-azul-400/20 dark:text-[#a9c3ff]" },
  lei: { icon: ScrollText, cls: "bg-verde/10 text-verde-700 dark:text-verde" },
  urgencia: { icon: Zap, cls: "bg-amarelo/25 text-amarelo-700 dark:bg-amarelo/15 dark:text-amarelo" },
  proposicao: { icon: FilePlus, cls: "bg-azul/10 text-azul dark:bg-azul-400/20 dark:text-[#a9c3ff]" },
  agenda: { icon: CalendarClock, cls: "bg-surface-2 text-fg" },
  pagamentos: { icon: Banknote, cls: "bg-verde/10 text-verde-700 dark:text-verde" },
  pix: { icon: Zap, cls: "bg-amarelo/25 text-amarelo-700 dark:bg-amarelo/15 dark:text-amarelo" },
  gastos: { icon: Receipt, cls: "bg-vermelho/10 text-vermelho dark:text-[#ff8a80]" },
  partido: { icon: Repeat2, cls: "bg-surface-2 text-fg" },
};

const ICONE_ENTIDADE: Record<string, LucideIcon> = {
  deputado: User, senador: User, autor: User, municipio: MapPin, uf: MapPin,
  proposicao: FilePlus, votacao: Vote, materia: Landmark, lei: ScrollText,
};

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\d*\./, ""); } catch { return u; } };

export function TipoIcone({ tipo, size = "md" }: { tipo: TipoNovidade; size?: "sm" | "md" }) {
  const { icon: I, cls } = META_TIPO[tipo];
  return (
    <span className={clsx("inline-flex shrink-0 items-center justify-center rounded-full", cls, size === "md" ? "size-8 sm:size-10" : "size-7")} aria-hidden>
      <I className={size === "md" ? "size-4 sm:size-5" : "size-4"} />
    </span>
  );
}

export function EntidadeChip({ e }: { e: NovidadeEntidade }) {
  if (e.tipo === "partido") return <PartyBadge sigla={e.nome} />;
  const I = ICONE_ENTIDADE[e.tipo] ?? User;
  const cls = "press inline-flex max-w-full items-center gap-1 truncate rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg ring-1 ring-inset ring-line transition hover:ring-verde/60";
  const body = <><I className="size-3.5 shrink-0 text-muted" aria-hidden /><span className="truncate">{e.nome}</span></>;
  return linkInterno(e.url)
    ? <Link to={e.url} className={cls}>{body}</Link>
    : <a href={e.url} target="_blank" rel="noopener noreferrer" className={cls}>{body}<span className="sr-only"> (abre site oficial)</span></a>;
}

async function copiar(n: Novidade) {
  const t = textoParaCopiar(n, location.origin);
  try {
    await navigator.clipboard.writeText(t);
    toast("Texto copiado");
  } catch {
    toast("Não foi possível copiar");
  }
}

export function NovidadeCard({ n, agora, novo, destaque, i = 0 }: { n: Novidade; agora: number; novo?: boolean; destaque?: boolean; i?: number }) {
  const reduce = useReducedMotion();
  const texto = leigo(corpo(n));
  return (
    <motion.article
      id={n.id}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.03 }}
      className={clsx("card flex scroll-mt-40 gap-3 p-4 sm:p-5", destaque && "ring-2 ring-verde")}
      aria-labelledby={`${n.id}-t`}
    >
      <TipoIcone tipo={n.tipo} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span className="font-semibold text-fg/80">{ROTULO_NOVIDADE[n.tipo]}</span>
          <span aria-hidden>·</span>
          <time dateTime={n.data} title={dataCompleta(n.data)}>{tempoRelativo(n.data, agora)}</time>
          {novo && <span className="inline-flex items-center gap-1 font-semibold text-verde-700 dark:text-verde"><span className="size-1.5 rounded-full bg-verde" aria-hidden />novo</span>}
          {n.relevancia >= ALTA_RELEVANCIA && <span className="rounded-full bg-amarelo/25 px-1.5 font-semibold text-amarelo-700 dark:bg-amarelo/15 dark:text-amarelo" title={`Relevância ${n.relevancia}/100 (regra pública)`}>alta relevância</span>}
        </div>
        <h3 id={`${n.id}-t`} className="mt-1 text-[15px] font-bold leading-snug text-fg text-balance">{leigo(n.titulo)}</h3>
        {texto && <p className="mt-1 text-sm leading-relaxed text-fg/85 [overflow-wrap:anywhere]">{texto}</p>}

        {!!n.numeros?.length && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Números">
            {n.numeros.map((x) => (
              <li key={x.rotulo} className="inline-flex items-baseline gap-1 rounded-lg bg-surface-2 px-2 py-0.5 text-xs">
                <span className="font-bold tabular text-fg">{formatarNumero(x)}</span>
                <span className="text-muted">{x.rotulo}</span>
              </li>
            ))}
          </ul>
        )}

        {!!n.entidades.length && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Relacionados">
            {n.entidades.map((e) => <li key={`${e.tipo}-${e.id}`} className="min-w-0 max-w-full">{<EntidadeChip e={e} />}</li>)}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
          <p className="min-w-0 truncate text-xs text-muted">
            Fonte:{" "}
            {n.fonte.slice(0, 2).map((f, k) => (
              <span key={f}>{k > 0 && ", "}<a className="link" href={f} target="_blank" rel="noopener noreferrer">{host(f)}</a></span>
            ))}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button" onClick={() => void copiar(n)}
              className="press inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-fg"
            >
              <Copy className="size-3.5" aria-hidden />Copiar texto
            </button>
            <ShareButton compact {...shareDe(n)} />
          </div>
        </div>
      </div>
    </motion.article>
  );
}

export function NovidadeSkeleton() {
  return (
    <div className="card flex gap-3 p-5" aria-hidden>
      <Skeleton className="size-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

export function FiltroTipos({ ativos, onToggle, onLimpar, contagem }: {
  ativos: Set<TipoNovidade>; onToggle: (t: TipoNovidade) => void; onLimpar: () => void; contagem: Partial<Record<TipoNovidade, number>>;
}) {
  const tipos = (Object.keys(TIPOS_NOVIDADE) as TipoNovidade[]).filter((t) => contagem[t]);
  const chip = (on: boolean) => clsx(
    "press inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition",
    on ? "bg-fg text-bg ring-fg" : "bg-surface text-fg ring-line hover:ring-verde/60",
  );
  return (
    <div role="group" aria-label="Filtrar por tipo" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
      <button type="button" aria-pressed={ativos.size === 0} onClick={onLimpar} className={chip(ativos.size === 0)}>Tudo</button>
      {tipos.map((t) => {
        const I = META_TIPO[t].icon;
        return (
          <button key={t} type="button" aria-pressed={ativos.has(t)} onClick={() => onToggle(t)} className={chip(ativos.has(t))}>
            <I className="size-3.5" aria-hidden />{ROTULO_NOVIDADE[t]}
            <span className="tabular opacity-60">{contagem[t]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Faixa compacta para a Home: últimas novidades (prioriza alta relevância quando `alta`). */
export function NovidadesStrip({ limit = 5, alta = false, className }: { limit?: number; alta?: boolean; className?: string }) {
  const q = useApi<NovidadesRecentes>(novidadesPath.recentes());
  const agora = Date.now();
  const itens = (q.data?.itens ?? []).filter((n) => !alta || n.relevancia >= ALTA_RELEVANCIA).slice(0, limit);
  if (q.isError || (q.data && !itens.length)) return null;
  return (
    <section className={clsx("card p-4 sm:p-5", className)} aria-labelledby="novidades-strip-t">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="novidades-strip-t" className="font-display text-lg font-bold">Novidades</h2>
        <Link to="/novidades" className="link text-sm font-semibold">Ver todas</Link>
      </div>
      <ul className="divide-y divide-line">
        {q.isPending
          ? Array.from({ length: limit }, (_, k) => <li key={k} className="py-2.5"><Skeleton className="h-4 w-full" /></li>)
          : itens.map((n) => (
            <li key={n.id}>
              <Link to={`/novidades#${n.id}`} className="group flex items-start gap-2.5 py-2.5">
                <TipoIcone tipo={n.tipo} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-snug text-fg group-hover:underline">{leigo(n.titulo)}</span>
                  <span className="text-xs text-muted">{ROTULO_NOVIDADE[n.tipo]} · <time dateTime={n.data}>{tempoRelativo(n.data, agora)}</time></span>
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </section>
  );
}
