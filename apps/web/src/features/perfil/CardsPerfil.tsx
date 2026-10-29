// Cartões do perfil "para leigos": resumo em frases, dinheiro enviado, municípios beneficiados.
import { motion, useReducedMotion } from "motion/react";
import { HandCoins, MapPin, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Autor } from "@emenda/contracts";
import { Card, EmptyState, Skeleton, Tip } from "@/ui";
import { BarraTipos, ListaVerMais, topPorTipo } from "@/features/linguagem";
import { formatBRL, formatNumber } from "@/lib/format";
import { perfilEmendas, topMunicipios } from "./resumo";
import { nomeProprio } from "@/features/emendas/historias";

const brl = (n: number) => formatBRL(Math.round(n), true);

export function ResumoSimplesCard({ frases, carregando }: { frases: string[]; carregando?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <section aria-labelledby="resumo-simples" className="card relative mb-6 overflow-hidden border-l-4 border-l-verde p-5">
      <h2 id="resumo-simples" className="mb-3 flex items-center gap-2 text-base font-semibold">
        <Sparkles className="size-5 text-accent" aria-hidden />Em poucas palavras
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
      {significa && <p className="-mt-1 mb-3 max-w-3xl text-sm text-muted">{significa}</p>}
      {children}
    </section>
  );
}

export function BlocoEmendas({ autor, carregando, semCorrespondencia }: { autor?: Autor; carregando: boolean; semCorrespondencia: boolean }) {
  if (semCorrespondencia) return <EmptyState title="Não achamos dinheiro mandado por este nome." hint="Suplentes e quem acabou de assumir podem ainda não ter valores pagos." />;
  if (carregando || !autor) return <Skeleton className="h-48" />;
  const p = perfilEmendas(autor.emendas);
  const top = topMunicipios(autor.emendas, 50);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.1fr]">
      <Card>
        <p className="text-sm text-muted">Mandou, já pago <Tip content="Emendas parlamentares: parte do Orçamento federal que o político escolhe para onde vai. Inclui valores de anos anteriores pagos depois." /></p>
        <p className="font-display text-4xl font-bold tabular">{brl(p.pago)}</p>
        <p className="mb-4 text-sm text-muted">para {formatNumber(p.municipios)} cidades{p.funcao ? <>, mais para <b className="text-fg">{p.funcao}</b></> : null}</p>
        <BarraTipos porTipo={autor.porTipo} detalhe={(t) => ({ titulo: "Para onde foi", itens: topPorTipo(autor.emendas, t, "destino").map((x) => ({ ...x, nome: nomeProprio(x.nome) })), verMais: `/autor/${autor.codigo}?tab=emendas#detalhes` })} />
        <p className="mt-4 text-sm"><Link className="link" to={`/autor/${autor.codigo}`}>Ver cada indicação e quem recebeu →</Link></p>
      </Card>
      <Card title={<span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden />Cidades que mais receberam</span>}>
        <ListaVerMais itens={top} inicial={5} chave={(m) => m.ibge} className="divide-y divide-line"
          vazio={<EmptyState title="Sem cidades identificadas." />}
          render={(m, i) => (
            <Link to={`/municipio/${m.ibge}`} className="flex items-center gap-3 py-2 hover:text-accent">
              <span className="w-5 text-right text-xs text-muted tabular">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{nomeProprio(m.nome.replace(/ - [A-Z]{2}$/, ""))}</span>
              <b className="tabular">{brl(m.valor)}</b>
            </Link>
          )} />
      </Card>
    </div>
  );
}

export interface TilePerfil { href: string; icon: ReactNode; rotulo: string; valor: ReactNode; sub?: ReactNode }
/** 4 atalhos grandes do perfil: cada um responde uma pergunta e leva à seção. */
export function TilesPerfil({ itens }: { itens: TilePerfil[] }) {
  return (
    <nav aria-label="Resumo do perfil" className="mb-8 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {itens.map((t) => (
        <a key={t.href} href={t.href} className="card press group flex flex-col gap-1 p-3.5 transition hover:border-accent sm:p-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-muted"><span className="rounded-lg bg-verde/12 p-1.5 text-accent">{t.icon}</span>{t.rotulo}</span>
          <span className="font-display text-2xl font-bold tabular sm:text-3xl">{t.valor}</span>
          {t.sub && <span className="text-xs text-muted">{t.sub}</span>}
        </a>
      ))}
    </nav>
  );
}

export const IconeDinheiro = <HandCoins className="size-5" aria-hidden />;
