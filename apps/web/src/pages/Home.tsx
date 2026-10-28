import { dataPath, UF_POR_CODIGO, UFS, type AutorResumo, type Brasil, type Meta, type SiglaUf, type Totais } from "@emenda/contracts";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Banknote, Building2, FileCheck2, Gavel, HandCoins, Landmark, MapPinned, Search, Users, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { CongressoSkyline, HeroBrasil } from "@/features/geo/HeroBrasil";
import { TotaisGrid } from "@/features/emendas/Totais";
import { Choropleth } from "@/features/geo/Choropleth";
import { ibge, useApi } from "@/lib/data";
import { formatBRL, formatDate, formatNumber } from "@/lib/format";
import { Bars, Card, CountUp, EmptyState, ErrorState, openSearch, Reveal, Section, Skeleton, Term } from "@/ui";

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
  const reduce = useReducedMotion();

  return (
    <>
      <section className="relative -mx-4 -mt-8 mb-12 overflow-hidden px-4 pb-28 pt-10 hero-glow sm:-mx-6 sm:-mt-10 sm:px-6 sm:pt-14">
        <CongressoSkyline className="pointer-events-none absolute inset-x-0 bottom-0 h-32 w-full opacity-80 sm:h-44" />
        <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
          <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-semibold text-accent">
              <span className="size-1.5 rounded-full bg-verde" aria-hidden />Brasil transparente · dados oficiais
            </p>
            <h1 className="text-4xl font-bold leading-[1.05] text-balance sm:text-6xl">
              Siga o dinheiro das <span className="bg-gradient-to-r from-verde via-[#2fb35d] to-azul bg-clip-text text-transparent">emendas</span>.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted text-pretty">
              Quem indicou, para qual cidade foi, em que foi gasto e quanto já foi <Term k="pago">pago</Term> de verdade. Explicado em português simples.
            </p>
            <HeroSearch />
            {brasil.data && meta.data && <LiveCounters b={brasil.data} m={meta.data} />}
          </motion.div>
          <HeroBrasil pesoPorUf={brasil.data ? Object.fromEntries(brasil.data.porUf.map((u) => [u.uf, u.pago])) : undefined} />
        </div>
      </section>

      <Reveal className="-mt-20 mb-10 grid gap-3 sm:grid-cols-3">
        {[
          { icon: MapPinned, t: "Busque seu município", d: "Veja quanto sua cidade recebeu, de quem e para quê.", on: () => openSearch("") },
          { icon: Users, t: "Encontre seu deputado", d: "Emendas, votações, gastos e projetos de cada parlamentar.", to: "/deputados" },
          { icon: Gavel, t: "Procure uma lei", d: "Projetos de lei, PECs e medidas provisórias em tramitação.", to: "/proposicoes" },
        ].map((x) => (
          <Reveal.Item key={x.t}>
            {x.to ? (
              <Link to={x.to} className="card group relative flex h-full items-start gap-3 p-5 transition hover:-translate-y-0.5 hover:border-accent"><EntryBody {...x} /></Link>
            ) : (
              <button type="button" onClick={x.on} className="card group relative flex h-full w-full items-start gap-3 p-5 text-left transition hover:-translate-y-0.5 hover:border-accent"><EntryBody {...x} /></button>
            )}
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

      <Section title="Como funciona uma emenda">
        <ComoFunciona />
      </Section>

      <Section title="Explore">
        <Reveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { to: "/dinheiro", icon: Banknote, t: "Fluxo do dinheiro", d: "Do tipo de emenda à área de gasto e ao estado." },
            { to: "/deputados", icon: Users, t: "Deputados", d: "Perfil, votos, gastos e proposições." },
            { to: "/proposicoes", icon: FileCheck2, t: "Proposições", d: "PLs, PECs e MPs em tramitação." },
            { to: "/sobre", icon: Landmark, t: "Metodologia", d: "De onde vêm os dados e seus limites." },
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
    <form onSubmit={submit} role="search" className="mt-6 rounded-2xl border border-line bg-surface/80 p-2 shadow-[0_20px_50px_-20px_rgb(0_156_59/0.45)] backdrop-blur">
      <div role="radiogroup" aria-label="O que você procura?" className="mb-2 flex gap-1 px-1 pt-1 text-sm">
        {([["municipio", "Município"], ["deputado", "Deputado"], ["lei", "Lei"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={alvo === k} onClick={() => setAlvo(k)} className={`rounded-lg px-3 py-1 font-medium transition ${alvo === k ? "bg-verde text-white" : "text-muted hover:text-fg"}`}>{l}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ph} className="h-12 w-full rounded-xl bg-surface-2 pl-10 pr-3 text-base outline-none focus:ring-2 focus:ring-accent" />
        </label>
        <button type="submit" className="h-12 rounded-xl bg-verde px-5 font-semibold text-white hover:bg-verde-700">Buscar</button>
      </div>
    </form>
  );
}

/** Contadores ao vivo: total pago e média por segundo desde que a página abriu. */
function LiveCounters({ b, m }: { b: Brasil; m: Meta }) {
  const porSegundo = b.totais.pago / Math.max(1, m.anos.length * 365 * 86400);
  const [t0] = useState(() => Date.now());
  const [now, setNow] = useState(t0);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  const desde = ((now - t0) / 1000) * porSegundo;
  return (
    <dl className="mt-5 grid max-w-xl grid-cols-2 gap-3">
      <div className="rounded-2xl border border-line bg-surface/70 p-3 backdrop-blur">
        <dt className="text-xs text-muted">Total pago em emendas ({m.anos[0]}–{m.anos.at(-1)})</dt>
        <dd className="font-display text-xl font-bold sm:text-2xl"><CountUp value={b.totais.pago} format={(n) => formatBRL(Math.round(n), true)} /></dd>
      </div>
      <div className="rounded-2xl border border-line bg-surface/70 p-3 backdrop-blur">
        <dt className="text-xs text-muted">Pago (média) desde que você abriu a página</dt>
        <dd className="font-display text-xl font-bold tabular text-accent sm:text-2xl" aria-live="off">{formatBRL(Math.round(desde))}</dd>
      </div>
    </dl>
  );
}
