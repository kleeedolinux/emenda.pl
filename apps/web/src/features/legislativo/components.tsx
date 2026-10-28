// Peças de apresentação do módulo legislativo, compostas só com "@/ui".
import clsx from "clsx";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Database } from "lucide-react";
import { Avatar, Badge, Card, EmptyState, ExternalLink, Hemicycle, PartyBadge, Spinner, Tip, VoteBadge, formatDate, formatNumber } from "@/ui";
import type { Fonte } from "./api";
import { duracaoDias, formatDuracao, mesclarPeriodos, type Mandato } from "./mandatos";
import { assentosVotacao, ladosFotos, placar, VOTO_COR, type VotoCamara } from "./votacao";

/** Fontes originais: API upstream + páginas oficiais. */
export function Fontes({ items, className }: { items: Fonte[]; className?: string }) {
  if (!items.length) return null;
  return (
    <aside className={clsx("mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-xs text-muted", className)}>
      <span className="inline-flex items-center gap-1 font-semibold">
        <Database className="size-3.5" aria-hidden />Fontes originais
        <Tip content="Links para os dados oficiais de onde esta seção foi montada, para você conferir." />
      </span>
      {items.map((f) => <ExternalLink key={f.href} href={f.href}>{f.label}</ExternalLink>)}
    </aside>
  );
}

/** Botões de alternância simples (segmentado). */
export function Segmentado<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-xl border border-line bg-surface p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={clsx("rounded-lg px-3 py-1.5 font-medium transition", value === o.value ? "bg-verde text-white" : "text-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const selectCls = "rounded-xl border border-line bg-surface px-3 py-2 text-sm focus:border-accent";
export const inputCls = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent";

export function Campo({ label, tip, children }: { label: string; tip?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted">
      <span className="inline-flex items-center gap-1">{label}{tip && <Tip content={tip} />}</span>
      {children}
    </label>
  );
}

// ---------- Mandatos ----------
export function resumoMandatos(ms: Mandato[]) {
  const dias = duracaoDias(ms.flatMap((m) => m.periodos));
  return { n: ms.length, dias, tempo: formatDuracao(dias), atual: ms.some((m) => m.atual), estimado: ms.some((m) => m.estimado) };
}

export function ChipsMandato({ n, tempo, atual, estimado }: { n: number; tempo: string; atual: boolean; estimado?: boolean }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Badge tone="azul">{n} {n === 1 ? "mandato" : "mandatos"}</Badge>
      <Badge tone="neutro">{estimado ? "≈ " : ""}{tempo}</Badge>
      {atual ? <Badge tone="verde">Em exercício</Badge> : <Badge tone="neutro">Fora do mandato</Badge>}
    </span>
  );
}

/** Barra do tempo: cada mandato é uma faixa; períodos de exercício preenchidos. */
export function BarraMandatos({ mandatos, sel, onSel }: { mandatos: Mandato[]; sel?: string | null; onSel?: (c: string | null) => void }) {
  if (!mandatos.length) return null;
  const t = (d: string) => Date.parse(d);
  const ini = t(mandatos[0]!.inicio);
  const fim = Math.max(...mandatos.map((m) => t(m.fim)), Date.now());
  const pct = (d: string) => ((t(d) - ini) / (fim - ini)) * 100;
  return (
    <div>
      <div className="relative h-10 rounded-lg bg-surface-2" role="list" aria-label="Linha do tempo dos mandatos">
        {mandatos.map((m) => (
          <button
            key={m.codigo} type="button" role="listitem" onClick={() => onSel?.(sel === m.codigo ? null : m.codigo)}
            title={`${m.rotulo}${m.estimado ? " (estimado)" : ""}`}
            className={clsx("absolute inset-y-1 rounded-md border transition", sel === m.codigo ? "border-fg" : "border-line hover:border-accent")}
            style={{ left: `${pct(m.inicio)}%`, width: `${Math.max(pct(m.fim) - pct(m.inicio), 0.8)}%` }}
          >
            {mesclarPeriodos(m.periodos).map((p, i) => (
              <span
                key={i} aria-hidden
                className={clsx("absolute inset-y-0 rounded-[5px]", m.estimado ? "bg-verde/40" : "bg-verde")}
                style={{ left: `${((t(p.inicio) - t(m.inicio)) / (t(m.fim) - t(m.inicio))) * 100}%`, width: `${Math.max(((t(p.fim) - t(p.inicio)) / (t(m.fim) - t(m.inicio))) * 100, 0.5)}%` }}
              />
            ))}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular text-muted">
        <span>{mandatos[0]!.inicio.slice(0, 4)}</span>
        <span>{new Date(fim).getFullYear()}</span>
      </div>
    </div>
  );
}

export function SeletorMandato({ mandatos, value, onChange }: { mandatos: Mandato[]; value: string | null; onChange: (c: string | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filtrar por mandato">
      {[{ codigo: null as string | null, rotulo: "Todos os mandatos", inicio: "", fim: "" }, ...mandatos].map((m) => (
        <button
          key={m.codigo ?? "todos"} type="button" role="radio" aria-checked={value === m.codigo} onClick={() => onChange(m.codigo)}
          className={clsx("rounded-full border px-3 py-1 text-xs font-semibold transition", value === m.codigo ? "border-verde bg-verde text-white" : "border-line bg-surface text-muted hover:text-fg")}
        >
          {m.codigo ? m.rotulo.replace(/\s*\(.*\)$/, "") + ` (${m.inicio.slice(0, 4)}–${m.fim.slice(0, 4)})` : m.rotulo}
        </button>
      ))}
    </div>
  );
}

export function PainelMandatos({ mandatos, sel, onSel, fonte }: { mandatos: Mandato[]; sel: string | null; onSel: (c: string | null) => void; fonte?: ReactNode }) {
  const r = resumoMandatos(mandatos);
  return (
    <Card
      title="Mandatos e tempo de casa"
      tip="Cada mandato é um período para o qual a pessoa foi eleita (ou assumiu como suplente). O tempo de casa soma só os períodos em que esteve de fato no exercício do cargo, sem contar licenças e afastamentos."
      actions={<ChipsMandato {...r} />}
    >
      {mandatos.length ? (
        <>
          <BarraMandatos mandatos={mandatos} sel={sel} onSel={onSel} />
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {mandatos.map((m) => (
              <li key={m.codigo} className="rounded-xl border border-line p-3 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {m.rotulo}
                  {m.atual && <Badge tone="verde">atual</Badge>}
                  {m.estimado && <Badge tone="amarelo">estimado</Badge>}
                  {m.participacao && m.participacao !== "Titular" && <Badge>{m.participacao}</Badge>}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {m.periodos.length
                    ? m.periodos.map((p) => `${formatDate(p.inicio)} a ${formatDate(p.fim)}`).join(" · ")
                    : "Sem exercício registrado"}
                  {" · "}{formatDuracao(duracaoDias(m.periodos))}
                </p>
              </li>
            ))}
          </ul>
          {r.estimado && <p className="mt-3 text-xs text-muted">“Estimado”: a fonte não registra datas de posse/saída nessa legislatura; contamos a legislatura inteira.</p>}
        </>
      ) : <EmptyState title="Sem mandatos registrados na fonte." />}
      {fonte}
    </Card>
  );
}

// ---------- Votações ----------
export function HemicicloVotacao({ votos, cadeiras, titulo }: { votos: VotoCamara[]; cadeiras: number; titulo?: ReactNode }) {
  const [modo, setModo] = useState<"voto" | "partido">("voto");
  const seats = useMemo(() => assentosVotacao(votos, modo, cadeiras), [votos, modo, cadeiras]);
  const p = useMemo(() => placar(votos), [votos]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {titulo && <h3 className="font-semibold">{titulo}</h3>}
        <Segmentado label="Colorir assentos por" value={modo} onChange={setModo} options={[{ value: "voto", label: "Por voto" }, { value: "partido", label: "Por partido" }]} />
      </div>
      <Hemicycle seats={seats} />
      <p className="mt-2 text-xs text-muted">
        <b style={{ color: VOTO_COR.sim }}>{p.sim} sim</b> · <b style={{ color: VOTO_COR.nao }}>{p.nao} não</b> · {p.abstencao} abstenção · {p.obstrucao} obstrução · {p.outro} outros ·{" "}
        {Math.max(cadeiras - p.total, 0)} sem voto registrado. Assentos agrupados pelo partido de cada parlamentar no dia da votação.
      </p>
    </div>
  );
}

/** Grade de fotos A favor / Contra / Outros. */
export function GradeFotos({ votos, link }: { votos: VotoCamara[]; link?: (id: number) => string }) {
  const l = useMemo(() => ladosFotos(votos), [votos]);
  const col = (titulo: string, vs: VotoCamara[], cor: string) => (
    <div className="min-w-0">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><span className="size-2.5 rounded-full" style={{ background: cor }} aria-hidden />{titulo} <span className="tabular text-muted">{vs.length}</span></h4>
      <ul className="flex flex-wrap gap-1.5">
        {vs.map((v) => {
          const d = v.deputado_;
          const el = (
            <span className="group relative inline-flex" title={`${d.nome} (${d.siglaPartido}-${d.siglaUf}): ${v.tipoVoto}`}>
              <Avatar src={d.urlFoto} name={d.nome} size="sm" />
            </span>
          );
          return <li key={d.id}>{link ? <Link to={link(d.id)} aria-label={`${d.nome}, ${d.siglaPartido}-${d.siglaUf}, votou ${v.tipoVoto}`}>{el}</Link> : el}</li>;
        })}
      </ul>
    </div>
  );
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {col("A favor (Sim)", l.favor, VOTO_COR.sim)}
      {col("Contra (Não)", l.contra, VOTO_COR.nao)}
      {col("Outros (abstenção, obstrução, presidente…)", l.outros, VOTO_COR.outro)}
    </div>
  );
}

/** Linha "foto + nome + partido + voto". */
export function Parlamentar({ nome, foto, partido, uf, to, voto, size = "sm" }: { nome: string; foto?: string; partido?: string; uf?: string; to?: string; voto?: string; size?: "sm" | "md" }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar src={foto} name={nome} size={size} />
      <span className="min-w-0">
        {to ? <Link className="link block truncate font-medium" to={to}>{nome}</Link> : <span className="block truncate font-medium">{nome}</span>}
        <span className="flex items-center gap-1 text-xs text-muted">{partido && <PartyBadge sigla={partido} />}{uf}</span>
      </span>
      {voto && <VoteBadge voto={voto} />}
    </span>
  );
}

export function Paginador({ pagina, total, onChange, carregando }: { pagina: number; total: number; onChange: (p: number) => void; carregando?: boolean }) {
  if (total <= 1) return null;
  const btn = "rounded-xl border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-40";
  return (
    <nav aria-label="Paginação" className="mt-3 flex items-center justify-center gap-3 text-sm">
      <button type="button" className={btn} disabled={pagina <= 1} onClick={() => onChange(pagina - 1)}>Anterior</button>
      <span className="tabular text-muted">Página {formatNumber(pagina)} de {formatNumber(total)}</span>
      <button type="button" className={btn} disabled={pagina >= total} onClick={() => onChange(pagina + 1)}>Próxima</button>
      {carregando && <Spinner label="" />}
    </nav>
  );
}

