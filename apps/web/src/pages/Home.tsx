// Home: (1) hero que já entrega um fato + busca da cidade + mapa clicável; (2) perto de você; (3) 4 portas de entrada;
// (4) quem mais recebe; (5) empresas contratadas; (6) novidades; (7) como funciona. Detalhe fica nas páginas próprias.
import { dataPath, gastosPath, UFS, type GastosFornecedores, type AutorResumo, type Beneficiados, type Brasil, type Meta, type Municipio, type Rankings, type SiglaUf } from "@emenda/contracts";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Database, EyeOff, MapPin, Scale, Search, ShieldCheck, Trophy, Vote, Zap, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { HeroBrasil, preloadHeroScene } from "@/features/geo/HeroBrasil";
import { BuscaUniversal, abrirBusca } from "@/features/busca";
import { LinhaBeneficiado, privados } from "@/features/beneficiados";
import { GRUPOS } from "@/features/contratadas/contratadas";
import { fatosDoDia, lerLocal, type Fato, type LocalVisitante } from "@/features/home/home";
import { HERO, QuemMandou, QuemMandouSkeleton, TIPO_DINHEIRO } from "@/features/linguagem";
import { PAUTAS } from "@/features/legislativo/pautas";
import { NovidadesStrip } from "@/features/novidades";
import { ShareButton } from "@/features/share";
import { bandeiraUf, fotoPorNome } from "@/lib/cdn";
import { useApi } from "@/lib/data";
import { formatBRL, formatDate } from "@/lib/format";
import { nomeLeigo } from "@/lib/nomes";
import { Avatar, CountUp, easing, Skeleton } from "@/ui";

const brl = (n: number) => formatBRL(Math.round(n), true);
const storage = () => { try { return window.localStorage; } catch { return null; } };

export default function Home() {
  const brasil = useApi<Brasil>(dataPath.brasil());
  const meta = useApi<Meta>(dataPath.meta());
  const autores = useApi<AutorResumo[]>(dataPath.autores());
  const rankings = useApi<Rankings>(dataPath.rankings());
  const nav = useNavigate();
  const [section, setSection] = useState<HTMLElement | null>(null);
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const [local] = useState<LocalVisitante | null>(() => lerLocal(storage()));
  const peso = useMemo(() => (brasil.data ? Object.fromEntries(brasil.data.porUf.map((u) => [u.uf, u.pago])) : undefined), [brasil.data]);
  const fatos = useMemo(() => fatosDoDia({ brasil: brasil.data, rankings: rankings.data, autores: autores.data }), [brasil.data, rankings.data, autores.data]);
  // A cena entra depois do primeiro quadro ocioso: texto e busca pintam primeiro (LCP).
  const [sceneReady, setSceneReady] = useState(false);
  useEffect(() => {
    preloadHeroScene();
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) { const id = w.requestIdleCallback(() => setSceneReady(true), { timeout: 900 }); return () => window.cancelIdleCallback?.(id); }
    const t = setTimeout(() => setSceneReady(true), 200);
    return () => clearTimeout(t);
  }, []);
  const ufLocal = local ? brasil.data?.porUf.find((u) => u.uf === local.uf) : undefined;
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
        <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] items-start gap-x-10 gap-y-4 px-4 pb-24 pt-5 sm:px-6 sm:pb-[260px] sm:pt-10 lg:grid-cols-[1.08fr_1fr] lg:pb-[230px]">
          <div className="lg:col-start-1 lg:row-start-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg/70">{HERO.eyebrow} {meta.data?.anos[0] ?? ""}</p>
            {/* sem animação: é o elemento de LCP no celular */}
            <h1 id="hero-title" className="mt-2 text-xl font-semibold text-fg/85 sm:text-2xl">{local ? `Já chegaram em ${UFS[local.uf as SiglaUf] ?? local.uf}` : HERO.rotulo}</h1>
            <Link to={local ? `/uf/${local.uf}` : "/dinheiro"} className="group mt-1 inline-flex items-baseline gap-2">
              <span className="bg-gradient-to-r from-verde via-[#1fa24f] to-azul bg-clip-text font-display text-[2.6rem] font-bold leading-none tracking-[-0.03em] text-transparent tabular dark:from-[#3ddc84] dark:via-amarelo dark:to-[#8fb4ff] sm:text-6xl lg:text-7xl">
                {brasil.data && (!local || ufLocal) ? <CountUp value={ufLocal ? ufLocal.pago : brasil.data.totais.pago} format={(n) => formatBRL(Math.round(n), true).replace(/\bbi$/, "bilhões").replace(/\bmi$/, "milhões")} /> : <Skeleton className="h-12 w-64" />}
              </span>
              <ArrowRight className="size-6 shrink-0 text-accent transition group-hover:translate-x-1" aria-hidden />
            </Link>
            <p className="mt-2 max-w-xl text-base text-fg/85 text-pretty sm:text-lg">{local ? `para as cidades do estado. Veja quanto chegou na sua — e quem mandou.` : HERO.linha}</p>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: easing.out, delay: 0.1 }}
              className="relative z-30 mt-4 max-w-xl rounded-3xl border border-white/60 bg-white/80 p-2.5 shadow-[0_24px_60px_-24px_rgb(0_39_118/0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0b1512]/80 sm:p-3">
              <BuscaUniversal variante="hero" modoInicial="cidade" onFocoMovel={(q, m) => abrirBusca(q, m)} />
            </motion.div>
            <p className="mt-2 text-xs text-fg/70">{HERO.oficial} · <Link className="link" to="/entenda">Entenda em 2 min</Link></p>
          </div>
          <div className="relative mx-auto w-full max-w-[300px] sm:max-w-[460px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-[560px]">
            <div ref={setAnchor} className="relative aspect-[560/520] w-full" />
            <p className="mt-1 text-center text-xs font-medium text-fg/70">Toque num estado para ver quanto ele recebeu</p>
          </div>
          <div className="lg:col-start-1 lg:row-start-2">
            <HeroNumeros b={brasil.data} />
            <FatoDoDia fatos={fatos} />
          </div>
        </div>
        <div className="hero-grain pointer-events-none absolute inset-0 z-40" aria-hidden />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 pt-10">
        <PertoDeVoce local={local} b={brasil.data} />
        <PortasDeEntrada b={brasil.data} rankings={rankings.data} />
        <QuemMaisRecebe />
        <EmpresasContratadas />
        <NovidadesStrip limit={5} />
        <ComoFunciona />
        {meta.data && <p className="text-xs text-muted">Atualizado em {formatDate(meta.data.generatedAt)} · dados de {anos} · fonte: <a className="link" href={meta.data.fonte} target="_blank" rel="noopener noreferrer">Portal da Transparência</a>.</p>}
      </div>
    </>
  );
}

/** Números do hero: todos são links. Se já sabemos o estado do visitante, o primeiro é o dele. */
function HeroNumeros({ b }: { b?: Brasil }) {
  const tipo = (t: string) => b?.porTipo.filter((x) => x.tipo === t).reduce((s, x) => s + x.pago, 0) ?? 0;
  const itens: Array<{ to: string; label: string; valor?: number; cor?: string }> = [
    { to: "/pix", label: "foram mandados sem dizer para quê", valor: b ? tipo("pix") : undefined, cor: "#a36f00" },
    { to: "/orcamento-secreto", label: "foram mandados sem mostrar quem pediu", valor: b ? tipo("relator") : undefined, cor: TIPO_DINHEIRO.relator.cor },
  ];
  return (
    <ul className="grid max-w-xl grid-cols-2 gap-2 sm:gap-3" aria-label="Números principais">
      {itens.map((k) => (
        <li key={k.to}>
          <Link to={k.to} className="press group block h-full rounded-2xl border border-white/60 bg-white/70 p-2.5 shadow-[0_10px_30px_-18px_rgb(0_39_118/0.5)] backdrop-blur-md hover:border-accent dark:border-white/10 dark:bg-[#0b1512]/65 sm:p-3.5">
            <span className="block font-display text-lg font-bold tabular sm:text-2xl" style={k.cor ? { color: k.cor } : undefined}>
              {k.valor != null ? <CountUp value={k.valor} format={brl} /> : <Skeleton className="h-7 w-20" />}
            </span>
            <span className="mt-0.5 flex items-center justify-between gap-1 text-[11px] leading-tight text-fg/75 sm:text-xs">{k.label}<ArrowRight className="size-3.5 shrink-0 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Fato do dia: gira sozinho (pausa ao passar o mouse e com movimento reduzido); cada um tem link e botão de compartilhar. */
function FatoDoDia({ fatos }: { fatos: Fato[] }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  useEffect(() => {
    if (reduce || pausa || fatos.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % fatos.length), 7000);
    return () => clearInterval(t);
  }, [reduce, pausa, fatos.length]);
  if (!fatos.length) return <Skeleton className="mt-3 h-28 max-w-xl rounded-2xl" />;
  const f = fatos[i % fatos.length]!;
  const texto = `${f.titulo ? `${f.titulo}: ` : ""}${brl(f.numero)} ${f.gancho}`;
  return (
    <section aria-label="Fato do dia" aria-live="polite" onPointerEnter={() => setPausa(true)} onPointerLeave={() => setPausa(false)}
      className="relative mt-3 max-w-xl overflow-hidden rounded-2xl border border-white/60 bg-white/85 p-3.5 shadow-[0_18px_40px_-24px_rgb(0_39_118/0.55)] backdrop-blur-md dark:border-white/10 dark:bg-[#0b1512]/80">
      <div className="flex items-start gap-3">
        {f.id === "pessoa" && f.titulo ? <Avatar src={fotoPorNome(f.titulo)} name={f.titulo} size="md" />
          : <span className="grid size-10 shrink-0 place-items-center rounded-full text-white" style={{ background: f.id === "secreto" ? TIPO_DINHEIRO.relator.cor : f.id === "mes" ? "#a36f00" : "#009c3b" }}>
              {f.id === "secreto" ? <EyeOff className="size-5" aria-hidden /> : f.id === "mes" ? <Zap className="size-5" aria-hidden /> : <MapPin className="size-5" aria-hidden />}
            </span>}
        <Link to={f.href} className="min-w-0 flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Fato do dia</span>
          {f.titulo && <span className="block truncate font-semibold">{f.titulo}</span>}
          <span className="block"><b className="font-display text-2xl tabular">{brl(f.numero)}</b> <span className="text-sm text-fg/85">{f.gancho}</span></span>
        </Link>
        <ShareButton compact kind="pagina" title="Fato do dia" text={`${texto} Veja 👇`} url={f.href} label="Compartilhar" />
      </div>
      {fatos.length > 1 && (
        <div className="mt-2 flex gap-1" role="tablist" aria-label="Outros fatos">
          {fatos.map((x, k) => (
            <button key={x.id} type="button" role="tab" aria-selected={k === i % fatos.length} aria-label={`Fato ${k + 1}`} onClick={() => setI(k)}
              className="relative h-6 flex-1 before:absolute before:inset-x-0 before:top-1/2 before:h-1 before:-translate-y-1/2 before:rounded-full before:bg-line aria-selected:before:bg-accent" />
          ))}
        </div>
      )}
    </section>
  );
}

/** Perto de você: a última cidade/estado visitado; se não houver, escolher o estado. */
function PertoDeVoce({ local, b }: { local: LocalVisitante | null; b?: Brasil }) {
  const m = useApi<Municipio>(local?.tipo === "municipio" ? dataPath.municipio(local.id) : null);
  return (
    <section aria-labelledby="perto-t">
      <h2 id="perto-t" className="mb-3 text-xl font-bold sm:text-2xl">Perto de você</h2>
      {local?.tipo === "municipio" ? (
        <div className="card grid grid-cols-1 gap-4 p-4 sm:grid-cols-[1fr_1.2fr] sm:p-5">
          <Link to={`/municipio/${local.id}`} className="group block">
            <p className="text-sm text-muted">{local.nome} ({local.uf}) recebeu</p>
            <p className="font-display text-4xl font-bold tabular">{m.data ? brl(m.data.totais.pago) : <Skeleton className="h-10 w-40" />}</p>
            {m.data && m.data.totais.pago > 0 && (
              <p className="mt-1 text-sm"><b style={{ color: "#a36f00" }}>{Math.round(((m.data.porTipo.find((t) => t.tipo === "pix")?.pago ?? 0) / m.data.totais.pago) * 100)}%</b> sem dizer para quê</p>
            )}
            <span className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent">Ver tudo sobre {local.nome} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden /></span>
          </Link>
          <div>
            <p className="mb-1 text-sm font-semibold">Quem mandou</p>
            {m.data ? <QuemMandou autores={m.data.autores} inicial={3} /> : <QuemMandouSkeleton n={3} />}
          </div>
        </div>
      ) : local?.tipo === "uf" ? (
        <Link to={`/uf/${local.uf}`} className="card flex items-center gap-4 p-4 hover:border-accent sm:p-5">
          <img src={bandeiraUf(local.uf, 64)} alt="" width={48} height={34} className="h-[34px] w-12 rounded ring-1 ring-line" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
          <span className="min-w-0 flex-1"><span className="block text-sm text-muted">{local.nome} recebeu</span><b className="font-display text-3xl tabular">{brl(b?.porUf.find((u) => u.uf === local.uf)?.pago ?? 0)}</b></span>
          <ArrowRight className="size-5 text-accent" aria-hidden />
        </Link>
      ) : (
        <div className="card p-4 sm:p-5">
          <p className="mb-3 text-fg/85">Escolha seu estado para ver as cidades que mais receberam.</p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-9">
            {(Object.keys(UFS) as SiglaUf[]).sort().map((uf) => (
              <li key={uf}>
                <Link to={`/uf/${uf}`} aria-label={UFS[uf]} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-2.5 text-sm font-semibold hover:border-accent hover:bg-surface-2">
                  <img src={bandeiraUf(uf, 64)} alt="" width={22} height={16} loading="lazy" className="h-4 w-[22px] rounded-[2px] object-cover ring-1 ring-line" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                  {uf}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Quatro portas de entrada, cada uma com ícone, uma linha e um número. */
function PortasDeEntrada({ b, rankings }: { b?: Brasil; rankings?: Rankings }) {
  const pix = b?.porTipo.filter((x) => x.tipo === "pix").reduce((s, x) => s + x.pago, 0);
  const top = rankings?.janelas.find((j) => j.janela === "12m")?.autores.find((a) => !/^(RELATOR|COM\b|COM\.|COMISS|BANCADA)/i.test(a.nome));
  const portas: Array<{ to: string; icone: LucideIcon; cor: string; titulo: string; linha: string; numero: string | undefined }> = [
    { to: "/pix", icone: Zap, cor: "#a36f00", titulo: "Dinheiro sem dizer para quê", linha: "Cai direto na prefeitura, sem dizer em que vai ser usado.", numero: pix != null ? brl(pix) : undefined },
    { to: "/ultimas?tab=rankings", icone: Trophy, cor: "#009c3b", titulo: "Quem mais mandou", linha: top ? `Nos últimos 12 meses: ${nomeLeigo(top.nome)}.` : "Os políticos que mais mandaram dinheiro.", numero: top ? brl(top.valor) : undefined },
    { to: "/proposicoes#pautas", icone: Vote, cor: "#2563eb", titulo: "Como votaram nas leis importantes", linha: "Reforma tributária, fake news, isenção do IR e outras.", numero: `${PAUTAS.length} leis` },
    { to: "/auditar", icone: ShieldCheck, cor: "#7c3aed", titulo: "Audite seu candidato", linha: "O boletim do seu deputado ou senador antes de votar.", numero: "594 políticos" },
  ];
  return (
    <section aria-labelledby="portas-t">
      <h2 id="portas-t" className="mb-3 text-xl font-bold sm:text-2xl">Por onde começar</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {portas.map((p) => (
          <li key={p.to}>
            <Link to={p.to} className="card group flex h-full flex-col gap-2 p-4 transition hover:-translate-y-0.5 hover:border-accent">
              <span className="grid size-10 place-items-center rounded-xl text-white" style={{ background: p.cor }}><p.icone className="size-5" aria-hidden /></span>
              <b className="text-lg leading-tight">{p.titulo}</b>
              <span className="text-sm text-muted">{p.linha}</span>
              <span className="mt-auto flex items-center justify-between pt-1 font-display text-xl font-bold tabular">{p.numero ?? <Skeleton className="h-6 w-20" />}<ArrowRight className="size-4 text-accent transition group-hover:translate-x-0.5" aria-hidden /></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Para onde o dinheiro vai de fato: empresas e entidades privadas de um lado, fundos públicos do outro. */
function QuemMaisRecebe() {
  const q = useApi<Beneficiados>(dataPath.beneficiados());
  const b = q.data;
  if (q.isError) return null;
  const blocos = [
    { titulo: "Empresas e entidades privadas", total: b ? b.totais.empresas + b.totais.entidades : undefined, itens: b ? privados(b).slice(0, 5) : undefined, to: "/quem-recebe" },
    { titulo: "Fundos públicos", total: b?.totais.fundos, itens: b?.fundos.slice(0, 5), to: "/quem-recebe#fundos" },
  ];
  return (
    <section aria-labelledby="recebe-t">
      <h2 id="recebe-t" className="mb-1 text-xl font-bold sm:text-2xl">Quem mais recebe</h2>
      <p className="mb-3 text-sm text-muted">Nem todo dinheiro vai para a prefeitura. Estas são as empresas, entidades e fundos que mais receberam.</p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {blocos.map((k) => (
          <div key={k.titulo} className="card p-4">
            <h3 className="font-semibold">{k.titulo}</h3>
            <p className="font-display text-2xl font-bold tabular">{k.total != null ? brl(k.total) : <Skeleton className="h-7 w-28" />}</p>
            {k.itens ? <div className="divide-y divide-line">{k.itens.map((x, i) => <LinhaBeneficiado key={x.documento} x={x} i={i} />)}</div> : <Skeleton className="mt-2 h-40 rounded-xl" />}
            <Link to={k.to} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent">Ver os 100 maiores <ArrowRight className="size-4" aria-hidden /></Link>
          </div>
        ))}
      </div>
    </section>
  );
}

/** A empresa que mais recebeu em cada tipo de gasto da cota; cada cartão abre o tipo. */
function EmpresasContratadas() {
  const q = useApi<GastosFornecedores>(gastosPath.fornecedores());
  if (q.isError) return null;
  const grupos = q.data?.grupos.filter((g) => g.grupo !== "outros" && g.fornecedores.length).slice(0, 4);
  return (
    <section aria-labelledby="contratadas-t">
      <h2 id="contratadas-t" className="mb-1 text-xl font-bold sm:text-2xl">Empresas que os políticos contratam</h2>
      <p className="mb-3 text-sm text-muted">Passagens, propaganda, carro e escritório são pagos com dinheiro público. Quem mais recebeu em cada um:</p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {grupos ? grupos.map((g) => {
          const f = g.fornecedores[0]!;
          return (
            <li key={g.grupo}>
              <Link to={`/empresas-contratadas?tipo=${g.grupo}`} className="card group flex h-full flex-col gap-1 p-4 hover:border-accent">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">{GRUPOS[g.grupo].rotulo}</span>
                <b className="leading-tight [overflow-wrap:anywhere]">{nomeLeigo(f.nome)}</b>
                <span className="font-display text-2xl font-bold tabular">{brl(f.valor)}</span>
                <span className="mt-auto flex items-center justify-between text-sm text-muted">contratada por {f.parlamentares} políticos<ArrowRight className="size-4 text-accent transition group-hover:translate-x-0.5" aria-hidden /></span>
              </Link>
            </li>
          );
        }) : [0, 1, 2, 3].map((i) => <li key={i}><Skeleton className="h-36 rounded-2xl" /></li>)}
      </ul>
      <Link to="/empresas-contratadas" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent">Ver todas as empresas e quem contratou <ArrowRight className="size-4" aria-hidden /></Link>
    </section>
  );
}

function ComoFunciona() {
  const passos: Array<{ icone: LucideIcon; titulo: string; texto: string }> = [
    { icone: Scale, titulo: "Políticos escolhem", texto: "Todo ano, cada deputado e senador decide para onde vai uma parte do dinheiro público." },
    { icone: Search, titulo: "O governo paga", texto: "O dinheiro sai do governo federal e chega na prefeitura, num hospital ou numa entidade." },
    { icone: Database, titulo: "Nós mostramos", texto: "Juntamos os dados oficiais e mostramos quanto chegou na sua cidade e quem mandou." },
  ];
  return (
    <section aria-labelledby="como-t">
      <h2 id="como-t" className="mb-3 text-xl font-bold sm:text-2xl">Como funciona</h2>
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {passos.map((p, i) => (
          <li key={p.titulo} className="card flex gap-3 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-verde/12 text-accent"><p.icone className="size-5" aria-hidden /></span>
            <span><b className="block">{i + 1}. {p.titulo}</b><span className="text-sm text-muted">{p.texto}</span></span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted">Fontes: <a className="link" href="https://portaldatransparencia.gov.br/emendas" target="_blank" rel="noopener noreferrer">Portal da Transparência</a>, <a className="link" href="https://dadosabertos.camara.leg.br" target="_blank" rel="noopener noreferrer">Câmara</a>, <a className="link" href="https://legis.senado.leg.br/dadosabertos" target="_blank" rel="noopener noreferrer">Senado</a> e <a className="link" href="https://www.ibge.gov.br" target="_blank" rel="noopener noreferrer">IBGE</a>. <Link className="link" to="/sobre">Como fazemos</Link></p>
    </section>
  );
}
