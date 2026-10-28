import { dataPath, UF_POR_CODIGO, UFS, type AutorResumo, type Brasil, type Meta, type SiglaUf, type Totais } from "@emenda/contracts";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Banknote, Building2, FileCheck2, Gavel, HandCoins, Landmark, MapPinned, Search, Users, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { preload } from "react-dom";
import { Link, useNavigate } from "react-router";
import { HeroBrasil, preloadHeroScene } from "@/features/geo/HeroBrasil";
import { Ticker } from "@/features/geo/hero/HeroTicker";
import { TotaisGrid } from "@/features/emendas/Totais";
import { RankingsRecentes } from "@/features/feed/components";
import { Choropleth } from "@/features/geo/Choropleth";
import { ibge, useApi } from "@/lib/data";
import { formatBRL, formatDate, formatNumber } from "@/lib/format";
import { Bars, Card, CountUp, EmptyState, ErrorState, easing, liftable, spring, NumberRoll, openSearch, Reveal, RevealText, Section, Skeleton, Term, TransitionLink } from "@/ui";

type Metric = "pago" | "empenhado" | "n" | "pix";
const METRICS: { id: Metric; label: string }[] = [
  { id: "pago", label: "Pago" },
  { id: "empenhado", label: "Empenhado" },
  { id: "n", label: "Nº de emendas" },
  { id: "pix", label: "Emenda Pix" },
];

export default function Home() {
  const brasil = useApi<Brasil>(dataPath.brasil());
  const meta = useApi<Meta>(dataPath.meta());
  const autores = useApi<AutorResumo[]>(dataPath.autores());
  const [section, setSection] = useState<HTMLElement | null>(null);
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const peso = useMemo(() => (brasil.data ? Object.fromEntries(brasil.data.porUf.map((u) => [u.uf, u.pago])) : undefined), [brasil.data]);
  // A cena entra depois do primeiro quadro ocioso: texto e busca pintam primeiro (LCP/TBT).
  const [sceneReady, setSceneReady] = useState(false);
  useEffect(() => {
    preloadHeroScene();
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) { const id = w.requestIdleCallback(() => setSceneReady(true), { timeout: 900 }); return () => window.cancelIdleCallback?.(id); }
    const t = setTimeout(() => setSceneReady(true), 200);
    return () => clearTimeout(t);
  }, []);
  preload(ibge.malhaBrasilUF(), { as: "fetch", crossOrigin: "anonymous" });

  return (
    <>
      <section ref={setSection} aria-labelledby="hero-title" className="hero relative isolate -mt-8 ml-[calc(50%-50vw)] w-screen overflow-hidden sm:-mt-10">
        {/* céu: amanhecer -> dia (opacidade, GPU) + sol + grão */}
        <div className="absolute inset-0 -z-10" aria-hidden>
          <div className="hero-sky-a absolute inset-0" />
          <div className="hero-sky-b absolute inset-0" />
          <div className="hero-sun absolute left-[38%] top-[44%] size-[min(70vw,720px)] -translate-x-1/2 rounded-full" />
        </div>
        {section && sceneReady && <HeroBrasil section={section} anchor={anchor} pesoPorUf={peso} />}
        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-x-10 gap-y-5 px-4 pb-[215px] pt-8 sm:px-6 sm:pb-[300px] sm:pt-12 lg:grid-cols-[1.08fr_1fr] lg:pb-[250px] lg:pt-10">
          <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
            <motion.p
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: easing.out }}
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-azul shadow-sm backdrop-blur-md sm:text-xs dark:border-white/10 dark:bg-white/5 dark:text-amarelo"
            >
              <span className="size-1.5 rounded-full bg-verde" aria-hidden />Brasil transparente · dados oficiais
            </motion.p>
            <RevealText as="h1" className="text-[2.6rem] font-bold leading-[1.02] tracking-[-0.03em] text-balance sm:text-6xl lg:text-7xl" delay={0.1}>
              {"Siga o dinheiro das"}
              <FlagWord>emendas.</FlagWord>
            </RevealText>
            {/* sem animação: é o elemento de LCP no celular */}
            <p
              className="mt-4 max-w-xl text-base text-fg/80 text-pretty sm:mt-5 sm:text-lg"
            >
              Quem indicou, para qual cidade foi, em que foi gasto e quanto já foi <Term k="pago">pago</Term> de verdade. Explicado em português simples.
            </p>
          </div>
          <div ref={setAnchor} className="relative mx-auto aspect-[560/520] w-full max-w-[340px] sm:max-w-[500px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-[580px]" aria-hidden />
          <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: easing.out, delay: 0.7 }}>
              <HeroSearch />
            </motion.div>
            <HeroKpis b={brasil.data} m={meta.data} />
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-3 z-10 px-3 sm:px-6"><Ticker autores={autores.data} /></div>
        <div className="hero-grain pointer-events-none absolute inset-0 z-40" aria-hidden />
        <h2 id="hero-title" className="sr-only">Mapa animado: dinheiro das emendas saindo do Congresso Nacional para os estados</h2>
      </section>

      <Reveal className="relative z-10 -mt-1 mb-10 grid gap-3 pt-8 sm:grid-cols-3">
        {[
          { icon: MapPinned, t: "Busque seu município", d: "Veja quanto sua cidade recebeu, de quem e para quê.", on: () => openSearch("") },
          { icon: Users, t: "Encontre seu deputado", d: "Emendas, votações, gastos e projetos de cada parlamentar.", to: "/deputados" },
          { icon: Gavel, t: "Procure uma lei", d: "Projetos de lei, PECs e medidas provisórias em tramitação.", to: "/proposicoes" },
        ].map((x) => (
          <Reveal.Item key={x.t}>
            <motion.div {...liftable} className="h-full">
              {x.to ? (
                <TransitionLink to={x.to} className="card press group relative flex h-full items-start gap-3 p-5 transition-colors hover:border-accent"><EntryBody {...x} /></TransitionLink>
              ) : (
                <button type="button" onClick={x.on} className="card press group relative flex h-full w-full items-start gap-3 p-5 text-left transition-colors hover:border-accent"><EntryBody {...x} /></button>
              )}
            </motion.div>
          </Reveal.Item>
        ))}
      </Reveal>

      {brasil.isError ? <ErrorState error={brasil.error} retry={() => brasil.refetch()} /> : brasil.data ? <TotaisGrid t={brasil.data.totais} /> : <KpiSkeleton />}
      {meta.data && (
        <p className="mt-3 text-xs text-muted">
          Atualizado em {formatDate(meta.data.generatedAt)} · anos {meta.data.anos[0]}–{meta.data.anos.at(-1)} · fonte: <a className="link" href={meta.data.fonte} target="_blank" rel="noopener noreferrer">Portal da Transparência</a>
        </p>
      )}

      <Section title="Mapa das emendas por estado" tip="Clique em um estado para ver municípios, autores e cada emenda.">
        {brasil.data ? <MapaBrasil b={brasil.data} /> : brasil.isPending ? <Skeleton className="h-[480px] w-full rounded-2xl" /> : null}
      </Section>

      <Section title="Quem mais indicou emendas" tip="Ranking pelo valor efetivamente pago. Inclui parlamentares, bancadas e comissões.">
        <Card>
          {autores.isPending ? <Skeleton className="h-64" /> : autores.data?.length ? (
            <>
              <Bars data={[...autores.data].sort((a, b) => b.pago - a.pago).slice(0, 12).map((a) => ({ label: a.nome, value: a.pago, href: `/autor/${encodeURIComponent(a.codigo)}`, sub: `${formatNumber(a.n)} emendas` }))} format={(n) => formatBRL(n, true)} />
              <Link to="/emendas" className="link mt-4 inline-flex items-center gap-1 text-sm font-semibold">Ver ranking completo <ArrowRight className="size-4" /></Link>
            </>
          ) : <EmptyState title="Ranking indisponível" hint="Os dados ainda estão sendo processados." />}
        </Card>
      </Section>

      <Section title="Pagas recentemente" tip="Quem teve mais emendas pagas no último mês, trimestre, semestre e ano.">
        <RankingsRecentes compacto />
        <p className="mt-3 text-sm"><Link className="link" to="/ultimas">Ver o feed das últimas emendas pagas →</Link></p>
      </Section>

      <Section title="Como funciona uma emenda">
        <ComoFunciona />
      </Section>

      <Section title="Explore">
        <Reveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { to: "/dinheiro", icon: Banknote, t: "Fluxo do dinheiro", d: "Do tipo de emenda à área de gasto e ao estado." },
            { to: "/deputados", icon: Users, t: "Deputados", d: "Perfil, votos, gastos e proposições." },
            { to: "/proposicoes", icon: FileCheck2, t: "Proposições", d: "PLs, PECs e MPs em tramitação." },
            { to: "/pix", icon: HandCoins, t: "Emenda Pix", d: "Dinheiro direto na conta das prefeituras." },
            { to: "/entenda", icon: Landmark, t: "Entenda", d: "Orçamento e Congresso sem juridiquês." },
          ].map((x) => (
            <Reveal.Item key={x.to}>
              <Link to={x.to} className="card group flex h-full flex-col gap-2 p-5 transition hover:-translate-y-0.5 hover:border-accent">
                <x.icon className="size-6 text-accent" aria-hidden />
                <span className="font-display text-lg font-semibold">{x.t}</span>
                <span className="text-sm text-muted">{x.d}</span>
                <ArrowRight className="mt-auto size-4 text-muted transition group-hover:translate-x-1 group-hover:text-accent" aria-hidden />
              </Link>
            </Reveal.Item>
          ))}
        </Reveal>
      </Section>
    </>
  );
}

function KpiSkeleton() {
  return <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>;
}

function MapaBrasil({ b }: { b: Brasil }) {
  const [metric, setMetric] = useState<Metric>("pago");
  const pixPorUf = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of b.fluxo) if (f.tipo === "pix") m.set(f.uf, (m.get(f.uf) ?? 0) + f.pago);
    return m;
  }, [b.fluxo]);
  const byUf = useMemo(() => new Map(b.porUf.map((u) => [u.uf, u])), [b.porUf]);
  const get = (u: Totais | undefined, uf: string) => (metric === "pix" ? pixPorUf.get(uf) : u?.[metric]);
  const values: Record<string, number | undefined> = {};
  for (const [cod, uf] of Object.entries(UF_POR_CODIGO)) values[cod] = get(byUf.get(uf), uf);
  const fmt = metric === "n" ? (n: number) => formatNumber(n, true) : (n: number) => formatBRL(n, true);
  const ranking = Object.entries(UF_POR_CODIGO)
    .map(([cod, uf]) => ({ label: UFS[uf], value: values[cod] ?? 0, href: `/uf/${uf}`, sub: uf }))
    .sort((a, c) => c.value - a.value);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <div role="radiogroup" aria-label="Métrica do mapa" className="mb-4 inline-flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
          {METRICS.map((m) => (
            <button key={m.id} role="radio" aria-checked={metric === m.id} onClick={() => setMetric(m.id)} className={`relative rounded-lg px-3 py-1.5 text-sm font-medium transition ${metric === m.id ? "text-fg" : "text-muted hover:text-fg"}`}>
              {metric === m.id && <motion.span layoutId="metric-pill" className="absolute inset-0 rounded-lg bg-surface shadow" />}
              <span className="relative">{m.label}</span>
            </button>
          ))}
        </div>
        <Choropleth
          url={ibge.malhaBrasilUF()}
          values={values}
          label={(c) => UFS[UF_POR_CODIGO[c] as SiglaUf] ?? c}
          href={(c) => (UF_POR_CODIGO[c] ? `/uf/${UF_POR_CODIGO[c]}` : null)}
          format={fmt}
          ariaLabel="Mapa do Brasil por estado. Selecione um estado para detalhes."
          detail={(c) => { const u = byUf.get(UF_POR_CODIGO[c] ?? ""); return u ? <p className="text-xs text-muted">{formatNumber(u.n)} emendas · clique para abrir</p> : null; }}
        />
      </Card>
      <Card title="Ranking dos estados" tip={metric === "pix" ? "emenda pix" : metric === "n" ? undefined : metric}>
        <div className="max-h-[560px] overflow-y-auto pr-1"><Bars data={ranking} format={fmt} /></div>
      </Card>
    </div>
  );
}

const PASSOS = [
  { icon: Landmark, t: "1. Indicação", d: "Deputados, senadores, bancadas e comissões indicam para onde vai parte do Orçamento da União.", k: "emenda" },
  { icon: FileCheck2, t: "2. Empenho", d: "O governo reserva o dinheiro: é a promessa formal de pagamento.", k: "empenhado" },
  { icon: Building2, t: "3. Execução", d: "Prefeitura, estado ou entidade faz a obra, compra ou serviço. O governo confere (liquidação).", k: "liquidado" },
  { icon: HandCoins, t: "4. Pagamento", d: "O dinheiro sai do cofre e chega ao favorecido. Às vezes só em anos seguintes.", k: "pago" },
  { icon: MapPinned, t: "5. Fiscalização", d: "Você confere aqui: cidade, autor, valor e quem recebeu. Emenda Pix exige atenção redobrada.", k: "emenda pix" },
];
function ComoFunciona() {
  return (
    <Reveal className="grid gap-3 md:grid-cols-5">
      {PASSOS.map((p) => (
        <Reveal.Item key={p.t} className="card relative p-5">
          <p.icon className="mb-3 size-7 text-accent" aria-hidden />
          <h3 className="font-semibold"><Term k={p.k}>{p.t}</Term></h3>
          <p className="mt-1 text-sm text-muted">{p.d}</p>
        </Reveal.Item>
      ))}
    </Reveal>
  );
}

function EntryBody({ icon: Icon, t, d }: { icon: LucideIcon; t: string; d: string }) {
  return (
    <>
      <span className="rounded-xl bg-verde/12 p-2.5 text-accent"><Icon className="size-5" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-lg font-semibold">{t}</span>
        <span className="mt-0.5 block text-sm text-muted">{d}</span>
      </span>
      <ArrowRight className="mt-1 size-4 shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-accent" aria-hidden />
    </>
  );
}

type Alvo = "municipio" | "deputado" | "lei";
function HeroSearch() {
  const [q, setQ] = useState("");
  const [alvo, setAlvo] = useState<Alvo>("municipio");
  const nav = useNavigate();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (alvo === "municipio") openSearch(v);
    else nav(`${alvo === "deputado" ? "/deputados" : "/proposicoes"}${v ? `?q=${encodeURIComponent(v)}` : ""}`);
  };
  const ph = { municipio: "Ex.: Campinas, Juazeiro do Norte…", deputado: "Ex.: nome do deputado", lei: "Ex.: reforma tributária, PL 2630" }[alvo];
  return (
    <form onSubmit={submit} role="search" className="mt-1 max-w-xl rounded-2xl lg:mt-7 border border-white/60 bg-white/70 p-2 shadow-[0_24px_60px_-24px_rgb(0_39_118/0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0b1512]/70">
      <div role="radiogroup" aria-label="O que você procura?" className="mb-2 flex gap-1 px-1 pt-1 text-sm">
        {([["municipio", "Município"], ["deputado", "Deputado"], ["lei", "Lei"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={alvo === k} onClick={() => setAlvo(k)} className={`press relative rounded-lg px-3 py-1 font-medium ${alvo === k ? "text-white" : "text-muted hover:text-fg"}`}>
            {alvo === k && <motion.span layoutId="hero-alvo" className="absolute inset-0 rounded-lg bg-verde-700" transition={spring.snappy} />}
            <span className="relative">{l}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ph} className="h-12 w-full rounded-xl bg-surface-2 pl-10 pr-3 text-base outline-none focus:ring-2 focus:ring-accent" />
        </label>
        <button type="submit" className="sheen press h-12 rounded-xl bg-verde-700 px-5 font-semibold text-white hover:bg-[#005c23]">Buscar</button>
      </div>
    </form>
  );
}

/** Título com sublinhado nas cores da bandeira, desenhado após a revelação. */
function FlagWord({ children }: { children: string }) {
  const reduce = useReducedMotion();
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span className="bg-gradient-to-r from-verde via-[#1fa24f] to-azul bg-clip-text text-transparent dark:from-[#3ddc84] dark:via-amarelo dark:to-[#8fb4ff]">{children}</span>
      <svg viewBox="0 0 300 20" preserveAspectRatio="none" className="absolute -bottom-[0.12em] left-0 h-[0.22em] w-[96%] overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="flag-ul" x1="0" x2="1">
            <stop offset="0" stopColor="#009c3b" /><stop offset="0.5" stopColor="#ffdf00" /><stop offset="1" stopColor="#002776" />
          </linearGradient>
        </defs>
        <motion.path
          d="M4,13 C60,5 120,4 170,8 S260,15 296,6"
          fill="none" stroke="url(#flag-ul)" strokeWidth="7" strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: easing.inOut, delay: 0.75 }}
        />
      </svg>
    </span>
  );
}

/** KPIs do hero: total pago, nº de emendas e o "taxímetro" desde que a página abriu. */
function HeroKpis({ b, m }: { b?: Brasil; m?: Meta }) {
  const porSegundo = b && m ? b.totais.pago / Math.max(1, m.anos.length * 365 * 86400) : 0;
  const [t0] = useState(() => Date.now());
  const [now, setNow] = useState(t0);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const desde = ((now - t0) / 1000) * porSegundo;
  const card = "rounded-2xl border border-white/60 bg-white/60 p-3 shadow-[0_10px_30px_-18px_rgb(0_39_118/0.5)] backdrop-blur-md dark:border-white/10 dark:bg-[#0b1512]/55 sm:p-4";
  return (
    <Reveal as="dl" className="mt-6 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-3" step={0.08}>
      <Reveal.Item className={card}>
        <dt className="text-xs text-muted">Pago {m ? `(${m.anos[0]}–${m.anos.at(-1)})` : ""}</dt>
        <dd className="mt-1 h-8 font-display text-xl font-bold sm:text-2xl">{b ? <CountUp value={b.totais.pago} format={(n) => formatBRL(Math.round(n), true)} /> : <Skeleton className="h-7 w-28" />}</dd>
      </Reveal.Item>
      <Reveal.Item className={card}>
        <dt className="text-xs text-muted">Emendas no período</dt>
        <dd className="mt-1 h-8 font-display text-xl font-bold sm:text-2xl">{b ? <CountUp value={b.totais.n} /> : <Skeleton className="h-7 w-20" />}</dd>
      </Reveal.Item>
      <Reveal.Item className={`${card} col-span-2 sm:col-span-1`}>
        <dt className="text-xs text-muted">Pago (média) desde que você chegou</dt>
        <dd className="mt-1 h-8 font-display text-xl font-bold text-accent sm:text-2xl" aria-live="off">{b ? <NumberRoll text={formatBRL(Math.round(desde))} /> : <Skeleton className="h-7 w-24" />}</dd>
      </Reveal.Item>
    </Reveal>
  );
}
