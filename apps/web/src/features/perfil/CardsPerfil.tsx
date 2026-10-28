// Cartões do perfil "para leigos": resumo em frases, dinheiro enviado, municípios beneficiados.
import { motion, useReducedMotion } from "motion/react";
import { HandCoins, Lightbulb, MapPin, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Autor } from "@emenda/contracts";
import { Bars, Card, EmptyState, Skeleton, Stat, StatGrid, Tip } from "@/ui";
import { formatBRL, formatNumber, formatPct } from "@/lib/format";
import { perfilEmendas, topMunicipios } from "./resumo";

const brl = (n: number) => formatBRL(Math.round(n), true);

export function ResumoSimplesCard({ frases, carregando }: { frases: string[]; carregando?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <section aria-labelledby="resumo-simples" className="card relative mb-6 overflow-hidden border-l-4 border-l-verde p-5">
      <h2 id="resumo-simples" className="mb-3 flex items-center gap-2 text-base font-semibold">
        <Sparkles className="size-5 text-accent" aria-hidden />Resumo em linguagem simples
        <Tip content="Texto gerado automaticamente a partir dos dados oficiais da Câmara/Senado e do Portal da Transparência. Os números completos estão nas seções abaixo." />
      </h2>
      <div className="space-y-2 text-lg leading-relaxed text-pretty">
        {frases.map((f, i) => (
          <motion.p key={f} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12, duration: 0.4 }}>{f}</motion.p>
        ))}
        {carregando && <Skeleton className="h-6 w-2/3" />}
      </div>
    </section>
  );
}

/** Seção com ícone e "o que isso significa?". */
export function SecaoLeiga({ icon, titulo, significa, children, id }: { icon: ReactNode; titulo: ReactNode; significa?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mb-8 scroll-mt-24">
      <h2 className="mb-3 flex flex-wrap items-center gap-2 text-xl font-bold">
        <span className="rounded-xl bg-verde/12 p-2 text-accent">{icon}</span>{titulo}
      </h2>
      {significa && (
        <p className="mb-4 flex max-w-3xl items-start gap-2 rounded-xl bg-amarelo/10 px-3 py-2 text-sm">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-amarelo" aria-hidden /><span><b>O que isso significa?</b> {significa}</span>
        </p>
      )}
      {children}
    </section>
  );
}

export function BlocoEmendas({ autor, carregando, semCorrespondencia }: { autor?: Autor; carregando: boolean; semCorrespondencia: boolean }) {
  if (semCorrespondencia) return <EmptyState title="Não encontramos este nome entre os autores de emendas do Portal da Transparência." hint="Suplentes e parlamentares recém-empossados podem ainda não ter emendas pagas." />;
  if (carregando || !autor) return <Skeleton className="h-48" />;
  const p = perfilEmendas(autor.emendas);
  const top = topMunicipios(autor.emendas, 10);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <Card>
        <StatGrid>
          <Stat label="Pago (todas as emendas)" tip="pago" value={brl(p.pago)} hint={`${formatNumber(autor.totais.n)} emendas`} />
          <Stat label="Via Emenda Pix" tip="emenda pix" value={formatPct(p.pctPix)} hint="do valor pago" />
          <Stat label="Área principal" tip="função orçamentária" value={<span className="text-base">{p.funcao ?? "—"}</span>} />
          <Stat label="Municípios atendidos" value={formatNumber(p.municipios)} />
        </StatGrid>
        <p className="mt-4 text-sm"><Link className="link" to={`/autor/${autor.codigo}`}>Ver cada emenda, favorecidos e anos →</Link></p>
      </Card>
      <Card title={<span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden />Municípios que mais receberam</span>}>
        {top.length ? <Bars data={top.map((m) => ({ label: m.nome, value: m.valor, href: `/municipio/${m.ibge}` }))} format={brl} /> : <EmptyState title="Sem municípios identificados." />}
      </Card>
    </div>
  );
}

export const IconeDinheiro = <HandCoins className="size-5" aria-hidden />;
