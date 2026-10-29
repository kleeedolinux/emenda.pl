// Listas curtas por padrão: mostra os N primeiros e cresce com "ver mais".
import clsx from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useInRouterContext, useLocation } from "react-router";

export function ListaVerMais<T>({ itens, inicial = 5, passo = 10, render, chave, className, vazio }: {
  itens: readonly T[];
  inicial?: number;
  passo?: number;
  render: (x: T, i: number) => ReactNode;
  chave: (x: T, i: number) => string | number;
  className?: string;
  vazio?: ReactNode;
}) {
  const [n, setN] = useState(inicial);
  if (!itens.length) return <>{vazio ?? null}</>;
  const resto = itens.length - n;
  return (
    <div>
      <ul className={className}>{itens.slice(0, n).map((x, i) => <li key={chave(x, i)}>{render(x, i)}</li>)}</ul>
      <BotaoVerMais resto={resto} passo={passo} onMais={() => setN((v) => v + passo)} onMenos={n > inicial ? () => setN(inicial) : undefined} />
    </div>
  );
}

export function BotaoVerMais({ resto, passo, onMais, onMenos, className }: { resto: number; passo: number; onMais: () => void; onMenos?: () => void; className?: string }) {
  if (resto <= 0 && !onMenos) return null;
  return (
    <div className={clsx("mt-3 flex flex-wrap gap-2", className)}>
      {resto > 0 && (
        <button type="button" onClick={onMais} className="press inline-flex items-center gap-1 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-semibold hover:border-accent">
          <ChevronDown className="size-4" aria-hidden />Ver mais {Math.min(passo, resto)}{resto > passo ? ` de ${resto.toLocaleString("pt-BR")}` : ""}
        </button>
      )}
      {resto <= 0 && onMenos && (
        <button type="button" onClick={onMenos} className="press inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-muted hover:text-fg">
          <ChevronUp className="size-4" aria-hidden />Mostrar menos
        </button>
      )}
    </div>
  );
}

/** Bloco recolhido: "Ver tudo (tabelas completas)". Conteúdo só monta ao abrir. */
export function ModoDetalhado({ titulo = "Ver tudo: tabelas completas", children, id }: { titulo?: ReactNode; children: ReactNode; id?: string }) {
  // Links com ?tab= (abas dentro do bloco) ou #âncora abrem já expandido.
  const pede = (search: string, hash: string) => new URLSearchParams(search).has("tab") || (!!id && hash === `#${id}`);
  const [aberto, setAberto] = useState(() => typeof location !== "undefined" && pede(location.search, location.hash));
  const ref = useRef<HTMLElement>(null);
  // Link dentro da própria página (ex.: "Ver mais" do painel de um gráfico): abre e rola até aqui.
  const loc = useInRouterContext() ? useLocation() : null; // eslint-disable-line react-hooks/rules-of-hooks
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    if (loc && pede(loc.search, loc.hash)) { setAberto(true); requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }
  }, [loc?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section ref={ref} id={id} className="mt-10 scroll-mt-24 rounded-2xl border border-line">
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left font-semibold hover:bg-surface-2">
        <span>{titulo}</span>
        <ChevronDown className={clsx("size-5 shrink-0 text-muted transition", aberto && "rotate-180")} aria-hidden />
      </button>
      {aberto && <div className="border-t border-line p-4">{children}</div>}
    </section>
  );
}
