import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { ErrorState, PageHeader, Skeleton, Tip } from "@/ui";
import { ShareButton } from "@/features/share";
import { diaSP, semanaSP, somarDias, type AgendaEvento } from "@/features/agenda/agenda";
import { useAgendaSemana } from "@/features/agenda/useAgenda";
import { DiaGrupo, TIPS } from "@/features/agenda/AgendaParts";
import { ResumoSemana, VotadoRecente } from "@/features/agenda/Destaques";
import { semanaShare } from "@/features/agenda/compartilhar";

type CasaF = "todas" | "camara" | "senado";
type AmbitoF = "todos" | "plenario" | "comissao";

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { ...o, timeZone: "UTC" });
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-surface-2 p-0.5 ring-1 ring-line">
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={clsx("rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors", value === v ? "bg-surface text-fg shadow-sm ring-1 ring-line" : "text-muted hover:text-fg")}>
          {l}
        </button>
      ))}
    </div>
  );
}

export default function AgendaPage() {
  const [sp, setSp] = useSearchParams();
  const set = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v == null) n.delete(k); else n.set(k, v); return n; }, { replace: true });

  const now = useMemo(() => new Date(), []);
  const hoje = diaSP(now);
  const ontem = somarDias(hoje, -1);
  const diaParam = sp.get("dia");
  const evento = sp.get("evento");
  // Link compartilhado (?dia=…) abre a semana daquele dia.
  const offDia = diaParam && ISO.test(diaParam)
    ? Math.round((Date.parse(semanaSP(new Date(`${diaParam}T15:00:00Z`)).inicio) - Date.parse(semanaSP(now).inicio)) / (7 * 86_400_000))
    : 0;
  const off = sp.has("semana") ? Number(sp.get("semana")) || 0 : offDia;
  const casa = (sp.get("casa") ?? "todas") as CasaF;
  const ambito = (sp.get("ambito") ?? "todos") as AmbitoF;
  const soVotacao = sp.get("votacao") === "1";
  const busca = (sp.get("q") ?? "").toLowerCase();

  const semana = useMemo(() => semanaSP(now, off), [now, off]);
  const dia = diaParam && semana.dias.includes(diaParam) ? diaParam : null;
  const atual = useAgendaSemana(useMemo(() => semanaSP(now, 0), [now]));
  const sel = useAgendaSemana(semana);
  const anterior = useAgendaSemana(useMemo(() => semanaSP(new Date(`${ontem}T15:00:00Z`)), [ontem]));

  const filtra = (e: AgendaEvento) =>
    (casa === "todas" || e.casa === casa) && (ambito === "todos" || e.ambito === ambito) && (!soVotacao || e.deliberativa) &&
    (!busca || `${e.orgao} ${e.orgaoSigla} ${e.titulo} ${e.descricao ?? ""} ${e.local ?? ""}`.toLowerCase().includes(busca));

  const semanaFiltrada = sel.eventos.filter(filtra);
  const lista = dia ? semanaFiltrada.filter((e) => e.dia === dia) : semanaFiltrada;
  const porDia = new Map<string, number>(semana.dias.map((d) => [d, semanaFiltrada.filter((e) => e.dia === d).length]));

  const votarao = sel.eventos.filter((e) => e.ambito === "plenario" && e.deliberativa && (off !== 0 || e.dia >= hoje) && e.status !== "cancelada" && e.status !== "encerrada");
  const recentes = [...new Map([...anterior.eventos, ...atual.eventos].map((e) => [e.id, e])).values()]
    .filter((e) => (e.dia === hoje || e.dia === ontem) && e.deliberativa && e.status !== "cancelada" && e.status !== "agendada" && (e.ambito === "plenario" || e.casa === "camara"))
    .sort((a, b) => b.inicio.localeCompare(a.inicio));
  const carregando = sel.camara.isLoading || sel.senado.isLoading;

  const titulo = off === 0 ? "Esta semana" : off === 1 ? "Próxima semana" : off === -1 ? "Semana passada" : "Semana";
  const intervalo = `${fmt(semana.inicio, { day: "2-digit", month: "short" })} – ${fmt(semana.fim, { day: "2-digit", month: "short" })}`;
  const navBtn = "inline-flex items-center rounded-full p-1 ring-1 ring-line hover:bg-surface-2";
  const irSemana = (o: number | null) => setSp((p) => { const n = new URLSearchParams(p); if (o == null) n.delete("semana"); else n.set("semana", String(o)); n.delete("dia"); n.delete("evento"); return n; }, { replace: true });
  const verDia = (d: string) => setSp((p) => { const n = new URLSearchParams(p); n.set("dia", d); n.delete("evento"); return n; }, { replace: true });
  const dias = (dia ? [dia] : semana.dias).filter((d) => porDia.get(d));
  const comissoesAbertas = ambito === "comissao" || !!busca;

  return (
    <div>
      <PageHeader
        eyebrow="Congresso Nacional"
        title="Agenda do Congresso"
        subtitle={<>O que Câmara e Senado votam, em <Tip content={TIPS.plenario}>Plenário</Tip> e <Tip content={TIPS.comissao}>comissões</Tip>. Horários de Brasília.</>}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Agenda" }]}
        actions={<ShareButton fab {...semanaShare(votarao, semana.inicio)} />}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">

        <div className="min-w-0" id="calendario">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button type="button" aria-label="Semana anterior" className={navBtn} onClick={() => irSemana(off - 1)}><ChevronLeft className="size-4" aria-hidden /></button>
            <h2 className="text-sm font-semibold">{titulo} <span className="font-normal text-muted">{intervalo}</span></h2>
            <button type="button" aria-label="Próxima semana" className={navBtn} onClick={() => irSemana(off + 1)}><ChevronRight className="size-4" aria-hidden /></button>
            {off !== 0 && <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => irSemana(null)}>Hoje</button>}
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Pills label="Casa" value={casa} onChange={(v) => set("casa", v === "todas" ? null : v)} options={[["todas", "Todas"], ["camara", "Câmara"], ["senado", "Senado"]]} />
            <Pills label="Âmbito" value={ambito} onChange={(v) => set("ambito", v === "todos" ? null : v)} options={[["todos", "Tudo"], ["plenario", "Plenário"], ["comissao", "Comissões"]]} />
            <label className="inline-flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={soVotacao} onChange={(e) => set("votacao", e.target.checked ? "1" : null)} className="accent-[var(--color-verde)]" />
              Só com votação
            </label>
            <input type="search" value={sp.get("q") ?? ""} onChange={(e) => set("q", e.target.value || null)} placeholder="Filtrar…"
              aria-label="Filtrar eventos" className="min-w-28 flex-1 rounded-full bg-surface-2 px-3 py-1 text-xs ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-accent sm:max-w-56" />
          </div>

          <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Dia da semana">
            <DiaBtn ativo={!dia} onClick={() => set("dia", null)} topo="Semana" n={semanaFiltrada.length} />
            {semana.dias.map((d) => (
              <DiaBtn key={d} ativo={dia === d} hoje={d === hoje} onClick={() => verDia(d)}
                topo={`${fmt(d, { weekday: "short" }).replace(".", "")} ${fmt(d, { day: "2-digit" })}`} n={porDia.get(d) ?? 0} />
            ))}
          </div>

          {sel.camara.error && <div className="mb-3"><ErrorState error={sel.camara.error} retry={() => sel.camara.refetch()} /></div>}
          {sel.senado.error && <div className="mb-3"><ErrorState error={sel.senado.error} retry={() => sel.senado.refetch()} /></div>}
          {carregando && !sel.eventos.length ? (
            <div className="space-y-1.5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : !lista.length ? (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
              {dia ? `Nada marcado para ${fmt(dia, { weekday: "long", day: "2-digit", month: "long" })}.` : "Nenhum evento nesta semana com esses filtros."}
            </p>
          ) : (
            <div className="space-y-4">
              {dias.map((d) => (
                <DiaGrupo key={`${d}-${comissoesAbertas}`} hoje={d === hoje} destaque={evento} comissoesAbertas={comissoesAbertas}
                  titulo={<>{fmt(d, { weekday: "long", day: "2-digit", month: "long" })}{d === hoje && " · hoje"}</>}
                  eventos={lista.filter((e) => e.dia === d)} />
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted">Fontes: Dados Abertos da Câmara e do Senado. A agenda pode mudar sem aviso; confira o link oficial.</p>
        </div>
        <aside className="space-y-3 lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
          <VotadoRecente eventos={recentes} loading={atual.camara.isLoading || anterior.camara.isLoading} />
          <ResumoSemana titulo={titulo} eventos={semanaFiltrada} votarao={votarao} loading={carregando} onDia={verDia} />
        </aside>
      </div>
    </div>
  );
}

function DiaBtn({ ativo, hoje, onClick, topo, n }: { ativo: boolean; hoje?: boolean; onClick: () => void; topo: string; n: number }) {
  return (
    <button type="button" role="tab" aria-selected={ativo} onClick={onClick}
      className={clsx("flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 transition-colors",
        ativo ? "bg-accent text-white ring-accent" : "ring-line hover:bg-surface-2", hoje && !ativo && "ring-2 ring-accent", n === 0 && !ativo && "opacity-50")}>
      <span className="capitalize">{topo}</span>
      <span className={clsx("rounded-full px-1 tabular-nums", ativo ? "bg-white/25" : "bg-surface-2 text-muted")}>{n}</span>
    </button>
  );
}
