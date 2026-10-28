import { dataPath, type AutorResumo, type Brasil, type Meta, type Uf } from "@emenda/contracts";
import { ArrowRight, BookOpen, Clock, Database, GitFork, Zap, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { AutoresGrid } from "@/features/emendas/AutoresGrid";
import { Comparar } from "@/features/emendas/Comparar";
import { CarrosselRankings, Descubra } from "@/features/emendas/Descubra";
import { useFiltros, useNaVista } from "@/features/emendas/explorador";
import { FiltrosBar } from "@/features/emendas/Filtros";
import { HeroEmendas } from "@/features/emendas/Hero";
import { Repositorio } from "@/features/emendas/Repositorio";
import { useApi } from "@/lib/data";
import { ErrorState, liftable, Reveal, Section, Skeleton, TransitionLink } from "@/ui";
import { Link } from "react-router";

const ANOS_PADRAO = Array.from({ length: 13 }, (_, i) => 2014 + i);

const CTAS: Array<{ to: string; icon: LucideIcon; t: string; d: string; cor: string }> = [
  { to: "/pix", icon: Zap, t: "Emenda Pix", d: "O dinheiro que cai direto na conta da prefeitura.", cor: "#e0b800" },
  { to: "/ultimas", icon: Clock, t: "Últimos pagamentos", d: "O feed do que foi pago mês a mês.", cor: "#009c3b" },
  { to: "/entenda/o-que-e-emenda", icon: BookOpen, t: "O que é emenda?", d: "Explicado em 2 minutos, sem juridiquês.", cor: "#2f80ed" },
  { to: "/dinheiro", icon: GitFork, t: "Siga o dinheiro", d: "Do tipo de emenda à área e ao estado.", cor: "#002776" },
];

export default function EmendasPage() {
  const meta = useApi<Meta>(dataPath.meta());
  const brasil = useApi<Brasil>(dataPath.brasil());
  const autores = useApi<AutorResumo[]>(dataPath.autores());
  const { f, set } = useFiltros();
  const ufQ = useApi<Uf>(f.uf ? dataPath.uf(f.uf) : null);
  const uf = f.uf ? (ufQ.data ?? null) : null;
  const anos = meta.data?.anos ?? ANOS_PADRAO;
  const [repoRef, repoVisto] = useNaVista<HTMLDivElement>("600px");

  return (
    <>
      <nav aria-label="Trilha de navegação" className="mb-4 text-sm text-muted">
        <Link className="hover:text-fg hover:underline" to="/">Início</Link> <span aria-hidden>›</span> <span aria-current="page" className="text-fg">Emendas</span>
      </nav>

      <HeroEmendas meta={meta.data} />
      <FiltrosBar f={f} set={set} anos={anos} brasil={brasil.data} uf={uf} />
      {(brasil.isError || ufQ.isError) && <div className="mt-4"><ErrorState error={brasil.error ?? ufQ.error} retry={() => { void brasil.refetch(); void ufQ.refetch(); }} /></div>}

      <Section id="descubra" title="Descubra">
        <Descubra f={f} brasil={brasil.data} autores={autores.data} uf={uf} />
      </Section>

      <Section id="agora" title="Quem está recebendo agora" tip="Pagamentos de emendas por mês, do Portal da Transparência. Deslize para ver 1, 3 e 12 meses.">
        <CarrosselRankings f={f} />
      </Section>

      <Section id="comparar" title="Compare" tip="Escolha dois parlamentares ou dois municípios. O link compartilhado abre a mesma comparação.">
        <Comparar autores={autores.data} />
      </Section>

      <Section id="autores" title="Quem mais indicou" tip="Parlamentares pelo valor pago. Bancadas, comissões e relator aparecem ao filtrar pelo tipo — ou no modo repositório.">
        <AutoresGrid f={f} autores={autores.data} uf={uf} anos={anos} />
      </Section>

      <Section title="Continue explorando">
        <Reveal className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {CTAS.map((c) => (
            <Reveal.Item key={c.to}>
              <motion.div {...liftable} className="h-full">
                <TransitionLink to={c.to} className="card press group relative flex h-full flex-col gap-2 overflow-hidden p-4 transition-colors hover:border-accent sm:gap-3 sm:p-5">
                  <span className="inline-flex size-10 items-center justify-center rounded-xl text-white" style={{ background: c.cor }}><c.icon className="size-5" aria-hidden /></span>
                  <span className="font-bold sm:text-lg">{c.t}</span>
                  <span className="text-xs text-muted sm:text-sm">{c.d}</span>
                  <ArrowRight className="mt-auto size-5 text-accent transition-transform group-hover:translate-x-1" aria-hidden />
                </TransitionLink>
              </motion.div>
            </Reveal.Item>
          ))}
        </Reveal>
      </Section>

      <Section id="repositorio" title={<span className="inline-flex items-center gap-2"><Database className="size-5 text-muted" aria-hidden />Modo repositório</span>} tip="Tabelas completas com ordenação, busca e download em CSV.">
        <p className="-mt-2 mb-4 text-sm text-muted">Para quem quer os dados brutos: todas as linhas, ordenáveis e exportáveis.</p>
        <div ref={repoRef} className="min-h-[32rem]">
          {repoVisto ? <Repositorio brasil={brasil.data} autores={autores.data} autoresErro={autores.error} tipo={f.tipo} /> : <Skeleton className="h-[32rem]" />}
        </div>
      </Section>
    </>
  );
}
