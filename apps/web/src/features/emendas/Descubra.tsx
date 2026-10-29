// "Descubra": histórias curtas e compartilháveis sobre as emendas, todas sensíveis aos filtros.
import {
  dataPath, type Abertas, type AutorResumo, type Brasil, type Feed, type Pagamento, type Rankings, type Uf,
} from "@emenda/contracts";
import { ArrowRight, ChevronLeft, ChevronRight, Clock, Crown, Hourglass, Landmark, MapPin, Trophy, Users, Zap } from "lucide-react";
import { useMemo, useRef, type ReactNode } from "react";
import { Link } from "react-router";
import { mesCurto, mesLongo, JANELA_ROTULO } from "@/features/feed/feed";
import { formatBRL, formatNumber, formatPct } from "@/lib/format";
import { Avatar, Bars, CountUp, ExternalLink, externo, PartyBadge, Skeleton, Term, useApi } from "@/ui";
import { filtrosQuery, urlAutor, useNaVista, useParlamentares } from "./explorador";
import {
  abertoDoRecorte, autoresDoRecorte, maioresPagamentos, municipiosDoRecorte, noEstado, nomeProprio, recorteTexto, parlamentarDe, parteTipos,
  slidesRanking, ufsPerCapita, ultimosPagamentos, type Filtros,
} from "./historias";
import { POPULACAO_FONTE } from "./populacao";
import { BarraTipos, topUfPorTipo } from "@/features/linguagem";
import { COR_TIPO, nomeTipoCurto } from "./tipos";
import { Grande, MiniColunas, Story } from "./ui";

const brl = (n: number) => formatBRL(n, true);
const reaisInteiros = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const verCls = "ml-auto inline-flex items-center gap-1 font-semibold text-accent hover:underline";
const Ver = ({ to, children }: { to: string; children: ReactNode }) => {
  const c = <>{children}<ArrowRight className="size-3.5" aria-hidden /></>;
  return to.startsWith("#") ? <a href={to} className={verCls}>{c}</a> : <Link to={to} className={verCls}>{c}</Link>;
};

interface Props { f: Filtros; brasil: Brasil | undefined; autores: AutorResumo[] | undefined; uf: Uf | null }

export function Descubra({ f, brasil, autores, uf }: Props) {
  const [ref, visto] = useNaVista<HTMLDivElement>("200px");
  const feed = useApi<Feed>(visto ? dataPath.feed() : null);
  const abertas = useApi<Abertas>(visto ? dataPath.abertas() : null);
  const rankings = useApi<Rankings>(visto ? dataPath.rankings() : null);
  const q = filtrosQuery(f);

  return (
    <div ref={ref}>
      <p className="-mt-2 mb-3 text-sm text-muted md:hidden">Deslize para o lado →</p>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-3">
        <Slot wide><QuemMais f={f} q={q} autores={autores} uf={uf} /></Slot>
        <Slot><MaiorPagamento f={f} q={q} itens={feed.data?.itens} /></Slot>
        <Slot><EstadoPerCapita f={f} q={q} brasil={brasil} /></Slot>
        <Slot><MunicipioTop f={f} rankings={rankings.data} uf={uf} /></Slot>
        <Slot><PartePix f={f} q={q} brasil={brasil} uf={uf} /></Slot>
        <Slot><EmAberto f={f} q={q} abertas={abertas.data} /></Slot>
        <Slot wide><Ultimos f={f} itens={feed.data?.itens} ultimoMes={feed.data?.ultimoMes} /></Slot>
      </div>
    </div>
  );
}

/** Celular: cartão de 86% em trilho deslizável. Tablet+: célula da grade (wide = 2 colunas). */
const Slot = ({ wide, children }: { wide?: boolean; children: ReactNode }) => (
  <div className={`flex w-[86%] shrink-0 snap-center flex-col md:w-auto [&>*]:flex-1 ${wide ? "md:col-span-2" : ""}`}>{children}</div>
);

type CardProps = { f: Filtros; q: string; className?: string };

function QuemMais({ f, q, autores, uf }: CardProps & { autores: AutorResumo[] | undefined; uf: Uf | null }) {
  const [ref, visto] = useNaVista<HTMLDivElement>();
  const pix = useApi<{ autores: AutorResumo[] }>(f.tipo === "pix" && !f.uf ? dataPath.pix() : null);
  const idx = useParlamentares(visto);
  const r = autores ? autoresDoRecorte({ autores, uf, pix: pix.data?.autores ?? null }, f) : null;
  const top = r?.lista.slice(0, 3) ?? [];
  const pessoas = !f.tipo || f.tipo === "pix" || f.tipo === "individual" || f.tipo === "outra";
  const titulo = pessoas ? "Os parlamentares que mais indicaram dinheiro" : f.tipo === "bancada" ? "As bancadas estaduais que mais indicaram" : f.tipo === "comissao" ? "As comissões que mais indicaram" : "Emendas de relator";
  return (
    <div ref={ref} className="flex">
      <Story id="quem-mais" icon={<Crown />} eyebrow="Quem mais enviou" cor="#002776" className="flex-1"
        title={<>{titulo}{f.uf ? ` ${noEstado(f.uf)}` : ""} — valor <Term k="pago">pago</Term>{f.tipo === "pix" && !f.uf ? " via Emenda Pix" : " desde 2014"}.</>}
        ignorados={r?.ignorados}
        share={top.length ? {
          kind: "pagina", title: "Quem mais indicou emendas", url: `/emendas${q}#quem-mais`,
          text: `🏆 Quem mais indicou emendas${f.uf ? ` ${noEstado(f.uf)}` : ""}: ${top.map((a, i) => `${i + 1}º ${nomeProprio(a.nome)} (${brl(a.pago)})`).join(", ")}. Veja o ranking:`,
          bars: top.map((a) => ({ label: nomeProprio(a.nome), value: a.pago })), metric: { value: top[0]!.pago, format: "brl", label: "pagos" },
        } : undefined}
        footer={<Ver to="#autores">Ver ranking completo</Ver>}
      >
        <ol className="mt-2 grid min-h-[13.5rem] grid-cols-3 items-end gap-2 sm:gap-4">
          {!r ? [0, 1, 2].map((i) => <li key={i}><Skeleton className="h-48 rounded-2xl" /></li>) :
            [1, 0, 2].map((i) => {
              const a = top[i];
              if (!a) return <li key={i} />;
              const p = parlamentarDe(idx, a.chave);
              const alt = ["h-28", "h-20", "h-14"][i];
              return (
                <li key={a.codigo} className="flex min-w-0 flex-col items-center text-center">
                  <Link to={urlAutor(a.codigo)} className="group/p flex min-w-0 flex-col items-center">
                    <span className={`relative ${i === 0 ? "[&>span:first-child]:!size-[4.5rem] sm:[&>span:first-child]:!size-28" : "[&>span:first-child]:!size-14 sm:[&>span:first-child]:!size-20"}`}>
                      <Avatar src={p?.foto} name={nomeProprio(a.nome)} size={i === 0 ? "xl" : "lg"} />
                      <span className="absolute -bottom-1 -right-1 inline-flex size-6 items-center justify-center rounded-full bg-amarelo text-[10px] font-black sm:size-7 sm:text-xs text-azul ring-2 ring-surface">{i + 1}º</span>
                    </span>
                    <span className="mt-2 line-clamp-2 text-xs font-semibold leading-tight group-hover/p:text-accent sm:text-sm">{p?.nome ?? nomeProprio(a.nome)}</span>
                  </Link>
                  <span className="mt-1 flex h-5 items-center gap-1">{p?.partido && <PartyBadge sigla={p.partido} />}{p?.uf && <span className="text-xs text-muted">{p.uf}</span>}</span>
                  <span className="mt-1 font-display text-sm font-bold tabular sm:text-lg"><CountUp value={a.pago} format={brl} /></span>
                  <span className={`mt-2 w-full rounded-t-xl bg-gradient-to-t from-azul/25 to-azul/5 dark:from-azul-400/30 ${alt}`} aria-hidden />
                </li>
              );
            })}
        </ol>
      </Story>
    </div>
  );
}

function MaiorPagamento({ f, q, itens }: CardProps & { itens: Pagamento[] | undefined }) {
  const top = itens ? maioresPagamentos(itens, f, 4) : undefined;
  const p = top ? (top[0] ?? null) : undefined;
  return (
    <Story id="maior" icon={<Trophy />} eyebrow="Maior pagamento recente" cor="#e0b800"
      title={<>O maior pagamento único dos últimos meses{recorteTexto(f, []) ? ` (${recorteTexto(f, [])})` : ""}.</>}
      share={p ? {
        kind: "emenda", title: `Maior pagamento recente: ${p.favorecido.nome || p.municipio.nome}`, url: `/emendas${q}#maior`,
        text: `💸 ${formatBRL(p.valor)} numa única emenda paga em ${mesLongo(p.mes)}, indicada por ${nomeProprio(p.autor.nome)}, para ${p.favorecido.nome || p.municipio.nome}. Veja:`,
        metric: { value: p.valor, format: "brl", label: "em um pagamento" },
      } : undefined}
      footer={p ? <ExternalLink href={externo.emenda(p.codigoEmenda)} className="ml-auto text-xs">Ver no Portal</ExternalLink> : undefined}
    >
      {p === undefined ? <><Skeleton className="h-10 w-40" /><Skeleton className="mt-4 h-16" /></> : p === null ? (
        <p className="text-sm text-muted">Nenhum pagamento recente neste recorte. Os pagamentos cobrem os últimos 6 meses publicados.</p>
      ) : (
        <>
          <Grande><CountUp value={p.valor} format={brl} /></Grande>
          <p className="mt-1 text-sm text-muted">{mesLongo(p.mes)} · <span style={{ color: COR_TIPO[p.tipo] }} className="font-semibold">{nomeTipoCurto(p.tipo)}</span></p>
          <dl className="mt-4 space-y-1.5 text-sm">
            <div><dt className="inline text-muted">Para </dt><dd className="inline font-semibold">{nomeProprio(p.favorecido.nome || "favorecido não informado")}</dd></div>
            <div><dt className="inline text-muted">Em </dt><dd className="inline">{p.municipio.ibge ? <Link className="link" to={`/municipio/${p.municipio.ibge}`}>{p.municipio.nome}</Link> : p.municipio.nome || "—"} {p.municipio.uf && <span className="text-muted">/{p.municipio.uf}</span>}</dd></div>
            <div><dt className="inline text-muted">Indicada por </dt><dd className="inline"><Link className="link" to={urlAutor(p.autor.codigo)}>{nomeProprio(p.autor.nome)}</Link></dd></div>
          </dl>
          {top!.length > 1 && (
            <div className="mt-auto pt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Logo atrás</p>
              <ol className="space-y-1.5 text-sm">
                {top!.slice(1).map((x, i) => (
                  <li key={`${x.codigoEmenda}-${x.favorecido.documento}-${x.mes}`} className="flex items-baseline gap-2">
                    <span className="w-4 shrink-0 text-xs text-muted tabular">{i + 2}º</span>
                    <span className="min-w-0 flex-1 truncate">{nomeProprio(x.favorecido.nome || x.municipio.nome)} <span className="text-muted">· {x.municipio.uf}</span></span>
                    <b className="shrink-0 tabular">{brl(x.valor)}</b>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </Story>
  );
}

function EstadoPerCapita({ f, q, brasil }: CardProps & { brasil: Brasil | undefined }) {
  const r = brasil ? ufsPerCapita(brasil, f) : null;
  const alvo = r?.destaque ?? r?.ranking[0];
  const real = (x: number) => reaisInteiros.format(x / 100);
  return (
    <Story id="estado" icon={<Landmark />} eyebrow="Estado que mais recebeu" cor="#009c3b"
      title={r?.destaque ? <>Quanto {alvo?.nome} recebeu por habitante — {r.destaque.posicao}º de {r.ranking.length} estados.</> : <>Por habitante, o estado que mais recebeu emendas pagas{f.tipo ? ` (${nomeTipoCurto(f.tipo)})` : ""}.</>}
      ignorados={r?.ignorados}
      share={alvo ? {
        kind: "uf", title: alvo.nome, url: `/emendas${q}#estado`, ogId: alvo.uf,
        text: `🗺️ ${alvo.nome} recebeu ${real(alvo.perCapita)} por habitante em emendas parlamentares pagas${f.tipo ? ` (${nomeTipoCurto(f.tipo)})` : ""}. Veja seu estado:`,
        bars: r!.ranking.slice(0, 5).map((u) => ({ label: u.uf, value: u.perCapita })),
      } : undefined}
      footer={<><span className="text-[11px] text-muted">População: {POPULACAO_FONTE}</span>{alvo && <Ver to={`/uf/${alvo.uf}`}>Ver {alvo.uf}</Ver>}</>}
    >
      {!r || !alvo ? <><Skeleton className="h-10 w-40" /><Skeleton className="mt-4 h-28" /></> : (
        <>
          <Grande><CountUp value={alvo.perCapita} format={real} /><span className="ml-1 text-base font-semibold text-muted">/hab.</span></Grande>
          <p className="mt-1 text-sm"><b>{alvo.nome}</b> <span className="text-muted">· {brl(alvo.pago)} no total</span></p>
          <div className="mt-4"><Bars data={[...r.ranking.slice(0, r.destaque && r.destaque.posicao > 5 ? 4 : 5), ...(r.destaque && r.destaque.posicao > 5 ? [r.destaque] : [])].map((u) => ({ label: u.nome, sub: r.destaque && u.uf === r.destaque.uf ? `${r.destaque.posicao}º` : undefined, value: u.perCapita, href: `/uf/${u.uf}`, color: u.uf === alvo.uf ? "#009c3b" : "#7fcf9e" }))} format={real} max={r.ranking[0]?.perCapita} /></div>
        </>
      )}
    </Story>
  );
}

function MunicipioTop({ f, rankings, uf }: Omit<CardProps, "q"> & { rankings: Rankings | undefined; uf: Uf | null }) {
  const r = municipiosDoRecorte(rankings, uf, f);
  const m = r?.lista[0];
  return (
    <Story id="municipio" icon={<MapPin />} eyebrow="Município que mais recebeu" cor="#2f80ed"
      title={r?.fonte === "historico" ? <>A cidade {noEstado(f.uf!)} com mais emendas pagas desde 2014.</> : <>A cidade que mais recebeu pagamentos de emendas nos últimos 12 meses.</>}
      ignorados={r?.ignorados}
      share={m ? {
        kind: "municipio", title: `${m.nome} (${m.uf})`, url: `/municipio/${m.ibge}`, ogId: m.ibge,
        text: `📍 ${m.nome} (${m.uf}) foi a cidade que mais recebeu emendas ${r?.fonte === "12m" ? "nos últimos 12 meses" : noEstado(m.uf)}: ${brl(m.valor)}. E a sua?`,
        metric: { value: m.valor, format: "brl", label: "recebidos" },
      } : undefined}
      footer={m ? <Ver to={`/municipio/${m.ibge}`}>Abrir {m.nome}</Ver> : undefined}
    >
      {!r || !m ? <><Skeleton className="h-10 w-40" /><Skeleton className="mt-4 h-28" /></> : (
        <>
          <Grande className="truncate text-[1.9rem] sm:text-[2.2rem]">{m.nome}<span className="ml-1.5 text-lg text-muted">{m.uf}</span></Grande>
          <p className="mt-1 text-sm"><b className="tabular"><CountUp value={m.valor} format={brl} /></b> <span className="text-muted">{r.fonte === "12m" ? "em 12 meses" : "pagos"}</span></p>
          <div className="mt-4"><Bars data={r.lista.slice(0, 5).map((x, i) => ({ label: x.nome, sub: x.uf, value: x.valor, href: `/municipio/${x.ibge}`, color: i === 0 ? "#2f80ed" : "#9cc2f5" }))} format={brl} /></div>
        </>
      )}
    </Story>
  );
}

function PartePix({ f, q, brasil, uf }: CardProps & { brasil: Brasil | undefined; uf: Uf | null }) {
  const fonte = f.uf ? uf?.porTipo : brasil?.porTipo;
  const r = fonte ? parteTipos(fonte) : null;
  const onde = f.uf ? noEstado(f.uf) : "no Brasil";
  const ign = [f.tipo && "tipo", f.ano && "ano"].filter(Boolean) as Array<"tipo" | "ano">;
  return (
    <Story id="pix" icon={<Zap />} eyebrow="Via Emenda Pix" cor="#e0b800"
      title={<>Parte do dinheiro pago {f.uf ? onde : ""} que caiu direto no caixa das prefeituras, sem projeto prévio — a <Term k="emenda pix">Emenda Pix</Term>.</>}
      ignorados={ign}
      share={r ? {
        kind: "pix", title: f.uf ? `Emenda Pix ${onde}` : "Emenda Pix", url: `/emendas${q}#pix`,
        text: `⚡ ${formatPct(r.pix)} das emendas pagas ${onde} foram via Emenda Pix — dinheiro direto na conta, sem convênio. Entenda:`,
        bars: r.tipos.slice(0, 5).map((t) => ({ label: nomeTipoCurto(t.tipo), value: t.pago })),
      } : undefined}
      footer={<Ver to="/pix">Explorar Emenda Pix</Ver>}
    >
      {!r ? <><Skeleton className="h-10 w-28" /><Skeleton className="mt-4 h-24" /></> : (
        <>
          <Grande><CountUp value={r.pix * 100} format={(n) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} /></Grande>
          <p className="mt-1 text-sm text-muted">{brl(r.tipos.find((t) => t.tipo === "pix")?.pago ?? 0)} de {brl(r.total)} pagos</p>
          <div className="mt-4">
            <BarraTipos porTipo={fonte!} href={(t) => (t === "outra" ? undefined : `/emendas?${new URLSearchParams({ tipo: t, ...(f.uf ? { uf: f.uf } : {}) })}`)}
              detalhe={(t) => (!f.uf && brasil ? { titulo: "Estados que mais receberam", itens: topUfPorTipo(brasil.fluxo, t) } : undefined)} />
          </div>
        </>
      )}
    </Story>
  );
}

function EmAberto({ f, q, abertas }: CardProps & { abertas: Abertas | undefined }) {
  const r = abertas ? abertoDoRecorte(abertas, f) : null;
  const onde = r ? recorteTexto(f, r.ignorados) : "";
  return (
    <Story id="aberto" icon={<Hourglass />} eyebrow="Ainda em aberto" cor="#c2410c"
      title={<>Dinheiro já <Term k="empenhado">reservado</Term> para emendas{onde ? ` (${onde})` : ""} que ainda não foi pago.</>}
      ignorados={r?.ignorados}
      share={r ? {
        kind: "pagina", title: "Emendas em aberto", url: `/emendas${q}#aberto`,
        text: `⏳ ${brl(r.aberto)} em emendas parlamentares estão reservados e ainda não foram pagos${onde ? ` (${onde})` : ""}. Veja onde:`,
        metric: { value: r.aberto, format: "brl", label: "em aberto" },
      } : undefined}
      footer={<span className="ml-auto text-xs text-muted">por ano de origem</span>}
    >
      {!r ? <><Skeleton className="h-10 w-40" /><Skeleton className="mt-4 h-16" /></> : (
        <>
          <Grande><CountUp value={r.aberto} format={brl} /></Grande>
          <p className="mt-1 text-sm text-muted">em {formatNumber(r.n)} emendas esperando pagamento</p>
          <div className="mt-auto pt-4"><MiniColunas data={r.serie.map((x) => ({ x: x.ano, y: x.aberto }))} destaque={f.ano} color="#c2410c" format={brl} /></div>
          <div className="mt-1 flex justify-between text-[11px] text-muted tabular"><span>{r.serie[0]?.ano}</span><span>{r.serie.at(-1)?.ano}</span></div>
        </>
      )}
    </Story>
  );
}

function Ultimos({ f, itens, ultimoMes }: { f: Filtros; itens: Pagamento[] | undefined; ultimoMes?: number }) {
  const ps = itens ? ultimosPagamentos(itens, f, 5) : null;
  return (
    <Story id="ultimos" icon={<Clock />} eyebrow="Últimos pagamentos" cor="#009c3b"
      title={<>Os maiores pagamentos do mês mais recente publicado{ultimoMes ? ` (${mesLongo(ultimoMes)})` : ""}.</>}
      footer={<Ver to="/ultimas">Ver todos os pagamentos</Ver>}
    >
      <ul className="min-h-[15rem] divide-y divide-line">
        {!ps ? [0, 1, 2, 3, 4].map((i) => <li key={i} className="py-2.5"><Skeleton className="h-9" /></li>) :
          ps.length === 0 ? <li className="py-3 text-sm text-muted">Nenhum pagamento recente neste recorte.</li> :
          ps.map((p) => (
            <li key={`${p.codigoEmenda}-${p.favorecido.documento}-${p.mes}`} className="flex items-center gap-3 py-2.5">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: COR_TIPO[p.tipo] }} title={nomeTipoCurto(p.tipo)}>{p.tipo === "pix" ? <Zap className="size-4" aria-hidden /> : p.municipio.uf || "BR"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{nomeProprio(p.favorecido.nome || p.municipio.nome || "—")}</span>
                <span className="block truncate text-xs text-muted">
                  {p.municipio.ibge ? <Link className="hover:underline" to={`/municipio/${p.municipio.ibge}`}>{p.municipio.nome}/{p.municipio.uf}</Link> : p.municipio.nome}
                  {" · "}<Link className="hover:underline" to={urlAutor(p.autor.codigo)}>{nomeProprio(p.autor.nome)}</Link>
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-display font-bold tabular">{brl(p.valor)}</span>
                <span className="block text-[11px] text-muted">{mesCurto(p.mes)}</span>
              </span>
            </li>
          ))}
      </ul>
    </Story>
  );
}

// ---------- Carrossel 1m / 3m / 12m ----------
export function CarrosselRankings({ f }: { f: Filtros }) {
  const [ref, visto] = useNaVista<HTMLDivElement>();
  const q = useApi<Rankings>(visto ? dataPath.rankings() : null);
  const slides = useMemo(() => (q.data ? slidesRanking(q.data, f) : null), [q.data, f]);
  const trilho = useRef<HTMLDivElement>(null);
  const mover = (d: number) => trilho.current?.scrollBy({ left: d * trilho.current.clientWidth * 0.8, behavior: "smooth" });
  const qs = filtrosQuery(f);
  const nomeJanela = (j: string) => (j === "1m" ? "No último mês" : `Nos últimos ${JANELA_ROTULO[j as "3m"]}`);

  return (
    <div ref={ref} className="relative">
      <div className="absolute -top-14 right-0 hidden gap-1 sm:flex">
        <button type="button" onClick={() => mover(-1)} aria-label="Anterior" className="press inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface hover:border-accent"><ChevronLeft className="size-4" /></button>
        <button type="button" onClick={() => mover(1)} aria-label="Próximo" className="press inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface hover:border-accent"><ChevronRight className="size-4" /></button>
      </div>
      <div ref={trilho} className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-3 [scrollbar-width:thin] sm:mx-0 sm:scroll-px-0 sm:px-0" role="region" aria-label="Rankings recentes, deslize para o lado">
        {(slides ?? [null, null, null]).map((s, i) => (
          <div key={s?.janela ?? i} className="w-[86%] shrink-0 snap-start sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.67rem)]">
            {!s ? <Skeleton className="h-[25rem] rounded-3xl" /> : (
              <Story id={`agora-${s.janela}`} icon={<Users />} eyebrow={nomeJanela(s.janela)} cor={["#009c3b", "#2f80ed", "#002776"][i]} className="h-full"
                title={<>{mesCurto(s.desde)}{s.desde !== s.ate ? ` a ${mesCurto(s.ate)}` : ""} · {formatNumber(s.pagamentos)} pagamentos{f.uf ? ` ${noEstado(f.uf)}` : ""}</>}
                ignorados={s.ignorados}
                share={{
                  kind: "pagina", title: `Emendas pagas — ${nomeJanela(s.janela).toLowerCase()}`, url: `/emendas${qs}#agora-${s.janela}`,
                  text: `📊 ${nomeJanela(s.janela)}, ${brl(s.valor)} em emendas foram pagos${f.uf ? ` ${noEstado(f.uf)}` : ""}. ${s.top[0] ? `Quem lidera: ${nomeProprio(s.top[0].label)}.` : ""} Veja o ranking:`,
                  bars: s.top.map((t) => ({ label: nomeProprio(t.label), value: t.value })), metric: { value: s.valor, format: "brl", label: "pagos" },
                }}
                footer={<Ver to="/ultimas">Feed completo</Ver>}
              >
                <Grande><CountUp value={s.valor} format={brl} /></Grande>
                {s.valorTipo !== null && f.tipo && <p className="mt-1 text-sm"><b className="tabular" style={{ color: COR_TIPO[f.tipo] }}>{brl(s.valorTipo)}</b> <span className="text-muted">em {nomeTipoCurto(f.tipo)} ({formatPct(s.valor ? s.valorTipo / s.valor : 0)})</span></p>}
                <p className="mb-3 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{f.uf ? "Cidades que mais receberam" : "Quem mais teve emendas pagas"}</p>
                {s.top.length ? <Bars data={s.top.map((t) => ({ ...t, label: nomeProprio(t.label) }))} format={brl} /> : <p className="text-sm text-muted">Sem pagamentos neste recorte.</p>}
              </Story>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
