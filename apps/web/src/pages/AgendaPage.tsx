import clsx from "clsx";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { ErrorState, PageHeader, Section, Skeleton, Stat, StatGrid, Tip, stagger } from "@/ui";
import { diaSP, semanaSP, somarDias, type AgendaEvento } from "@/features/agenda/agenda";
import { useAgendaSemana } from "@/features/agenda/useAgenda";
import { ListaEventos, TIPS } from "@/features/agenda/AgendaParts";
import { VotadoRecente, VotaraoSemana } from "@/features/agenda/Destaques";

type CasaF = "todas" | "camara" | "senado";
type AmbitoF = "todos" | "plenario" | "comissao";

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { ...o, timeZone: "UTC" });

function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-surface-2 p-1 ring-1 ring-line">
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={clsx("relative rounded-full px-3 py-1 text-sm font-medium transition-colors", value === v ? "text-fg" : "text-muted hover:text-fg")}>
          {value === v && <motion.span layoutId={`pill-${label}`} className="absolute inset-0 rounded-full bg-surface shadow-sm ring-1 ring-line" />}
          <span className="relative">{l}</span>
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
  const off = Number(sp.get("semana") ?? 0) || 0;
  const casa = (sp.get("casa") ?? "todas") as CasaF;
  const ambito = (sp.get("ambito") ?? "todos") as AmbitoF;
  const soVotacao = sp.get("votacao") === "1";
  const busca = (sp.get("q") ?? "").toLowerCase();

  const semana = useMemo(() => semanaSP(now, off), [now, off]);
  const dia = sp.get("dia") && semana.dias.includes(sp.get("dia")!) ? sp.get("dia")! : null;
  const atual = useAgendaSemana(useMemo(() => semanaSP(now, 0), [now]));
  const sel = useAgendaSemana(semana);
  const anterior = useAgendaSemana(useMemo(() => semanaSP(new Date(`${ontem}T15:00:00Z`)), [ontem]));

  const filtra = (e: AgendaEvento) =>
    (casa === "todas" || e.casa === casa) && (ambito === "todos" || e.ambito === ambito) && (!soVotacao || e.deliberativa) &&
    (!busca || `${e.orgao} ${e.orgaoSigla} ${e.titulo} ${e.descricao ?? ""} ${e.local ?? ""}`.toLowerCase().includes(busca));

  const semanaFiltrada = sel.eventos.filter(filtra);
  const lista = dia ? semanaFiltrada.filter((e) => e.dia === dia) : semanaFiltrada;
  const porDia = new Map<string, number>(semana.dias.map((d) => [d, semanaFiltrada.filter((e) => e.dia === d).length]));

  const votarao = atual.eventos.filter((e) => e.ambito === "plenario" && e.deliberativa && e.dia >= hoje && (e.status === "agendada" || e.status === "em-andamento"));
  const recentes = [...new Map([...anterior.eventos, ...atual.eventos].map((e) => [e.id, e])).values()]
    .filter((e) => (e.dia === hoje || e.dia === ontem) && e.deliberativa && e.status !== "cancelada" && e.status !== "agendada" && (e.ambito === "plenario" || e.casa === "camara"))
    .sort((a, b) => b.inicio.localeCompare(a.inicio));
  const carregandoAtual = atual.camara.isLoading || atual.senado.isLoading;
  const carregando = sel.camara.isLoading || sel.senado.isLoading;

  const titulo = off === 0 ? "Esta semana" : off === 1 ? "Próxima semana" : off === -1 ? "Semana passada" : "Semana";
  const intervalo = `${fmt(semana.inicio, { day: "2-digit", month: "short" })} – ${fmt(semana.fim, { day: "2-digit", month: "short", year: "numeric" })}`;
  const navBtn = "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-line hover:bg-surface-2";

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <PageHeader
        eyebrow="Congresso Nacional"
        title="Agenda do Congresso"
        subtitle={<>O que a Câmara e o Senado vão discutir e votar: sessões do <Tip content={TIPS.plenario}>Plenário</Tip>, reuniões de <Tip content={TIPS.comissao}>comissões</Tip> e o resultado das votações. Horários de Brasília.</>}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Agenda" }]}
      />

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <VotaraoSemana eventos={votarao} loading={carregandoAtual} />
        <VotadoRecente eventos={recentes} loading={carregandoAtual || anterior.camara.isLoading} />
      </div>

      <Section title={`${titulo} · ${intervalo}`} tip={TIPS.pauta} id="calendario">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button type="button" className={navBtn} onClick={() => { set("semana", String(off - 1)); set("dia", null); }}><ChevronLeft className="size-4" aria-hidden />Anterior</button>
          {off !== 0 && <button type="button" className={navBtn} onClick={() => { set("semana", null); set("dia", null); }}>Hoje</button>}
          <button type="button" className={navBtn} onClick={() => { set("semana", String(off + 1)); set("dia", null); }}>Próxima<ChevronRight className="size-4" aria-hidden /></button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Pills label="Casa" value={casa} onChange={(v) => set("casa", v === "todas" ? null : v)} options={[["todas", "Todas"], ["camara", "Câmara"], ["senado", "Senado"]]} />
          <Pills label="Âmbito" value={ambito} onChange={(v) => set("ambito", v === "todos" ? null : v)} options={[["todos", "Tudo"], ["plenario", "Plenário"], ["comissao", "Comissões"]]} />
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soVotacao} onChange={(e) => set("votacao", e.target.checked ? "1" : null)} className="accent-[var(--color-verde)]" />
            Só com votação <Tip content={TIPS.deliberativa} />
          </label>
          <input type="search" value={sp.get("q") ?? ""} onChange={(e) => set("q", e.target.value || null)} placeholder="Filtrar por comissão, local, tema…"
            aria-label="Filtrar eventos" className="min-w-0 flex-1 rounded-full bg-surface-2 px-4 py-1.5 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-accent sm:max-w-xs" />
        </div>

        <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Dia da semana">
          <DiaBtn ativo={!dia} onClick={() => set("dia", null)} topo="Semana" baixo="toda" n={semanaFiltrada.length} />
          {semana.dias.map((d) => (
            <DiaBtn key={d} ativo={dia === d} hoje={d === hoje} onClick={() => set("dia", d)}
              topo={fmt(d, { weekday: "short" }).replace(".", "")} baixo={fmt(d, { day: "2-digit", month: "2-digit" })} n={porDia.get(d) ?? 0} />
          ))}
        </div>

        <StatGrid className="mb-5">
          <Stat label="Eventos" value={carregando ? "…" : semanaFiltrada.length} />
          <Stat label="Sessões de Plenário" value={carregando ? "…" : semanaFiltrada.filter((e) => e.ambito === "plenario").length} tip={TIPS.plenario} />
          <Stat label="Reuniões de comissão" value={carregando ? "…" : semanaFiltrada.filter((e) => e.ambito === "comissao").length} tip={TIPS.comissao} />
          <Stat label="Com votação" value={carregando ? "…" : semanaFiltrada.filter((e) => e.deliberativa).length} tip={TIPS.deliberativa} />
        </StatGrid>

        {sel.camara.error && <div className="mb-3"><ErrorState error={sel.camara.error} retry={() => sel.camara.refetch()} /></div>}
        {sel.senado.error && <div className="mb-3"><ErrorState error={sel.senado.error} retry={() => sel.senado.refetch()} /></div>}
        {carregando && !sel.eventos.length ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : dia ? (
          <ListaEventos eventos={lista} vazio={`Nada marcado para ${fmt(dia, { weekday: "long", day: "2-digit", month: "long" })}.`} />
        ) : (
          <div className="space-y-8">
            {semana.dias.filter((d) => porDia.get(d)).map((d) => (
              <div key={d}>
                <h3 className={clsx("sticky top-16 z-10 mb-3 bg-bg/85 py-1 text-sm font-semibold capitalize backdrop-blur", d === hoje && "text-accent")}>
                  {fmt(d, { weekday: "long", day: "2-digit", month: "long" })}{d === hoje && " · hoje"}
                </h3>
                <ListaEventos eventos={lista.filter((e) => e.dia === d)} vazio="Nada marcado." />
              </div>
            ))}
            {!lista.length && <ListaEventos eventos={[]} vazio="Nenhum evento nesta semana com esses filtros." />}
          </div>
        )}
        <p className="mt-6 text-xs text-muted">
          Fontes: API de Dados Abertos da Câmara dos Deputados e Dados Abertos do Senado Federal. A agenda pode mudar sem aviso; confira sempre o link oficial.
        </p>
      </Section>
    </motion.div>
  );
}

function DiaBtn({ ativo, hoje, onClick, topo, baixo, n }: { ativo: boolean; hoje?: boolean; onClick: () => void; topo: string; baixo: string; n: number }) {
  return (
    <button type="button" role="tab" aria-selected={ativo} onClick={onClick}
      className={clsx("relative flex min-w-16 shrink-0 flex-col items-center rounded-xl px-3 py-2 text-sm ring-1 transition-colors",
        ativo ? "bg-accent text-white ring-accent" : "ring-line hover:bg-surface-2", hoje && !ativo && "ring-2 ring-accent")}>
      <span className="text-xs capitalize opacity-80">{topo}</span>
      <span className="font-semibold tabular-nums">{baixo}</span>
      <span className={clsx("mt-1 rounded-full px-1.5 text-[10px] tabular-nums", ativo ? "bg-white/25" : "bg-surface-2 text-muted", n === 0 && "opacity-50")}>{n}</span>
    </button>
  );
}
