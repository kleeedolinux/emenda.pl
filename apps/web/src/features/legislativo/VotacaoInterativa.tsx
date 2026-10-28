// "Quem votou como": hemiciclo interativo + grade de cartões (foto, nome, partido, UF), com filtros.
import clsx from "clsx";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { AlertTriangle, Search, X } from "lucide-react";
import { PartyBadge, VoteBadge, formatNumber, hemicycleLayout, partyColor } from "@/ui";
import { Segmentado } from "./components";
import { assentosVotacao, categoriaVoto, placar, VOTO_COR, VOTO_LABEL, type Orientacao, type VotoCamara } from "./votacao";
import { enriquecerVotos, filtrarVotos, gruposVoto, LADO_LABEL, opcoesFiltro, type Lado, type VotoItem } from "./painelVotos";
import { cdnImg, imagemCdn, trocarParaOriginal } from "@/lib/cdn";

const COR_LADO: Record<Lado, string> = { sim: VOTO_COR.sim, nao: VOTO_COR.nao, outro: VOTO_COR.outro };
const LIMITE = 200; // acima disso, cada grupo mostra só os primeiros POR_GRUPO até o usuário pedir todos
const POR_GRUPO = 60;

type Ativo = { item: VotoItem; rect: DOMRect; assento?: boolean } | null;

export interface VotacaoInterativaProps {
  votos: VotoCamara[];
  orientacoes?: Orientacao[];
  cadeiras: number;
  perfil: (id: number) => string;
  /** "deputado(a)" ou "senador(a)" — usado nos rótulos. */
  quem?: string;
  /** Conteúdo extra entre o hemiciclo e a lista (ex.: orientações gerais). */
  extra?: ReactNode;
}

/** Hemiciclo + lista filtrável. Hover/foco mostra o mesmo cartão; clique no assento leva ao cartão na lista. */
export function VotacaoInterativa({ votos, orientacoes = [], cadeiras, perfil, quem = "parlamentar", extra }: VotacaoInterativaProps) {
  const itens = useMemo(() => enriquecerVotos(votos, orientacoes), [votos, orientacoes]);
  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const [ativo, setAtivo] = useState<Ativo>(null);
  const [destaque, setDestaque] = useState<number | null>(null);
  const [revelar, setRevelar] = useState<number | null>(null);
  const escopo = useId().replace(/:/g, "");
  const temOrientacao = itens.some((i) => i.orientacao);

  const irPara = useCallback((id: number) => { setDestaque(id); setRevelar(id); }, []);

  return (
    <div onKeyDown={(e) => e.key === "Escape" && setAtivo(null)}>
      <Hemiciclo votos={votos} cadeiras={cadeiras} porId={porId} onHover={setAtivo} onSelect={irPara} destaque={destaque} />
      {extra}
      <ListaVotos
        itens={itens} escopo={escopo} perfil={perfil} quem={quem} temOrientacao={temOrientacao}
        destaque={destaque} revelar={revelar} onRevelado={() => setRevelar(null)} onAtivo={setAtivo} ativoId={ativo?.item.id ?? null}
      />
      {ativo && <CartaoVoto a={ativo} temOrientacao={temOrientacao} />}
    </div>
  );
}

// ---------- Hemiciclo ----------
function Hemiciclo({ votos, cadeiras, porId, onHover, onSelect, destaque }: {
  votos: VotoCamara[]; cadeiras: number; porId: Map<number, VotoItem>; onHover: (a: Ativo) => void; onSelect: (id: number) => void; destaque: number | null;
}) {
  const [modo, setModo] = useState<"voto" | "partido">("voto");
  const [hover, setHover] = useState<string | null>(null);
  const seats = useMemo(() => assentosVotacao(votos, modo, cadeiras), [votos, modo, cadeiras]);
  const pos = useMemo(() => hemicycleLayout(seats.length), [seats.length]);
  const p = useMemo(() => placar(votos), [votos]);
  const r = Math.min(0.045, 1.6 / Math.sqrt(Math.max(seats.length, 1)) / 4);
  const legenda = useMemo(() => {
    const m = new Map<string, { group: string; color: string; n: number }>();
    for (const s of seats) { const g = m.get(s.group); if (g) g.n++; else m.set(s.group, { group: s.group, color: s.color, n: 1 }); }
    return [...m.values()];
  }, [seats]);
  const hoverGrupo = hover ? seats.find((s) => s.key === hover)?.group : null;

  return (
    <figure className="mx-auto max-w-2xl">
      <div className="mb-2 flex justify-end">
        <Segmentado label="Colorir assentos por" value={modo} onChange={setModo} options={[{ value: "voto", label: "Por voto" }, { value: "partido", label: "Por partido" }]} />
      </div>
      <svg viewBox="-1.08 -1.08 2.16 1.16" className="w-full" role="img"
        aria-label={`${p.sim} sim, ${p.nao} não, ${p.total - p.sim - p.nao} outros, ${Math.max(cadeiras - p.total, 0)} sem voto. Use a lista abaixo para navegar pelo teclado.`}
        onMouseLeave={() => { setHover(null); onHover(null); }}>
        {seats.map((s, i) => {
          const q = pos[i];
          if (!q) return null;
          const item = porId.get(Number(s.key));
          return (
            <circle
              key={s.key} cx={q.x} cy={q.y} r={item && destaque === item.id ? r * 1.5 : r} fill={s.color}
              stroke={hover === s.key || (item && destaque === item.id) ? "var(--color-fg)" : "none"} strokeWidth={0.01}
              fillOpacity={hoverGrupo && hoverGrupo !== s.group ? 0.35 : 1}
              className={clsx("transition-[fill-opacity]", item && "cursor-pointer")}
              onMouseEnter={(e) => { setHover(s.key); onHover(item ? { item, rect: e.currentTarget.getBoundingClientRect(), assento: true } : null); }}
              onClick={() => item && onSelect(item.id)}
            >
              {!item && <title>{s.label}</title>}
            </circle>
          );
        })}
        <text x={0} y={-0.12} textAnchor="middle" className="fill-fg font-display" fontSize={0.16} fontWeight={700}>{formatNumber(p.total)}</text>
        <text x={0} y={-0.02} textAnchor="middle" className="fill-muted" fontSize={0.065}>votos registrados</text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
        {legenda.map((g) => (
          <span key={g.group} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: g.color }} aria-hidden />{g.group} <b className="tabular">{g.n}</b>
          </span>
        ))}
      </figcaption>
      <p className="mt-1 text-center text-xs text-muted">Passe o mouse num assento para ver quem é; clique para achá-lo na lista.</p>
    </figure>
  );
}

// ---------- Lista ----------
function ListaVotos({ itens, escopo, perfil, quem, temOrientacao, destaque, revelar, onRevelado, onAtivo, ativoId }: {
  itens: VotoItem[]; escopo: string; perfil: (id: number) => string; quem: string; temOrientacao: boolean;
  destaque: number | null; revelar: number | null; onRevelado: () => void; onAtivo: (a: Ativo) => void; ativoId: number | null;
}) {
  const [busca, setBusca] = useState("");
  const [partidos, setPartidos] = useState<string[]>([]);
  const [ufs, setUfs] = useState<string[]>([]);
  const [soContra, setSoContra] = useState(false);
  const [agrupar, setAgrupar] = useState(false);
  const [abertos, setAbertos] = useState<Set<Lado>>(new Set());
  const opcoes = useMemo(() => opcoesFiltro(itens), [itens]);
  const filtrados = useMemo(() => filtrarVotos(itens, { busca, partidos, ufs, soContra }), [itens, busca, partidos, ufs, soContra]);
  const grupos = useMemo(() => gruposVoto(filtrados, agrupar), [filtrados, agrupar]);
  const nContra = useMemo(() => itens.filter((i) => i.contra).length, [itens]);
  const limitar = filtrados.length > LIMITE;
  const filtrando = !!(busca || partidos.length || ufs.length || soContra);
  const limpar = () => { setBusca(""); setPartidos([]); setUfs([]); setSoContra(false); };

  // Clique no hemiciclo: garante que o cartão esteja visível (limpa filtros/expande), rola e foca.
  useEffect(() => {
    if (revelar == null) return;
    const it = itens.find((i) => i.id === revelar);
    if (!it) return onRevelado();
    if (!filtrados.some((i) => i.id === revelar)) { limpar(); return; }
    if (limitar && !abertos.has(it.lado)) { setAbertos((s) => new Set(s).add(it.lado)); return; }
    const el = document.getElementById(`voto-${escopo}-${revelar}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
    onRevelado();
  }, [revelar, filtrados, abertos, limitar, itens, escopo, onRevelado]);

  const alterna = (xs: string[], set: (v: string[]) => void, v: string) => set(xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]);
  const chip = (i: VotoItem) => (
    <li key={i.id}>
      <ChipVoto i={i} id={`voto-${escopo}-${i.id}`} to={perfil(i.id)} destaque={destaque === i.id} descrito={ativoId === i.id} onAtivo={onAtivo} />
    </li>
  );
  const grade = "grid grid-cols-[repeat(auto-fill,minmax(8.75rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-1.5";

  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">Buscar {quem}</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={`Buscar ${quem}, partido ou UF…`}
            className="w-full rounded-xl border border-line bg-surface py-1.5 pl-8 pr-3 text-sm outline-none focus:border-ring" />
        </label>
        <Toggle on={agrupar} onChange={setAgrupar}>Agrupar por partido</Toggle>
        {temOrientacao && <Toggle on={soContra} onChange={setSoContra}><AlertTriangle className="size-3.5" aria-hidden />Só quem votou contra o partido <span className="tabular">({nContra})</span></Toggle>}
      </div>
      <Filtros titulo="Partido" opcoes={opcoes.partidos} sel={partidos} onToggle={(v) => alterna(partidos, setPartidos, v)} render={(v) => <PartyBadge sigla={v} link={false} />} />
      <Filtros titulo="UF" opcoes={opcoes.ufs} sel={ufs} onToggle={(v) => alterna(ufs, setUfs, v)} render={(v) => v} />
      <p className="mt-2 text-xs text-muted" aria-live="polite">
        {formatNumber(filtrados.length)} de {formatNumber(itens.length)} votos
        {filtrando && <button type="button" onClick={limpar} className="ml-2 inline-flex items-center gap-0.5 font-medium text-link hover:underline"><X className="size-3" aria-hidden />limpar filtros</button>}
      </p>

      {grupos.length === 0 && <p className="mt-4 text-sm text-muted">Ninguém corresponde aos filtros.</p>}
      {grupos.map((g) => {
        const tudo = !limitar || abertos.has(g.lado);
        let resta = tudo ? Infinity : POR_GRUPO;
        const corta = (xs: VotoItem[]) => { const r = xs.slice(0, Math.max(resta, 0)); resta -= r.length; return r; };
        return (
          <section key={g.lado} className="mt-4" aria-label={`${LADO_LABEL[g.lado]}: ${g.itens.length}`}>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <span className="size-2.5 rounded-full" style={{ background: COR_LADO[g.lado] }} aria-hidden />
              {LADO_LABEL[g.lado]} <span className="tabular rounded-md bg-surface-2 px-1.5 text-muted">{formatNumber(g.itens.length)}</span>
            </h4>
            {g.partidos ? (
              <div className="space-y-2.5">
                {g.partidos.map((pg) => {
                  const vis = corta(pg.itens);
                  if (!vis.length) return null;
                  return (
                    <div key={pg.partido}>
                      <p className="mb-1 flex items-center gap-1.5 text-xs text-muted"><PartyBadge sigla={pg.partido} /> <span className="tabular">{pg.itens.length}</span></p>
                      <ul className={grade}>{vis.map(chip)}</ul>
                    </div>
                  );
                })}
              </div>
            ) : <ul className={grade}>{corta(g.itens).map(chip)}</ul>}
            {!tudo && g.itens.length > POR_GRUPO && (
              <button type="button" onClick={() => setAbertos((s) => new Set(s).add(g.lado))}
                className="mt-2 rounded-xl border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
                Mostrar todos os {formatNumber(g.itens.length)}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => onChange(!on)}
      className={clsx("inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition",
        on ? "border-verde bg-verde text-white" : "border-line bg-surface text-muted hover:text-fg")}>
      {children}
    </button>
  );
}

function Filtros({ titulo, opcoes, sel, onToggle, render }: {
  titulo: string; opcoes: { valor: string; n: number }[]; sel: string[]; onToggle: (v: string) => void; render: (v: string) => ReactNode;
}) {
  const [todos, setTodos] = useState(false);
  if (opcoes.length < 2) return null;
  const vis = todos ? opcoes : opcoes.slice(0, 10);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1" role="group" aria-label={`Filtrar por ${titulo}`}>
      <span className="mr-1 text-xs font-semibold text-muted">{titulo}</span>
      {vis.map((o) => (
        <button key={o.valor} type="button" aria-pressed={sel.includes(o.valor)} onClick={() => onToggle(o.valor)}
          className={clsx("inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-xs transition",
            sel.includes(o.valor) ? "border-fg bg-surface-2 font-semibold" : "border-line hover:border-muted")}>
          {render(o.valor)}<span className="tabular text-muted">{o.n}</span>
        </button>
      ))}
      {opcoes.length > 10 && (
        <button type="button" onClick={() => setTodos((t) => !t)} className="px-1 text-xs font-medium text-link hover:underline">
          {todos ? "menos" : `+${opcoes.length - 10}`}
        </button>
      )}
    </div>
  );
}

// ---------- Cartão ----------
function ChipVoto({ i, id, to, destaque, descrito, onAtivo }: {
  i: VotoItem; id: string; to: string; destaque: boolean; descrito: boolean; onAtivo: (a: Ativo) => void;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const abrir = () => ref.current && onAtivo({ item: i, rect: ref.current.getBoundingClientRect() });
  const fechar = () => onAtivo(null);
  return (
    <Link
      ref={ref} id={id} to={to}
      aria-label={`${i.nome}, ${i.partido}-${i.uf}, votou ${i.voto}${i.contra ? ", contra a orientação do partido" : ""}. Abrir perfil.`}
      aria-describedby={descrito ? "cartao-voto" : undefined}
      onMouseEnter={abrir} onMouseLeave={fechar} onFocus={abrir} onBlur={fechar}
      className={clsx(
        "flex h-12 min-w-0 items-center gap-2 rounded-lg border border-l-4 border-line bg-surface py-1 pl-1.5 pr-2 transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring",
        destaque && "ring-2 ring-ring",
      )}
      style={{ borderLeftColor: COR_LADO[i.lado] }}
    >
      <Foto src={i.foto} nome={i.nome} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-tight">{i.nome}</span>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] leading-none text-muted">
          <PartyBadge sigla={i.partido} link={false} />{i.uf}
          {i.lado === "outro" && <span className="truncate">· {i.voto}</span>}
        </span>
      </span>
      {i.contra && <AlertTriangle className="size-3.5 shrink-0 text-amarelo-700 dark:text-amarelo" aria-hidden />}
    </Link>
  );
}

function Foto({ src, nome }: { src: string; nome: string }) {
  const [err, setErr] = useState(false);
  const ini = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return src && !err ? (
    <img {...cdnImg(src, 32)} alt="" width={32} height={32} loading="lazy" decoding="async" onError={(e) => trocarParaOriginal(e.currentTarget, imagemCdn(src)?.fallbackSrc) || setErr(true)}
      className="size-8 shrink-0 rounded-full bg-surface-2 object-cover object-top" />
  ) : (
    <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-verde to-azul text-[11px] font-bold text-white">{ini}</span>
  );
}

function CartaoVoto({ a, temOrientacao }: { a: NonNullable<Ativo>; temOrientacao: boolean }) {
  const { item: i, rect } = a;
  const W = 256;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - W / 2), window.innerWidth - W - 8);
  const acima = rect.top > 190;
  const cat = categoriaVoto(i.voto);
  return (
    <div id="cartao-voto" role="tooltip"
      className="pointer-events-none fixed z-[100] rounded-xl border border-line bg-surface p-3 text-[13px] leading-snug text-fg shadow-xl"
      style={{ width: W, left, ...(acima ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }) }}>
      <div className="flex items-center gap-2.5">
        {i.foto ? <img {...cdnImg(i.foto, 44)} onError={(e) => trocarParaOriginal(e.currentTarget, imagemCdn(i.foto)?.fallbackSrc)} alt="" width={44} height={44} className="size-11 shrink-0 rounded-full bg-surface-2 object-cover object-top" /> : null}
        <div className="min-w-0">
          <p className="font-semibold">{i.nome}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><span className="inline-block size-2 rounded-full" style={{ background: partyColor(i.partido) }} aria-hidden />{i.partido}-{i.uf}</p>
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-xs">
        <dt className="text-muted">Voto</dt><dd><VoteBadge voto={i.voto} /></dd>
        {temOrientacao && <><dt className="text-muted">Orientação do partido</dt><dd>{i.orientacao ? <VoteBadge voto={i.orientacao} /> : "—"}</dd></>}
      </dl>
      {i.contra && <p className="mt-2 flex items-center gap-1 rounded-lg bg-amarelo/25 px-2 py-1 text-xs font-medium"><AlertTriangle className="size-3.5" aria-hidden />Votou contra a orientação do partido</p>}
      {cat === "outro" && i.voto !== VOTO_LABEL.outro && <p className="mt-1 text-[11px] text-muted">“{i.voto}” não conta como sim nem não.</p>}
      <p className="mt-2 text-[11px] text-muted">{a.assento ? "Clique para achar na lista." : "Clique para abrir o perfil."}</p>
    </div>
  );
}
