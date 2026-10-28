// Peças visuais das bancadas, compostas com "@/ui".
import clsx from "clsx";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Users } from "lucide-react";
import { Avatar, Badge, Donut, EmptyState, PartyBadge, Skeleton, partyColor, formatNumber } from "@/ui";
import { inputCls, selectCls } from "@/features/legislativo/components";
import { semAcento } from "@emenda/contracts";
import { composicao, type MembroFrente } from "./bancadas";
import type { BancadaTematica } from "./catalogo";

export const hrefBancada = (b: Pick<BancadaTematica, "slug">) => `/bancada/${b.slug}`;

export function DonutPartidos({ membros, centro = "membros" }: { membros: readonly MembroFrente[]; centro?: string }) {
  const comp = composicao(membros, (m) => m.siglaPartido);
  const top = comp.slice(0, 8);
  const resto = comp.slice(8).reduce((s, x) => s + x.value, 0);
  const data = [...top.map((x) => ({ label: x.label, value: x.value, color: partyColor(x.label) })), ...(resto ? [{ label: "Outros", value: resto, color: "#94a3b8" }] : [])];
  return <Donut data={data} centerLabel={centro} />;
}

/** Cartão de bancada temática no hub. */
export function CardBancada({ b, membros, carregando }: { b: BancadaTematica; membros?: MembroFrente[]; carregando?: boolean }) {
  return (
    <article className="card flex min-w-0 flex-col p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">{b.tema}</p>
      <h3 className="mt-1 text-xl font-bold leading-tight">
        <Link className="hover:underline" to={hrefBancada(b)}>{b.apelido}</Link>
      </h3>
      <p className="mt-0.5 text-sm text-muted">{b.oficial}</p>
      <div className="mt-3 flex items-center gap-1.5 text-sm">
        <Users className="size-4 text-accent" aria-hidden />
        {membros ? <span><b className="tabular">{formatNumber(membros.length)}</b> deputados(as) membros</span> : carregando ? <Skeleton className="h-4 w-32" /> : "—"}
      </div>
      <div className="mt-3 min-h-40">
        {membros ? <DonutPartidos membros={membros} /> : carregando ? <Skeleton className="h-40" /> : null}
      </div>
      <p className="mt-3 text-sm text-pretty"><b>O que diz defender:</b> {b.resumo}</p>
      <p className="mt-1 text-xs text-muted">Fonte: {b.fonte} da própria frente.</p>
      <Link className="link mt-auto pt-3 text-sm font-semibold" to={hrefBancada(b)}>Ver membros e votos →</Link>
    </article>
  );
}

const busca = (s: string) => semAcento(s).toLowerCase();

/** Grade de membros com filtro por nome, partido e UF. */
export function GradeMembros({ membros, limite = 48 }: { membros: readonly MembroFrente[]; limite?: number }) {
  const [q, setQ] = useState("");
  const [partido, setPartido] = useState("");
  const [uf, setUf] = useState("");
  const [todos, setTodos] = useState(false);
  const partidos = useMemo(() => composicao(membros, (m) => m.siglaPartido).map((x) => x.label).sort(), [membros]);
  const ufs = useMemo(() => composicao(membros, (m) => m.siglaUf).map((x) => x.label).sort(), [membros]);
  const filtrados = useMemo(() => {
    const t = busca(q.trim());
    const ordem = (m: MembroFrente) => (/coordenador|presidente/i.test(m.titulo) ? 0 : 1);
    return membros
      .filter((m) => (!t || busca(m.nome).includes(t)) && (!partido || m.siglaPartido === partido) && (!uf || m.siglaUf === uf))
      .slice().sort((a, b) => ordem(a) - ordem(b) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [membros, q, partido, uf]);
  const vis = todos ? filtrados : filtrados.slice(0, limite);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
        <input className={clsx(inputCls, "max-w-xs")} placeholder="Buscar membro…" aria-label="Buscar membro" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={selectCls} aria-label="Partido" value={partido} onChange={(e) => setPartido(e.target.value)}>
          <option value="">Todos os partidos</option>{partidos.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select className={selectCls} aria-label="UF" value={uf} onChange={(e) => setUf(e.target.value)}>
          <option value="">Todas as UFs</option>{ufs.map((p) => <option key={p}>{p}</option>)}
        </select>
        <span className="text-sm text-muted">{formatNumber(filtrados.length)} de {formatNumber(membros.length)}</span>
      </div>
      {filtrados.length === 0 ? <EmptyState title="Nenhum membro com esses filtros." /> : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {vis.map((m) => (
            <li key={m.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-surface p-2.5">
              <Avatar src={m.urlFoto} name={m.nome} size="md" />
              <span className="min-w-0">
                <Link className="link block truncate font-medium" to={`/deputado/${m.id}`}>{m.nome}</Link>
                <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">
                  <PartyBadge sigla={m.siglaPartido} />
                  <Link className="hover:underline" to={`/uf/${m.siglaUf}`}>{m.siglaUf}</Link>
                  {m.titulo && m.titulo !== "Membro" && <Badge tone="azul">{m.titulo}</Badge>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!todos && filtrados.length > limite && (
        <button type="button" onClick={() => setTodos(true)} className="press mt-3 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-2 print:hidden">
          Mostrar todos os {formatNumber(filtrados.length)}
        </button>
      )}
    </div>
  );
}

/** Barra horizontal dupla: % Sim da bancada vs plenário. */
export function BarraComparada({ bancada, plenario }: { bancada: number | null; plenario: number | null }) {
  const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
  const linha = (rot: string, v: number | null, cor: string) => (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-muted">{rot}</span>
      <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[#dc2626]/25" aria-hidden>
        {v != null && <span className={clsx("absolute inset-y-0 left-0 rounded-full", cor)} style={{ width: `${v * 100}%` }} />}
      </span>
      <span className="w-10 shrink-0 text-right font-semibold tabular">{pct(v)}</span>
    </div>
  );
  return (
    <div className="min-w-44 space-y-1" role="img" aria-label={`Sim: bancada ${pct(bancada)}, plenário ${pct(plenario)}`}>
      {linha("Bancada", bancada, "bg-[#16a34a]")}
      {linha("Plenário", plenario, "bg-[#16a34a]/60")}
    </div>
  );
}
