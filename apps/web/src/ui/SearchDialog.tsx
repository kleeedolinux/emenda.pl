import * as D from "@radix-ui/react-dialog";
import { Building2, FileText, Landmark, MapPin, Search, User, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { dataPath, semAcento, UFS, type AutorResumo } from "@emenda/contracts";
import { useApi, useMunicipiosIbge, ufDoMunicipio } from "@/lib/data";
import { formatBRL } from "@/lib/format";

interface Hit { id: string; to: string; label: string; sub?: string; icon: ReactNode; group: string }
const norm = (s: string) => semAcento(s).toLowerCase();

export const SEARCH_EVENT = "emenda:search";
/** Abre a busca global de qualquer lugar, opcionalmente com um texto. */
export function openSearch(query = "") {
  window.dispatchEvent(new CustomEvent<string>(SEARCH_EVENT, { detail: query }));
}

/** Busca global (Ctrl/⌘+K) por autores, UFs, municípios, deputados e proposições. */
export function SearchDialog({ open, onOpenChange, initialQuery = "" }: { open: boolean; onOpenChange: (o: boolean) => void; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  useEffect(() => { if (open) setQ(initialQuery); }, [open, initialQuery]);
  const dq = useDeferredValue(q);
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  const listRef = useRef<HTMLUListElement>(null);
  const autores = useApi<AutorResumo[]>(open ? dataPath.autores() : null);
  const munis = useMunicipiosIbge(open);

  const hits = useMemo<Hit[]>(() => {
    const t = norm(dq.trim());
    const out: Hit[] = [];
    if (!t) {
      return [
        { id: "a:emendas", to: "/emendas", label: "Explorar todas as emendas", icon: <FileText className="size-4" />, group: "Atalhos" },
        { id: "a:dinheiro", to: "/dinheiro", label: "Fluxo do dinheiro público", icon: <Landmark className="size-4" />, group: "Atalhos" },
        { id: "a:deputados", to: "/deputados", label: "Deputados federais", icon: <User className="size-4" />, group: "Atalhos" },
        { id: "a:senadores", to: "/senadores", label: "Senadores", icon: <User className="size-4" />, group: "Atalhos" },
      ];
    }
    const terms = t.split(/\s+/);
    const match = (s: string) => { const n = norm(s); return terms.every((x) => n.includes(x)); };
    for (const [sigla, nome] of Object.entries(UFS))
      if (match(`${sigla} ${nome}`)) out.push({ id: `uf:${sigla}`, to: `/uf/${sigla}`, label: nome, sub: sigla, icon: <MapPin className="size-4" />, group: "Estados" });
    let n = 0;
    for (const m of munis.data ?? []) {
      if (n >= 8) break;
      const uf = ufDoMunicipio(m);
      if (match(`${m.nome} ${uf}`)) { n++; out.push({ id: `m:${m.id}`, to: `/municipio/${m.id}`, label: m.nome, sub: uf, icon: <Building2 className="size-4" />, group: "Municípios" }); }
    }
    n = 0;
    for (const a of autores.data ?? []) {
      if (n >= 8) break;
      if (match(a.nome)) { n++; out.push({ id: `au:${a.codigo}`, to: `/autor/${a.codigo}`, label: a.nome, sub: `${formatBRL(a.pago, true)} pagos`, icon: <Landmark className="size-4" />, group: "Autores de emendas" }); }
    }
    const enc = encodeURIComponent(dq.trim());
    out.push(
      { id: "s:dep", to: `/deputados?q=${enc}`, label: `Buscar deputado “${dq.trim()}”`, icon: <User className="size-4" />, group: "Buscar no Legislativo" },
      { id: "s:prop", to: `/proposicoes?q=${enc}`, label: `Buscar proposição “${dq.trim()}”`, icon: <FileText className="size-4" />, group: "Buscar no Legislativo" },
    );
    return out;
  }, [dq, munis.data, autores.data]);

  useEffect(() => setSel(0), [dq]);
  useEffect(() => { if (!open) setQ(""); }, [open]);
  useEffect(() => { listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }); }, [sel]);

  const go = (h?: Hit) => { if (!h) return; onOpenChange(false); nav(h.to); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(hits[sel]); }
  };

  let lastGroup = "";
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm" />
        <D.Content
          className="fixed left-1/2 top-[10vh] z-[95] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
          aria-describedby={undefined}
        >
          <D.Title className="sr-only">Buscar no emenda.pl</D.Title>
          <div className="flex items-center gap-2 border-b border-line px-4">
            <Search className="size-5 text-muted" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder="Cidade, estado, parlamentar, proposição…"
              role="combobox"
              aria-expanded="true"
              aria-controls="busca-lista"
              aria-activedescendant={hits[sel] ? `busca-${sel}` : undefined}
              className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
            />
            <D.Close className="rounded-md p-1 text-muted hover:text-fg" aria-label="Fechar"><X className="size-5" /></D.Close>
          </div>
          <ul id="busca-lista" ref={listRef} role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
            {hits.map((h, i) => {
              const header = h.group !== lastGroup ? ((lastGroup = h.group), <li role="presentation" key={`g-${h.group}`} className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{h.group}</li>) : null;
              return [
                header,
                <li
                  key={h.id}
                  id={`busca-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={sel === i}
                  onMouseMove={() => setSel(i)}
                  onClick={() => go(h)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm ${sel === i ? "bg-verde/10 text-fg" : ""}`}
                >
                  <span className="text-accent">{h.icon}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{h.label}</span>
                  {h.sub && <span className="shrink-0 text-xs text-muted">{h.sub}</span>}
                </li>,
              ];
            })}
            {(munis.isPending || autores.isPending) && dq && <li className="px-3 py-2 text-xs text-muted">Carregando índices…</li>}
          </ul>
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">↑↓ navegar · Enter abrir · Esc fechar</p>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
