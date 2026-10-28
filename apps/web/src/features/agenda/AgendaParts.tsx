import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarPlus, CheckCircle2, ChevronDown, FileText, PlayCircle, XCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ExternalLink, Skeleton, Tip } from "@/ui";
import { ShareButton } from "@/features/share";
import { icsFilename, toICS, type AgendaEvento, type Materia } from "./agenda";
import { eventoShare, materiaShare, resultadoShare } from "./compartilhar";
import { usePautaCamara, useVotacoesEvento } from "./useAgenda";

export const TIPS = {
  pauta: "A pauta é a lista de assuntos (projetos, requerimentos, PECs) que estão marcados para serem discutidos ou votados numa sessão ou reunião. Estar na pauta não garante votação: itens podem ser adiados ou retirados.",
  plenario: "O Plenário reúne todos os parlamentares da Casa (513 deputados ou 81 senadores). É onde as decisões finais de cada Casa são tomadas.",
  comissao: "Comissões são grupos menores de parlamentares especializados num tema (saúde, economia, justiça…). Analisam os projetos antes do Plenário e, às vezes, aprovam projetos sozinhas (caráter conclusivo).",
  deliberativa: "Sessão ou reunião deliberativa é aquela em que há votação. Sessões não deliberativas servem para debates, homenagens e discursos, sem decisões.",
  ics: "Baixa um arquivo .ics que você abre no Google Agenda, Outlook ou no calendário do celular para ser lembrado do evento.",
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

/** Selo C/S da Casa. */
export function CasaChip({ casa }: { casa: AgendaEvento["casa"] }) {
  return (
    <span title={CASA_LABEL[casa]} className={clsx("inline-flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white", casa === "camara" ? "bg-verde" : "bg-azul")}>
      {casa === "camara" ? "C" : "S"}<span className="sr-only">{CASA_LABEL[casa]}</span>
    </span>
  );
}

function MateriaLink({ m }: { m: Materia }) {
  const cls = "font-semibold text-accent hover:underline";
  if (!m.href) return <span className="font-semibold">{m.sigla}</span>;
  return m.href.startsWith("/") ? <Link className={cls} to={m.href}>{m.sigla}</Link> : <ExternalLink href={m.href} className={cls}>{m.sigla}</ExternalLink>;
}

/** Itens de pauta compactos; com `ev`, cada item ganha botão de compartilhar. */
export function MateriaList({ materias, limit, ev }: { materias: Materia[]; limit?: number; ev?: AgendaEvento }) {
  const [all, setAll] = useState(false);
  const shown = limit && !all ? materias.slice(0, limit) : materias;
  return (
    <div>
      <ol className="divide-y divide-line/70">
        {shown.map((m, i) => (
          <li key={`${m.id}-${i}`} className="flex items-start gap-2 py-1.5 text-sm" title={m.relator ? `Relator: ${m.relator.replace(/^Relator:\s*/i, "")}` : undefined}>
            <div className="min-w-0 flex-1">
              <span className="mr-1.5"><MateriaLink m={m} /></span>
              {m.regime && <span className="mr-1.5 text-xs text-muted">{m.regime}</span>}
              {m.ementa && <span className="line-clamp-2 text-pretty text-muted">{m.ementa}</span>}
            </div>
            {ev && <ShareButton compact label="Compartilhar item da pauta" {...materiaShare(ev, m)} />}
          </li>
        ))}
      </ol>
      {limit && materias.length > limit && (
        <button type="button" onClick={() => setAll(!all)} className="mt-1 text-xs font-medium text-accent hover:underline">
          {all ? "Mostrar menos" : `+${materias.length - limit} itens`}
        </button>
      )}
    </div>
  );
}

export function PautaCamara({ ev, limit = 6 }: { ev: AgendaEvento; limit?: number }) {
  const q = usePautaCamara(ev.camaraId);
  if (q.isLoading) return <Skeleton className="h-10" />;
  if (q.error) return <p className="text-xs text-muted">Pauta indisponível no momento.</p>;
  if (!q.materias?.length) return <p className="text-xs text-muted">Pauta ainda não publicada.</p>;
  return <MateriaList materias={q.materias} limit={limit} ev={ev} />;
}

/** Votações registradas num evento da Câmara, com compartilhar resultado. `null` quando não há. */
export function VotacoesCamara({ id, compact, limit }: { id: number; compact?: boolean; limit?: number }) {
  const q = useVotacoesEvento(id);
  const [all, setAll] = useState(false);
  if (q.isLoading) return compact ? null : <Skeleton className="h-8" />;
  if (q.error || !q.data?.length) return compact ? null : <p className="text-xs text-muted">Nenhuma votação registrada.</p>;
  return (
    <>
    <ul className="divide-y divide-line/70">
      {(limit && !all ? q.data.slice(0, limit) : q.data).map((v) => (
        <li key={v.id} className="flex items-start gap-2 py-1.5 text-sm">
          {v.aprovacao === 1 ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-verde" aria-label="Aprovado" />
            : v.aprovacao === 0 ? <XCircle className="mt-0.5 size-4 shrink-0 text-vermelho" aria-label="Rejeitado" />
            : <span className="mt-1.5 size-2 shrink-0 rounded-full bg-muted" aria-hidden />}
          <Link to={`/votacao/${v.id}`} className="line-clamp-2 min-w-0 flex-1 hover:underline">{v.descricao ?? v.id}</Link>
          <ShareButton compact label="Compartilhar resultado" {...resultadoShare(v)} />
        </li>
      ))}
    </ul>
    {limit && q.data.length > limit && (
      <button type="button" onClick={() => setAll(!all)} className="text-xs font-medium text-accent hover:underline">{all ? "Mostrar menos" : `+${q.data.length - limit} votações`}</button>
    )}
    </>
  );
}

function Detalhes({ ev }: { ev: AgendaEvento }) {
  const link = "inline-flex items-center gap-1 text-accent hover:underline";
  return (
    <div className="space-y-2 pb-3 pl-2 pr-1 pt-1 text-sm sm:pl-[4.75rem]">
      {ev.descricao && <p className="text-pretty text-muted">{ev.descricao}</p>}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>{ev.orgao}</span>
        {ev.local && <span>{ev.local}</span>}
        {ev.fim && <span>até {ev.fim.slice(11)}</span>}
        <ExternalLink href={ev.fonte}>Fonte</ExternalLink>
        {ev.video && <a href={ev.video} target="_blank" rel="noreferrer" className={link}><PlayCircle className="size-3.5" aria-hidden />Vídeo</a>}
        {ev.pautaUrl && <a href={ev.pautaUrl} target="_blank" rel="noreferrer" className={link}><FileText className="size-3.5" aria-hidden />Pauta (PDF)</a>}
        <button type="button" onClick={() => baixarICS(ev)} className={link} title={TIPS.ics}><CalendarPlus className="size-3.5" aria-hidden />.ics</button>
      </p>
      {(ev.camaraId != null || ev.materias.length > 0) && (
        <div>
          <h4 className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Pauta <Tip content={TIPS.pauta} /></h4>
          {ev.camaraId != null ? <PautaCamara ev={ev} limit={8} /> : <MateriaList materias={ev.materias} limit={8} ev={ev} />}
        </div>
      )}
      {ev.camaraId != null && ev.status !== "agendada" && (
        <div>
          <h4 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Votações</h4>
          <VotacoesCamara id={ev.camaraId} />
        </div>
      )}
    </div>
  );
}

/** Linha compacta: hora | Casa | órgão | título; expande para pauta e detalhes. */
export function EventoLinha({ ev, destaque }: { ev: AgendaEvento; destaque?: boolean }) {
  const [open, setOpen] = useState(!!destaque);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!destaque) return;
    setOpen(true);
    const t = setTimeout(() => ref.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }), 150);
    return () => clearTimeout(t);
  }, [destaque, reduce]);
  const org = ev.orgaoSigla === "PLEN" || ev.ambito === "plenario" ? "Plenário" : ev.orgaoSigla || ev.orgao;
  const cancel = ev.status === "cancelada";
  return (
    <li ref={ref} id={`ev-${ev.id}`} className={clsx("rounded-lg", destaque && "bg-amarelo/10 ring-2 ring-amarelo", open && !destaque && "bg-surface-2/60")}>
      <div className="flex items-center gap-1">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
          <span className="w-11 shrink-0 font-semibold tabular-nums">{ev.hora}</span>
          <CasaChip casa={ev.casa} />
          <span className={clsx("hidden w-16 shrink-0 truncate text-xs font-medium sm:block", ev.ambito === "plenario" ? "text-accent" : "text-muted")} title={ev.orgao}>{org}</span>
          <span className={clsx("min-w-0 flex-1 truncate", cancel && "text-muted line-through")}>
            {ev.titulo}{ev.descricao && <span className="text-muted"> · {ev.descricao}</span>}
          </span>
          {ev.status === "em-andamento" && <span className="shrink-0 rounded bg-vermelho px-1.5 text-[10px] font-bold uppercase text-white">ao vivo</span>}
          {ev.deliberativa && !cancel && <span className="size-2 shrink-0 rounded-full bg-amarelo" title="Com votação" aria-label="Com votação" />}
          <ChevronDown className={clsx("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        <ShareButton compact label="Compartilhar evento" {...eventoShare(ev)} />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0 }} className="overflow-hidden">
            <Detalhes ev={ev} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/** Um dia: cabeçalho fixo, Plenário à vista, comissões recolhidas. */
export function DiaGrupo({ titulo, eventos, destaque, comissoesAbertas, hoje }: {
  titulo: ReactNode; eventos: AgendaEvento[]; destaque?: string | null; comissoesAbertas?: boolean; hoje?: boolean;
}) {
  const plen = eventos.filter((e) => e.ambito === "plenario");
  const com = eventos.filter((e) => e.ambito === "comissao");
  const forca = comissoesAbertas || com.some((e) => e.id === destaque) || plen.length === 0;
  const [ver, setVer] = useState(false);
  const abertas = forca || ver;
  return (
    <section>
      <h3 className={clsx("sticky top-16 z-10 -mx-1 flex items-baseline justify-between bg-bg/90 px-1 py-1 text-xs font-semibold uppercase tracking-wide backdrop-blur", hoje ? "text-accent" : "text-muted")}>
        <span>{titulo}</span><span className="font-normal normal-case tabular-nums">{eventos.length} {eventos.length === 1 ? "evento" : "eventos"}</span>
      </h3>
      <ul className="mt-0.5 space-y-0.5">
        {plen.map((e) => <EventoLinha key={e.id} ev={e} destaque={e.id === destaque} />)}
        {abertas && com.map((e) => <EventoLinha key={e.id} ev={e} destaque={e.id === destaque} />)}
      </ul>
      {com.length > 0 && !forca && (
        <button type="button" onClick={() => setVer(!ver)} aria-expanded={ver} className="ml-2 mt-0.5 text-xs font-medium text-accent hover:underline">
          {ver ? "esconder comissões" : `mostrar comissões (${com.length})`}
        </button>
      )}
    </section>
  );
}
