import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarPlus, CheckCircle2, ChevronDown, Clock, MapPin, PlayCircle, FileText, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Badge, EmptyState, ErrorState, ExternalLink, Skeleton, Tip, type Tone } from "@/ui";
import { icsFilename, toICS, type AgendaEvento, type Materia, type Status } from "./agenda";
import { usePautaCamara, useVotacoesEvento } from "./useAgenda";

export const TIPS = {
  pauta: "A pauta é a lista de assuntos (projetos, requerimentos, PECs) que estão marcados para serem discutidos ou votados numa sessão ou reunião. Estar na pauta não garante votação: itens podem ser adiados ou retirados.",
  plenario: "O Plenário reúne todos os parlamentares da Casa (513 deputados ou 81 senadores). É onde as decisões finais de cada Casa são tomadas.",
  comissao: "Comissões são grupos menores de parlamentares especializados num tema (saúde, economia, justiça…). Analisam os projetos antes do Plenário e, às vezes, aprovam projetos sozinhas (caráter conclusivo).",
  deliberativa: "Sessão ou reunião deliberativa é aquela em que há votação. Sessões não deliberativas servem para debates, homenagens e discursos, sem decisões.",
  ics: "Baixa um arquivo .ics que você abre no Google Agenda, Outlook ou no calendário do celular para ser lembrado do evento.",
};

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  agendada: { label: "Agendada", tone: "azul" },
  "em-andamento": { label: "Acontecendo agora", tone: "amarelo" },
  encerrada: { label: "Encerrada", tone: "neutro" },
  cancelada: { label: "Cancelada", tone: "vermelho" },
};

export const CASA_LABEL = { camara: "Câmara", senado: "Senado" } as const;

export function baixarICS(ev: AgendaEvento) {
  const blob = new Blob([toICS(ev)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = icsFilename(ev);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MateriaLink({ m }: { m: Materia }) {
  const cls = "font-semibold text-accent hover:underline";
  if (!m.href) return <span className="font-semibold">{m.sigla}</span>;
  return m.href.startsWith("/") ? <Link className={cls} to={m.href}>{m.sigla}</Link> : <ExternalLink href={m.href} className={cls}>{m.sigla}</ExternalLink>;
}

export function MateriaList({ materias, limit }: { materias: Materia[]; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = limit && !all ? materias.slice(0, limit) : materias;
  return (
    <div>
      <ol className="space-y-2">
        {shown.map((m, i) => (
          <li key={`${m.id}-${i}`} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <MateriaLink m={m} />
              {m.regime && <Badge>{m.regime}</Badge>}
              {m.apreciacao && <span className="text-xs text-muted">{m.apreciacao}</span>}
            </div>
            {m.ementa && <p className="mt-1 line-clamp-3 text-pretty">{m.ementa}</p>}
            {m.relator && <p className="mt-1 text-xs text-muted">Relator: {m.relator.replace(/^Relator:\s*/i, "")}</p>}
          </li>
        ))}
      </ol>
      {limit && materias.length > limit && (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 text-sm font-medium text-accent hover:underline">
          {all ? "Mostrar menos" : `Ver todos os ${materias.length} itens`}
        </button>
      )}
    </div>
  );
}

function PautaCamara({ id }: { id: number }) {
  const q = usePautaCamara(id);
  if (q.isLoading) return <Skeleton className="h-20" />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.materias?.length) return <p className="text-sm text-muted">Nenhum item de pauta publicado.</p>;
  return <MateriaList materias={q.materias} limit={6} />;
}

export function VotacoesCamara({ id, compact }: { id: number; compact?: boolean }) {
  const q = useVotacoesEvento(id);
  if (q.isLoading) return <Skeleton className="h-16" />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data?.length) return compact ? null : <p className="text-sm text-muted">Nenhuma votação registrada.</p>;
  return (
    <ul className="space-y-1.5">
      {q.data.map((v) => (
        <li key={v.id} className="flex items-start gap-2 text-sm">
          {v.aprovacao === 1 ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-verde" aria-label="Aprovado" />
            : v.aprovacao === 0 ? <XCircle className="mt-0.5 size-4 shrink-0 text-vermelho" aria-label="Rejeitado" />
            : <span className="mt-1.5 size-2 shrink-0 rounded-full bg-muted" aria-hidden />}
          <Link to={`/votacao/${v.id}`} className="hover:underline">{v.descricao ?? v.id}</Link>
        </li>
      ))}
    </ul>
  );
}

function Hora({ ev }: { ev: AgendaEvento }) {
  return (
    <div className="w-14 shrink-0 text-center">
      <div className="text-lg font-bold tabular-nums leading-none">{ev.hora}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted">{CASA_LABEL[ev.casa]}</div>
    </div>
  );
}

export function EventoCard({ ev }: { ev: AgendaEvento }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const st = STATUS[ev.status];
  const temDetalhe = ev.camaraId != null || ev.materias.length > 0;
  return (
    <motion.article
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -8 }}
      className={clsx("card relative overflow-hidden p-4", ev.status === "cancelada" && "opacity-70")}
    >
      <span aria-hidden className={clsx("absolute inset-y-0 left-0 w-1", ev.casa === "camara" ? "bg-verde" : "bg-azul")} />
      <div className="flex gap-3">
        <Hora ev={ev} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={ev.ambito === "plenario" ? "verde" : "neutro"}>{ev.ambito === "plenario" ? "Plenário" : "Comissão"}</Badge>
            {ev.deliberativa && <Badge tone="amarelo">Com votação</Badge>}
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
          <h3 className={clsx("mt-1.5 font-semibold leading-snug", ev.status === "cancelada" && "line-through")}>{ev.titulo}</h3>
          <p className="text-sm text-muted">{ev.orgaoSigla && ev.orgaoSigla !== "PLEN" ? `${ev.orgaoSigla} · ` : ""}{ev.orgao}</p>
          {ev.descricao && <p className="mt-1 line-clamp-2 text-sm text-pretty">{ev.descricao}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            {ev.local && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{ev.local}</span>}
            {ev.fim && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />até {ev.fim.slice(11)}</span>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <ExternalLink href={ev.fonte}>Fonte oficial</ExternalLink>
            {ev.video && <a href={ev.video} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline"><PlayCircle className="size-4" aria-hidden />Vídeo</a>}
            {ev.pautaUrl && <a href={ev.pautaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline"><FileText className="size-4" aria-hidden />Pauta (PDF)</a>}
            <button type="button" onClick={() => baixarICS(ev)} className="inline-flex items-center gap-1 text-accent hover:underline" title={TIPS.ics}>
              <CalendarPlus className="size-4" aria-hidden />Adicionar à agenda
            </button>
            {temDetalhe && (
              <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="ml-auto inline-flex items-center gap-1 font-medium hover:underline">
                {open ? "Fechar" : ev.materias.length ? `Pauta (${ev.materias.length})` : "Pauta e votações"}
                <ChevronDown className={clsx("size-4 transition-transform", open && "rotate-180")} aria-hidden />
              </button>
            )}
          </div>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={reduce ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={reduce ? undefined : { height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-4 border-t border-line pt-4">
                  <Bloco titulo="Pauta" tip={TIPS.pauta}>
                    {ev.camaraId != null ? <PautaCamara id={ev.camaraId} /> : <MateriaList materias={ev.materias} limit={8} />}
                  </Bloco>
                  {ev.camaraId != null && ev.status !== "agendada" && (
                    <Bloco titulo="Votações registradas"><VotacoesCamara id={ev.camaraId} /></Bloco>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.article>
  );
}

export function Bloco({ titulo, tip, children }: { titulo: ReactNode; tip?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {titulo}{tip && <Tip content={tip} />}
      </h4>
      {children}
    </div>
  );
}

export function ListaEventos({ eventos, vazio }: { eventos: AgendaEvento[]; vazio: ReactNode }) {
  if (!eventos.length) return <EmptyState title={vazio} hint="Tente outro dia, outra semana ou remova filtros." />;
  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {eventos.map((e) => <EventoCard key={e.id} ev={e} />)}
      </AnimatePresence>
    </div>
  );
}
