// Busca universal com filtros encadeados: [Tudo|Cidade|Estado|Deputado|Senador|Partido|Lei].
// Escolher um estado no modo "Estado" vira um filtro (chip removível) para os outros modos.
import { UFS, type SiglaUf } from "@emenda/contracts";
import clsx from "clsx";
import { ArrowRight, Clock, FileText, Landmark, MapPin, Search, Users, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { bandeiraUf, logoPartido } from "@/lib/cdn";
import { EmblemaMunicipio } from "@/features/emblemas/EmblemaMunicipio";
import { partyColor } from "@/lib/colors";
import { formatBRL } from "@/lib/format";
import { Avatar, PartyBadge } from "@/ui/primitives";
import { cam, type ProposicaoDetalhe } from "@/features/legislativo/api";
import { statusLeigo } from "@/features/legislativo/normas";
import { useCamara } from "@/lib/data";
import { useIndiceBusca, useValorCidades } from "./indice";
import { agrupar, destacar, detectarLei, filtrosParaUrl, hrefLei, lerRecentes, rankear, salvarRecente, type FiltrosBusca, type ItemBusca, type ModoBusca, type TipoBusca } from "./ranker";

export type { ModoBusca };

export const MODOS: Array<{ id: ModoBusca; rotulo: string; ph: string; tipos?: TipoBusca[] }> = [
  { id: "tudo", rotulo: "Tudo", ph: "Cidade, estado, político, partido ou lei" },
  { id: "cidade", rotulo: "Cidade", ph: "Digite sua cidade. Ex.: Iraquara", tipos: ["cidade"] },
  { id: "estado", rotulo: "Estado", ph: "Digite o estado. Ex.: Minas", tipos: ["estado"] },
  { id: "deputado", rotulo: "Deputado", ph: "Nome do deputado. Ex.: Tabata", tipos: ["deputado"] },
  { id: "senador", rotulo: "Senador", ph: "Nome do senador. Ex.: Otto", tipos: ["senador"] },
  { id: "prefeito", rotulo: "Prefeito", ph: "Nome do prefeito ou da cidade", tipos: ["prefeito"] },
  { id: "partido", rotulo: "Partido", ph: "Sigla ou nome. Ex.: PT, PL", tipos: ["partido"] },
  { id: "lei", rotulo: "Lei", ph: "Número ou apelido. Ex.: 2630, fake news", tipos: ["lei"] },
  { id: "comissao", rotulo: "Comissão", ph: "Nome da comissão. Ex.: Saúde, Turismo", tipos: ["comissao"] },
  { id: "bancada", rotulo: "Bancada", ph: "Estado ou apelido. Ex.: Bahia, ruralista", tipos: ["bancada"] },
];

const TODOS: TipoBusca[] = ["cidade", "estado", "deputado", "senador", "prefeito", "partido", "autor", "comissao", "bancada", "lei"];
const storage = () => { try { return window.localStorage; } catch { return null; } };
const ROTULO_TIPO: Record<TipoBusca, string> = { cidade: "Cidade", estado: "Estado", deputado: "Deputado(a)", senador: "Senador(a)", partido: "Partido", lei: "Lei", autor: "Quem mandou", prefeito: "Prefeito(a)", comissao: "Comissão", bancada: "Bancada" };

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function Imagem({ it }: { it: ItemBusca }) {
  const [erro, setErro] = useState(false);
  if (it.tipo === "deputado" || it.tipo === "senador" || it.tipo === "prefeito") return <Avatar src={it.img} name={it.titulo} size="md" />;
  if (it.tipo === "estado" && it.img && !erro)
    return <span className="grid size-12 shrink-0 place-items-center"><img src={it.img} alt="" width={40} height={28} loading="lazy" onError={() => setErro(true)} className="h-7 w-10 rounded-[3px] object-cover ring-1 ring-line" /></span>;
  if (it.tipo === "partido" && it.selo && !erro)
    return <span className="grid size-12 shrink-0 place-items-center"><img src={logoPartido(it.selo)} alt="" width={40} height={40} loading="lazy" onError={() => setErro(true)} className="size-10 rounded-md bg-white object-contain p-0.5 ring-1 ring-line" /></span>;
  if (it.tipo === "partido" || it.tipo === "estado")
    return <span className="grid size-12 shrink-0 place-items-center rounded-xl px-1 text-xs font-bold text-white" style={{ background: it.tipo === "partido" ? partyColor(it.selo ?? "") : "#002776" }}>{it.selo}</span>;
  const Icon = it.tipo === "cidade" ? MapPin : it.tipo === "lei" ? FileText : it.tipo === "autor" || it.tipo === "bancada" ? Users : Landmark;
  const icone = (
    <span className="relative grid size-12 shrink-0 place-items-center rounded-xl bg-verde/12 text-accent">
      <Icon className="size-5" aria-hidden />
      {it.tipo === "cidade" && it.uf && <span className="absolute -bottom-1 -right-1 rounded bg-azul px-1 text-[9px] font-bold leading-tight text-white">{it.uf}</span>}
    </span>
  );
  if (it.tipo === "cidade" && it.uf && it.id.startsWith("m:"))
    return <span className="grid size-12 shrink-0 place-items-center"><EmblemaMunicipio ibge={it.id.slice(2)} uf={it.uf} nome={it.titulo} size={28} fallback={icone} /></span>;
  return icone;
}

/** Situação da lei, ao vivo, em uma palavra: "Virou lei", "Em votação na Câmara", "Parada". */
function StatusLei({ id }: { id: string }) {
  const q = useCamara<ProposicaoDetalhe>(cam.proposicao(id));
  if (!q.data) return null;
  const s = statusLeigo(q.data.statusProposicao?.descricaoSituacao);
  const cor = s === "Virou lei" ? "bg-verde/15 text-accent" : s === "Parada" || s === "Arquivada" || s === "Rejeitada" || s === "Vetada" ? "bg-surface-2 text-muted" : "bg-amarelo/25 text-fg";
  return <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", cor)}>{s}</span>;
}

function Linha2({ it }: { it: ItemBusca }) {
  if ((it.tipo === "deputado" || it.tipo === "senador") && it.selo)
    return <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted"><PartyBadge sigla={it.selo} link={false} />{it.uf} · {it.tipo === "senador" ? "Senador(a)" : "Deputado(a)"}</span>;
  return <span className="block truncate text-xs text-muted">{it.sub ?? ROTULO_TIPO[it.tipo]}</span>;
}

interface Props {
  /** "hero": lista flutuante; "painel": lista sempre visível (diálogo, página de resultados). */
  variante?: "hero" | "painel";
  modoInicial?: ModoBusca;
  ufInicial?: string | null;
  /** Esconde os botões de modo (ex.: só cidade). */
  fixo?: boolean;
  consultaInicial?: string;
  autoFocus?: boolean;
  /** Chamado ao escolher um resultado (ex.: fechar o diálogo). */
  onIr?: () => void;
  /** Toque no campo em tela pequena (ex.: abrir em tela cheia). */
  onFocoMovel?: (q: string, modo: ModoBusca) => void;
  /** Avisa a cada mudança de filtro (ex.: manter a URL da página de resultados). */
  onFiltros?: (f: FiltrosBusca) => void;
  limite?: number;
  className?: string;
  /** Só estes modos. */
  modos?: ModoBusca[];
  /** Troca o destino de um resultado (ex.: boletim em vez do perfil). */
  hrefDe?: (it: ItemBusca) => string;
  /** Modo filtro: escolher um resultado chama isto em vez de navegar (ex.: filtrar a lista da página). */
  onEscolher?: (it: ItemBusca) => void;
  /** Altura de campo de formulário (filtros). */
  compacto?: boolean;
}

export function BuscaUniversal({ variante = "painel", modoInicial = "tudo", ufInicial = null, fixo, consultaInicial = "", autoFocus, onIr, onFocoMovel, onFiltros, limite, className, modos, hrefDe, onEscolher, compacto }: Props) {
  const [modo, setModo] = useState<ModoBusca>(modoInicial);
  const [uf, setUf] = useState<string | null>(ufInicial);
  const [q, setQ] = useState(consultaInicial);
  const [aberto, setAberto] = useState(variante === "painel");
  const [ativo, setAtivo] = useState(variante === "painel" || !!consultaInicial);
  const [sel, setSel] = useState(-1);
  const [recentes, setRecentes] = useState<ItemBusca[]>(() => lerRecentes(storage()));
  const dq = useDebounced(q, 90);
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const listaId = useId();
  const { itens, carregando } = useIndiceBusca(ativo);
  const cfg = MODOS.find((m) => m.id === modo)!;
  const hero = variante === "hero";

  useEffect(() => { onFiltros?.({ q: dq, modo, uf }); }, [dq, modo, uf]); // eslint-disable-line react-hooks/exhaustive-deps

  const hits = useMemo<Array<ItemBusca & { outro?: boolean; grupo?: string }>>(() => {
    const t = dq.trim();
    const out: Array<ItemBusca & { outro?: boolean; grupo?: string }> = [];
    if (!t) {
      if (uf) out.push({ id: `abrir:${uf}`, tipo: "estado", titulo: `Abrir ${UFS[uf as SiglaUf]}`, sub: "Quanto o estado recebeu e quem mandou", href: `/uf/${uf}`, img: bandeiraUf(uf, 64), selo: uf, uf });
      out.push(...recentes.filter((r) => (!cfg.tipos || cfg.tipos.includes(r.tipo)) && (!uf || !r.uf || r.uf === uf)));
      return out;
    }
    const lei = modo === "tudo" || modo === "lei" ? detectarLei(t) : null;
    const n = limite ?? 10;
    const r = rankear(itens, t, { tipos: cfg.tipos ?? TODOS, limite: n, uf });
    const achados: Array<ItemBusca & { outro?: boolean }> = r.length || modo === "tudo" || modo === "lei" ? r : rankear(itens, t, { tipos: TODOS, limite: 5, uf }).map((x) => ({ ...x, outro: true }));
    // Número exato ("PL 2630/2020") que não está na lista curada: link direto.
    if (lei && !achados.some((x) => x.tipo === "lei" && x.titulo.startsWith(`${lei.sigla} ${lei.numero}/`)) && lei.ano)
      achados.push({ id: `l:${lei.sigla}${lei.numero}${lei.ano}`, tipo: "lei", titulo: `${lei.sigla} ${lei.numero}/${lei.ano}`, sub: "Abrir proposta de lei", href: hrefLei(lei) });
    if (modo === "lei" || modo === "tudo") achados.push({ id: `l:q:${t}`, tipo: "lei", titulo: `Leis sobre “${t}”`, sub: "Buscar todas as propostas na Câmara", href: `/proposicoes?q=${encodeURIComponent(t)}` });
    // Tudo: grupos com título (Cidades, Pessoas, Leis, Partidos).
    if (modo === "tudo") for (const g of agrupar(achados)) g.itens.forEach((x, i) => out.push(i === 0 ? { ...x, grupo: g.grupo } : x));
    else out.push(...achados);
    return out;
  }, [dq, itens, modo, cfg, recentes, uf, limite]);
  const valores = useValorCidades(hits);

  useEffect(() => setSel(-1), [dq, modo, uf]);
  useEffect(() => {
    if (!hero || !aberto) return;
    const fora = (e: PointerEvent) => { if (!caixaRef.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [hero, aberto]);

  const ir = (h?: ItemBusca) => {
    if (!h) return;
    // Modo Estado: escolher um estado vira filtro para buscar cidades, deputados e senadores dele.
    if (modo === "estado" && h.tipo === "estado" && h.uf && !h.id.startsWith("abrir:")) {
      setUf(h.uf); setQ(""); setModo("tudo"); inputRef.current?.focus();
      return;
    }
    if (onEscolher && !h.id.startsWith("abrir:")) { onEscolher(h); setQ(""); setAberto(variante === "painel"); return; }
    if (!h.id.startsWith("l:q:") && !h.id.startsWith("abrir:")) { salvarRecente(storage(), { ...h, valor: h.valor ?? valores.get(h.id) }); setRecentes(lerRecentes(storage())); }
    setAberto(variante === "painel");
    onIr?.();
    nav(hrefDe ? hrefDe(h) : h.href);
  };
  const resultados = () => { onIr?.(); nav(`/busca?${filtrosParaUrl({ q, modo, uf })}`); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAberto(true); setSel((s) => Math.min(s + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, -1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (sel >= 0) ir(hits[sel]); else if (q.trim() || uf) resultados(); }
    else if (e.key === "Escape" && hero) setAberto(false);
    else if (e.key === "Backspace" && !q && uf) setUf(null);
  };
  const trocarModo = (m: ModoBusca) => { setModo(m); setAtivo(true); setAberto(true); inputRef.current?.focus(); };
  const mostrarLista = aberto && (hits.length > 0 || (!!dq.trim() && carregando.length > 0));
  const ph = uf && modo !== "estado" ? `${cfg.rotulo === "Tudo" ? "Cidade, deputado ou senador" : cfg.rotulo} em ${UFS[uf as SiglaUf]}` : cfg.ph;

  const lista = (
    <ul id={listaId} role="listbox" aria-label="Sugestões"
      className={clsx("overflow-y-auto overscroll-contain p-1.5", hero ? "absolute inset-x-0 top-full z-50 mt-2 max-h-[min(60vh,460px)] rounded-2xl border border-line bg-surface shadow-2xl" : "min-h-0 flex-1")}>
      {!dq.trim() && hits.some((h) => !h.id.startsWith("abrir:")) && <li role="presentation" className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted"><Clock className="size-3" aria-hidden />Buscas recentes</li>}
      {hits.map((h, i) => {
        const valor = h.valor || valores.get(h.id);
        return [
          h.grupo ? <li role="presentation" key={`g:${h.grupo}`} className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted first:pt-1">{h.grupo}</li> : null,
          h.outro && i === 0 ? <li role="presentation" key="outros" className="px-2 pb-1 pt-1.5 text-xs text-muted">Nenhum resultado em “{cfg.rotulo}”{uf ? ` de ${uf}` : ""}. Achamos em outras categorias:</li> : null,
          <li key={h.id} id={`${listaId}-${i}`} role="option" aria-selected={sel === i}
            onPointerMove={() => setSel(i)} onPointerDown={(e) => e.preventDefault()} onClick={() => ir(h)}
            className={clsx("flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5", sel === i && "bg-verde/10")}>
            <Imagem it={h} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{dq.trim() && !h.id.startsWith("l:q:") ? destacar(h.titulo, dq).map((p, k) => p.casou ? <mark key={k} className="bg-transparent text-accent">{p.texto}</mark> : <span key={k} className="font-medium">{p.texto}</span>) : h.titulo}</span>
              <Linha2 it={h} />
            </span>
            {valor ? (
              <span className="shrink-0 text-right text-xs leading-tight">
                <b className="block text-sm tabular">{formatBRL(valor, true)}</b>
                <span className="text-muted">{h.tipo === "cidade" ? "recebidos" : "mandados"}</span>
              </span>
            ) : h.tipo === "lei" && h.id.startsWith("lei:") ? <StatusLei id={h.id.slice(4)} />
            : modo === "estado" && h.tipo === "estado" && !h.id.startsWith("abrir:") ? <span className="shrink-0 text-xs font-semibold text-accent">filtrar</span> : null}
          </li>,
        ];
      })}
      {dq.trim() && carregando.length > 0 && <li className="px-3 py-2 text-xs text-muted">Carregando {carregando.map((c) => ROTULO_TIPO[c].toLowerCase()).join(", ")}…</li>}
      {dq.trim() && (
        <li role="presentation" className="px-1 pt-1">
          <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={resultados} className="flex min-h-11 w-full items-center justify-between rounded-xl px-2 text-sm font-semibold text-accent hover:bg-surface-2">
            Ver todos os resultados <ArrowRight className="size-4" aria-hidden />
          </button>
        </li>
      )}
    </ul>
  );

  return (
    <div ref={caixaRef} className={clsx("relative", className)} role="search">
      {!fixo && (
        <div role="radiogroup" aria-label="O que você procura?" className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MODOS.filter((m) => !modos || modos.includes(m.id)).map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={modo === m.id} onClick={() => trocarModo(m.id)}
              className={clsx("press relative min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition sm:min-h-9 sm:px-3.5", modo === m.id ? "text-white" : "text-muted ring-1 ring-inset ring-line hover:text-fg")}>
              {modo === m.id && <motion.span layoutId={`busca-modo-${variante}`} className="absolute inset-0 rounded-full bg-verde-700" transition={{ type: "spring", bounce: 0.2, duration: 0.35 }} />}
              <span className="relative">{m.rotulo}</span>
            </button>
          ))}
        </div>
      )}
      <div className={clsx("flex items-center gap-2 rounded-2xl bg-surface-2 pl-3.5 pr-2 focus-within:ring-2 focus-within:ring-accent", hero && !compacto ? "h-14 sm:h-16" : compacto ? "h-11" : "h-12")}>
        <Search className={clsx("shrink-0 text-muted", hero && !compacto ? "size-6" : "size-5")} aria-hidden />
        {uf && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface py-1 pl-1.5 pr-1 text-sm font-semibold ring-1 ring-line">
            <img src={bandeiraUf(uf, 64)} alt="" width={20} height={14} className="h-3.5 w-5 rounded-[2px] object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            {uf}
            <button type="button" onClick={() => { setUf(null); inputRef.current?.focus(); }} aria-label={`Remover filtro ${UFS[uf as SiglaUf]}`} className="relative grid size-6 place-items-center rounded-full text-muted before:absolute before:-inset-2.5 before:content-[''] hover:bg-surface-2 hover:text-fg">
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => { setQ(e.target.value); setAtivo(true); setAberto(true); }}
          onFocus={(e) => {
            if (hero && onFocoMovel && matchMedia("(max-width: 639px)").matches) { e.currentTarget.blur(); onFocoMovel(q, modo); return; }
            setAtivo(true); setAberto(true);
            // Celular: sobe o campo para o topo, para a lista caber acima do teclado.
            if (matchMedia("(max-width: 639px)").matches) { const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 250); }
          }}
          onKeyDown={onKey}
          placeholder={ph}
          aria-label={ph}
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={mostrarLista && sel >= 0 && hits[sel] ? `${listaId}-${sel}` : undefined}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          className={clsx("h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/80", hero && !compacto ? "text-lg font-medium sm:text-xl" : "text-base")}
        />
        {q && (
          <button type="button" onClick={() => { setQ(""); inputRef.current?.focus(); }} aria-label="Limpar" className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {(hero ? mostrarLista : true) && lista}
      {!hero && !dq.trim() && hits.length === 0 && <p className="px-3 py-4 text-sm text-muted">Escolha acima o que procura e comece a digitar. Dica: em “Estado”, escolha um estado para buscar só cidades e políticos dele.</p>}
    </div>
  );
}

/** Campo de filtro com a mesma busca: mostra o filtro escolhido como chip removível. */
export function FiltroBusca({ valor, onValor, ...p }: Omit<Props, "onEscolher" | "variante"> & { valor: string; onValor: (v: string) => void }) {
  if (valor)
    return (
      <span className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-xl bg-surface-2 py-1 pl-3 pr-1 text-sm font-semibold ring-1 ring-line">
        <span className="truncate">{valor}</span>
        <button type="button" onClick={() => onValor("")} aria-label={`Remover filtro ${valor}`} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg"><X className="size-4" aria-hidden /></button>
      </span>
    );
  return <BuscaUniversal {...p} fixo compacto variante="hero" onEscolher={(it) => onValor(it.titulo)} />;
}
