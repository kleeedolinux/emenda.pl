import { dataPath, UFS, type AutorResumo, type Brasil, type Meta, type SiglaUf, type Uf } from "@emenda/contracts";
import { motion } from "motion/react";
import { ArrowRight, EyeOff, Scale, Zap, type LucideIcon } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { HeroBrasil, preloadHeroScene } from "@/features/geo/HeroBrasil";
import { Ticker } from "@/features/geo/hero/HeroTicker";
import { POPULACAO_UF } from "@/features/emendas/populacao";
import { BuscaUniversal, abrirBusca } from "@/features/busca";
import { BarraTipos, fatosBrasil, porMorador, QuemMandou, QuemMandouSkeleton, TIPO_DINHEIRO, topUfPorTipo } from "@/features/linguagem";
import { NovidadesStrip } from "@/features/novidades";
import { bandeiraUf } from "@/lib/cdn";
import { useApi } from "@/lib/data";
import { formatBRL, formatDate, formatNumber } from "@/lib/format";
import { CountUp, easing, ErrorState, Reveal, Section, Skeleton } from "@/ui";

const brl = (n: number) => formatBRL(Math.round(n), true);

export default function Home() {
  const brasil = useApi<Brasil>(dataPath.brasil());
  const meta = useApi<Meta>(dataPath.meta());
  const autores = useApi<AutorResumo[]>(dataPath.autores());
  const nav = useNavigate();
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
  // Abaixo do hero: renderização em transição (fatiada pelo React), sem tarefa longa quando os dados chegam.
  const bd = useDeferredValue(brasil.data);
  const ad = useDeferredValue(autores.data);
  const anos = meta.data ? `${meta.data.anos[0]}–${meta.data.anos.at(-1)}` : "";

  return (
    <>
      <section ref={setSection} aria-labelledby="hero-title" className="hero relative isolate -mt-8 ml-[calc(50%-50vw)] w-screen overflow-hidden sm:-mt-10">
        <div className="absolute inset-0 -z-10" aria-hidden>
          <div className="hero-sky-a absolute inset-0" />
          <div className="hero-sky-b absolute inset-0" />
          <div className="hero-sun absolute left-[38%] top-[44%] size-[min(70vw,720px)] -translate-x-1/2 rounded-full" />
        </div>
        {section && sceneReady && <HeroBrasil section={section} anchor={anchor} pesoPorUf={peso} onUf={(uf) => nav(`/uf/${uf}`)} nomeUf={(uf) => UFS[uf as SiglaUf] ?? uf} />}
        <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-x-10 gap-y-5 px-4 pb-[215px] pt-6 sm:px-6 sm:pb-[300px] sm:pt-10 lg:grid-cols-[1.08fr_1fr] lg:pb-[250px] lg:pt-10">
          <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
            {/* sem animação: é o elemento de LCP no celular */}
            <h1 id="hero-title" className="text-[2.1rem] font-bold leading-[1.05] tracking-[-0.03em] text-balance sm:text-5xl lg:text-6xl">
              Quanto dinheiro os políticos mandaram para a <span className="bg-gradient-to-r from-verde via-[#1fa24f] to-azul bg-clip-text text-transparent dark:from-[#3ddc84] dark:via-amarelo dark:to-[#8fb4ff]">sua cidade?</span>
            </h1>
            <p className="mt-3 max-w-xl text-base text-fg/80 text-pretty sm:mt-4 sm:text-lg">
              Deputados e senadores escolhem para onde vai parte do dinheiro público. Veja quanto chegou na sua cidade e quem mandou.
            </p>
          </div>
          <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: easing.out, delay: 0.2 }}
              className="relative z-30 max-w-xl rounded-3xl border border-white/60 bg-white/75 p-2.5 shadow-[0_24px_60px_-24px_rgb(0_39_118/0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0b1512]/75 sm:p-3">
              <BuscaUniversal variante="hero" modoInicial="cidade" onFocoMovel={(q, m) => abrirBusca(q, m)} />
            </motion.div>
            <HeroKpis b={brasil.data} anos={anos} />
          </div>
          <div className="relative mx-auto w-full max-w-[340px] sm:max-w-[500px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-[580px]">
            <div ref={setAnchor} className="relative aspect-[560/520] w-full" />
            <p className="mt-1 text-center text-xs font-medium text-fg/70">Toque num estado para ver quanto ele recebeu</p>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-3 z-10 px-3 sm:px-6"><Ticker autores={autores.data} /></div>
        <div className="hero-grain pointer-events-none absolute inset-0 z-40" aria-hidden />
      </section>

      <Section title="Sua cidade recebeu quanto?" id="estados">
        <p className="-mt-2 mb-4 max-w-2xl text-muted">Escolha seu estado e veja as cidades que mais receberam. Ou digite o nome da cidade na busca acima.</p>
        {brasil.isError ? <ErrorState error={brasil.error} retry={() => brasil.refetch()} /> : bd ? <EscolhaEstado b={bd} /> : <Skeleton className="h-64 rounded-2xl" />}
      </Section>

      {bd && <FatosVirais b={bd} />}

      <Section title="Os jeitos de o dinheiro chegar" tip="Cada cor é um jeito de mandar dinheiro. Toque numa cor para entender e ver quem mais recebeu.">
        {bd ? (
          <div className="card p-5">
            <p className="mb-3 text-sm text-muted">Todo o dinheiro mandado por deputados e senadores{anos ? ` (${anos})` : ""}: {brl(bd.totais.pago)}.</p>
            <BarraTipos porTipo={bd.porTipo} href={(t) => (t === "pix" ? "/pix" : t === "outra" ? undefined : `/emendas?tipo=${t}`)} detalhe={(t) => ({ titulo: "Estados que mais receberam", itens: topUfPorTipo(bd!.fluxo, t) })} />
          </div>
        ) : <Skeleton className="h-36 rounded-2xl" />}
      </Section>

      <Section title="Quem mais mandou dinheiro">
        <div className="card p-4 sm:p-5">
          {ad ? <QuemMandou autores={ad.filter((a) => !/^(RELATOR|COM\b|COMISS|BANCADA)/i.test(a.nome))} inicial={5} /> : <QuemMandouSkeleton n={5} />}
          <Link to="/emendas" className="link mt-4 inline-flex items-center gap-1 text-sm font-semibold">Ver todos os políticos <ArrowRight className="size-4" /></Link>
        </div>
      </Section>

      <Section title="O que mudou hoje">
        <NovidadesStrip limit={5} />
        <p className="mt-3 text-sm"><Link className="link" to="/novidades">Ver todas as novidades →</Link></p>
      </Section>

      {meta.data && (
        <p className="mt-8 text-xs text-muted">
          Atualizado em {formatDate(meta.data.generatedAt)} · anos {anos} · fonte: <a className="link" href={meta.data.fonte} target="_blank" rel="noopener noreferrer">Portal da Transparência</a>. Valores = dinheiro que de fato foi pago (emendas parlamentares).
        </p>
      )}
    </>
  );
}

/** KPIs do hero: cada número leva à página que o explica. */
function HeroKpis({ b, anos }: { b?: Brasil; anos: string }) {
  const tipo = (t: string) => b?.porTipo.filter((x) => x.tipo === t).reduce((s, x) => s + x.pago, 0) ?? 0;
  const itens: Array<{ to: string; label: string; valor?: number; cor?: string }> = [
    { to: "/dinheiro", label: `mandados por políticos${anos ? ` (${anos})` : ""}`, valor: b?.totais.pago },
    { to: "/pix", label: "sem dizer para quê", valor: b ? tipo("pix") : undefined, cor: "#a36f00" },
    { to: "/emendas?tipo=relator", label: "pelo orçamento secreto", valor: b ? tipo("relator") : undefined, cor: TIPO_DINHEIRO.relator.cor },
  ];
  return (
    <Reveal as="ul" className="mt-4 grid max-w-xl grid-cols-3 gap-2 sm:gap-3" step={0.08}>
      {itens.map((k) => (
        <Reveal.Item key={k.to} as="li">
          <Link to={k.to} className="press group block h-full rounded-2xl border border-white/60 bg-white/65 p-2.5 shadow-[0_10px_30px_-18px_rgb(0_39_118/0.5)] backdrop-blur-md hover:border-accent dark:border-white/10 dark:bg-[#0b1512]/60 sm:p-3.5">
            <span className="flex items-center gap-1 font-display text-lg font-bold tabular sm:text-2xl" style={k.cor ? { color: k.cor } : undefined}>
              {k.valor != null ? <CountUp value={k.valor} format={brl} /> : <Skeleton className="h-7 w-20" />}
            </span>
            <span className="mt-0.5 flex items-center justify-between gap-1 text-[11px] leading-tight text-fg/75 sm:text-xs">{k.label}<ArrowRight className="size-3.5 shrink-0 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden /></span>
          </Link>
        </Reveal.Item>
      ))}
    </Reveal>
  );
}

/** 27 estados clicáveis; escolher um mostra as cidades que mais receberam, sem sair da página. */
function EscolhaEstado({ b }: { b: Brasil }) {
  const [uf, setUf] = useState<string | null>(null);
  const porUf = useMemo(() => [...b.porUf].filter((u) => u.uf in UFS).sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR")), [b.porUf]);
  const d = useApi<Uf>(uf ? dataPath.uf(uf) : null);
  const pm = (u: { uf: string; pago: number }) => porMorador(u.pago, POPULACAO_UF[u.uf as SiglaUf]);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.25fr_1fr]">
      <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-5">
        {porUf.map((u) => (
          <li key={u.uf}>
            <button type="button" onClick={() => setUf(u.uf)} aria-pressed={uf === u.uf}
              className={`press flex w-full items-center gap-2 rounded-xl border p-2 text-left transition ${uf === u.uf ? "border-accent bg-verde/10" : "border-line bg-surface hover:border-accent"}`}>
              <img src={bandeiraUf(u.uf, 64)} alt="" width={24} height={17} loading="lazy" className="h-[17px] w-6 shrink-0 rounded-[2px] object-cover ring-1 ring-line" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
              <span className="min-w-0">
                <b className="block text-sm leading-tight">{u.uf}</b>
                <span className="block truncate text-[11px] leading-tight text-muted tabular">{brl(u.pago)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="card min-h-64 p-4 sm:p-5" aria-live="polite">
        {!uf ? (
          <div className="grid h-full place-items-center text-center text-muted">
            <p>Escolha um estado ao lado.<br /><span className="text-sm">Você verá as cidades que mais receberam e quanto isso dá por morador.</span></p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-bold">{UFS[uf as SiglaUf]}</h3>
                {(() => { const u = b.porUf.find((x) => x.uf === uf); const r = u ? pm(u) : null; return u ? <p className="text-sm text-muted">{brl(u.pago)} no total{r != null ? ` · R$ ${formatNumber(r)} por morador` : ""}</p> : null; })()}
              </div>
              <Link to={`/uf/${uf}`} className="press shrink-0 rounded-xl bg-verde-700 px-3 py-2 text-sm font-semibold text-white">Abrir estado</Link>
            </div>
            {d.data ? (
              <ol className="divide-y divide-line">
                {[...d.data.municipios].sort((x, y) => y.pago - x.pago).slice(0, 8).map((m, i) => (
                  <li key={m.ibge}>
                    <Link to={`/municipio/${m.ibge}`} className="flex items-center gap-3 py-2 hover:text-accent">
                      <span className="w-5 text-right text-xs text-muted tabular">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{m.nome}</span>
                      <b className="tabular">{brl(m.pago)}</b>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : <Skeleton className="h-64" />}
            {d.data && <Link to={`/uf/${uf}`} className="link mt-3 inline-flex text-sm font-semibold">Ver as {formatNumber(d.data.municipios.length)} cidades →</Link>}
          </>
        )}
      </div>
    </div>
  );
}

function FatosVirais({ b }: { b: Brasil }) {
  const f = fatosBrasil(b, POPULACAO_UF);
  const cards: Array<{ to: string; icon: LucideIcon; cor: string; grande: string; texto: string }> = [
    { to: "/pix", icon: Zap, cor: TIPO_DINHEIRO.pix.cor, grande: `${Math.round(f.pctPix * 100)}%`, texto: "do dinheiro foi mandado sem dizer para quê. A prefeitura decide depois, e fica mais difícil fiscalizar." },
    { to: "/emendas?tipo=relator", icon: EyeOff, cor: TIPO_DINHEIRO.relator.cor, grande: brl(f.relator), texto: "saíram pelo orçamento secreto: até hoje não se sabe quem pediu. O STF proibiu em 2022." },
    ...(f.maisPorMorador && f.menosPorMorador && f.vezes
      ? [{ to: `/uf/${f.maisPorMorador.uf}`, icon: Scale, cor: "#002776", grande: `${f.vezes}×`, texto: `mais por morador em ${UFS[f.maisPorMorador.uf as SiglaUf]} (R$ ${formatNumber(f.maisPorMorador.reais)}) do que em ${UFS[f.menosPorMorador.uf as SiglaUf]} (R$ ${formatNumber(f.menosPorMorador.reais)}).` }]
      : []),
  ];
  return (
    <Section title="3 coisas que quase ninguém sabe">
      <Reveal className="grid gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <Reveal.Item key={c.to}>
            <Link to={c.to} className="card press group flex h-full flex-col gap-2 p-5 transition hover:border-accent">
              <span className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-full text-white" style={{ background: c.cor }}><c.icon className="size-5" aria-hidden /></span>
                <b className="font-display text-3xl tabular" style={{ color: c.cor }}>{c.grande}</b>
              </span>
              <span className="text-pretty">{c.texto}</span>
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-accent">Ver de onde vem <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden /></span>
            </Link>
          </Reveal.Item>
        ))}
      </Reveal>
    </Section>
  );
}
