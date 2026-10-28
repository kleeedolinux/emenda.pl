import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft, ArrowRight, BookOpen, CalendarClock, CircleDollarSign, EyeOff, FileText, Gavel, Hourglass, Landmark, ListChecks, Repeat, Scale, Users, Vote, Zap,
  type LucideIcon,
} from "lucide-react";
import { Link, useParams } from "react-router";
import { Card, EmptyState, ExternalLink, NextSteps, PageHeader, Reveal } from "@/ui";
import { AutoLink } from "@/features/links";
import { TEMAS, temaPorSlug, vizinhos, type Tema } from "@/features/entenda/temas";
import { DiagramaPassos } from "@/features/entenda/Diagrama";
import { NumerosTema } from "@/features/entenda/Numeros";
import { TrocasLegislatura } from "@/features/perfil/Trocas";

const ICONE: Record<string, LucideIcon> = {
  "o-que-e-emenda": BookOpen, "emenda-individual": Users, "emenda-pix": Zap, "emenda-de-bancada": Landmark, "emenda-de-comissao": ListChecks,
  "emenda-de-relator": EyeOff, "ciclo-do-dinheiro": CircleDollarSign, "o-que-esta-aberto": Hourglass, "como-ler-uma-votacao": Vote,
  "tipos-de-proposicao": FileText, "como-uma-lei-nasce": Gavel, mandatos: CalendarClock, "troca-de-partido": Repeat,
};
const icone = (slug: string) => ICONE[slug] ?? Scale;

export default function EntendaPage() {
  const { tema } = useParams();
  if (!tema) return <Hub />;
  const t = temaPorSlug(tema);
  if (!t) return <EmptyState title="Tema não encontrado." hint={<Link className="link" to="/entenda">Ver todos os temas</Link>} />;
  return <TemaView t={t} />;
}

function Hub() {
  const grupos = ["Dinheiro", "Congresso"] as const;
  return (
    <>
      <PageHeader eyebrow="Entenda" title="Orçamento e Congresso, sem juridiquês"
        subtitle="Explicações curtas, com desenhos e números reais, para quem quer acompanhar emendas, votações e leis. Cada tema traz os links das fontes oficiais."
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Entenda" }]} />
      {grupos.map((g) => (
        <section key={g} className="mb-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-muted">{g === "Dinheiro" ? "Dinheiro das emendas" : "Como o Congresso funciona"}</h2>
          <Reveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TEMAS.filter((t) => t.grupo === g).map((t) => {
              const I = icone(t.slug);
              return (
                <Reveal.Item key={t.slug}>
                  <Link to={`/entenda/${t.slug}`} className="card group flex h-full gap-3 p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                    <span className="h-fit rounded-xl bg-verde/12 p-2.5 text-accent"><I className="size-5" aria-hidden /></span>
                    <span className="min-w-0">
                      <span className="block font-display text-lg font-semibold">{t.titulo}</span>
                      <span className="mt-1 block text-sm text-muted">{t.resumo}</span>
                    </span>
                  </Link>
                </Reveal.Item>
              );
            })}
          </Reveal>
        </section>
      ))}
    </>
  );
}

function TemaView({ t }: { t: Tema }) {
  const reduce = useReducedMotion();
  const { anterior, proximo } = vizinhos(t.slug);
  const I = icone(t.slug);
  return (
    <>
      <PageHeader eyebrow={<>Entenda · {t.grupo}</>} title={t.titulo} subtitle={t.resumo}
        media={<span className="hidden rounded-2xl bg-verde/12 p-3 text-accent sm:block"><I className="size-8" aria-hidden /></span>}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Entenda", to: "/entenda" }, { label: t.titulo }]} />

      <Card className="mb-6" title="Passo a passo">
        <div className="hidden md:block"><DiagramaPassos passos={t.passos} /></div>
        <ol className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
          {t.passos.map((p, i) => (
            <motion.li key={p.titulo} className="rounded-xl border border-line bg-surface-2/40 p-4"
              initial={reduce ? false : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.4 }}>
              <p className="mb-1 flex items-center gap-2 font-semibold"><span className="grid size-6 place-items-center rounded-full bg-verde text-xs text-white">{i + 1}</span>{p.titulo}</p>
              <AutoLink as="p" className="text-sm text-muted" text={p.texto} />
            </motion.li>
          ))}
        </ol>
      </Card>

      {t.detalhes?.length ? (
        <Card className="mb-6" title="Para entender o debate">
          <div className="max-w-3xl space-y-3 text-pretty">{t.detalhes.map((d) => <AutoLink as="p" key={d} text={d} />)}</div>
        </Card>
      ) : null}

      {t.numeros && <div className="mb-6"><NumerosTema numeros={t.numeros} /></div>}
      {t.slug === "troca-de-partido" && <div className="mb-6"><TrocasLegislatura /></div>}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card title="Fontes oficiais">
          <ul className="space-y-2 text-sm">{t.fontes.map((f) => <li key={f.href}><ExternalLink href={f.href}>{f.label}</ExternalLink></li>)}</ul>
        </Card>
        <Card title="Veja na prática">
          <ul className="space-y-2 text-sm">{t.veja.map((v) => <li key={v.to}><Link className="link inline-flex items-center gap-1" to={v.to}>{v.label}<ArrowRight className="size-3.5" aria-hidden /></Link></li>)}</ul>
        </Card>
      </div>

      <nav aria-label="Outros temas" className="flex flex-wrap justify-between gap-3">
        {anterior ? <Link className="link inline-flex items-center gap-1" to={`/entenda/${anterior.slug}`}><ArrowLeft className="size-4" aria-hidden />{anterior.titulo}</Link> : <span />}
        {proximo && <Link className="link inline-flex items-center gap-1" to={`/entenda/${proximo.slug}`}>{proximo.titulo}<ArrowRight className="size-4" aria-hidden /></Link>}
      </nav>
      <NextSteps title="Outros temas" items={TEMAS.filter((x) => x.slug !== t.slug).slice(0, 3).map((x) => ({ to: `/entenda/${x.slug}`, label: x.titulo, desc: x.resumo }))} />
    </>
  );
}
