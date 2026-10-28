// Faixa com emendas reais recentes (top de algumas bancadas), carregada depois do hero.
import { dataPath, type Autor, type AutorResumo } from "@emenda/contracts";
import { useQueries } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { fetchJson } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { pickBancadas, tickerItems, type TickerItem } from "./ticker";

function useIdle() {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) { const id = w.requestIdleCallback(() => setIdle(true), { timeout: 2500 }); return () => window.cancelIdleCallback?.(id); }
    const t = setTimeout(() => setIdle(true), 1200);
    return () => clearTimeout(t);
  }, []);
  return idle;
}

function Item({ it }: { it: TickerItem }) {
  return (
    <Link to={`/autor/${encodeURIComponent(it.autorCodigo)}`} className="group inline-flex shrink-0 items-baseline gap-2 rounded-lg px-3 py-1 text-[13px] sm:text-sm hover:bg-white/40 dark:hover:bg-white/5">
      <span className="text-xs font-semibold text-muted tabular">{it.ano}</span>
      <span className="font-semibold group-hover:underline">{it.autor}</span>
      <span className="text-muted" aria-hidden>→</span>
      <span>{it.local}</span>
      <span className="text-muted">· {it.funcao}</span>
      <span className="font-display font-bold tabular text-accent">{formatBRL(it.valor, true)}</span>
      {it.medida === "empenhado" && <span className="text-xs text-muted">empenhado</span>}
      <span className="ml-1 text-amarelo-700 dark:text-amarelo" aria-hidden>◆</span>
    </Link>
  );
}

export function Ticker({ autores }: { autores?: AutorResumo[] }) {
  const idle = useIdle();
  const [paused, setPaused] = useState(false);
  const codes = useMemo(() => (autores ? pickBancadas(autores, 3) : []), [autores]);
  const qs = useQueries({ queries: codes.map((c) => ({ queryKey: ["json", dataPath.autor(c)], queryFn: ({ signal }: { signal: AbortSignal }) => fetchJson<Autor>(dataPath.autor(c), signal), enabled: idle })) });
  const loaded = qs.map((q) => q.data).filter((a): a is Autor => !!a);
  const items = useMemo(() => tickerItems(loaded, 4), [loaded.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const dur = `${Math.max(30, items.length * 6)}s`;

  return (
    <div className="ticker relative mx-auto flex h-11 max-w-7xl items-center gap-2 rounded-2xl border border-white/50 bg-white/55 px-2 shadow-[0_10px_30px_-18px_rgb(0_39_118/0.5)] backdrop-blur-md dark:border-white/10 dark:bg-[#0b1512]/60" data-paused={paused ? "" : undefined}>
      <span className="flex shrink-0 items-center gap-1.5 rounded-xl bg-azul px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white dark:bg-amarelo dark:text-azul">
        <span className="relative flex size-1.5" aria-hidden><span className="absolute inline-flex size-full animate-ping rounded-full bg-amarelo opacity-75 dark:bg-verde" /><span className="relative inline-flex size-1.5 rounded-full bg-amarelo dark:bg-verde" /></span>
        <span className="max-sm:sr-only">Emendas</span> {items[0]?.ano ?? ""}
      </span>
      <div className="relative min-w-0 flex-1 overflow-x-auto [mask-image:linear-gradient(90deg,transparent,#000_4%,#000_96%,transparent)] [scrollbar-width:none] motion-safe:overflow-hidden">
        {items.length ? (
          <div className="ticker-track flex w-max motion-reduce:!animate-none" style={{ "--ticker-dur": dur } as React.CSSProperties}>
            <ul className="flex" aria-label="Emendas recentes de maior valor">{items.map((it) => <li key={it.codigo}><Item it={it} /></li>)}</ul>
            <ul className="flex motion-reduce:hidden" aria-hidden>{items.map((it) => <li key={it.codigo}><Item it={it} /></li>)}</ul>
          </div>
        ) : (
          <div className="flex gap-3 px-3" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className="h-3 w-56 rounded-full bg-surface-2/70" />)}</div>
        )}
      </div>
      <button type="button" onClick={() => setPaused((p) => !p)} className="press grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:text-fg motion-reduce:hidden" aria-label={paused ? "Retomar rolagem" : "Pausar rolagem"}>
        {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
      </button>
    </div>
  );
}
