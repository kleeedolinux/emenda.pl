import { HERO } from "@/features/linguagem/cabecalhos";
// Abertura do /emendas: total animado, explicação de uma linha, busca.
import type { Meta } from "@emenda/contracts";
import { ArrowRight, Search } from "lucide-react";
import { Link } from "react-router";
import { ShareButton } from "@/features/share";
import { formatBRL, formatNumber } from "@/lib/format";
import { CountUp, RevealText, Skeleton, Term } from "@/ui";
import { BuscaUniversal, abrirBusca } from "@/features/busca";
import { valorExtenso } from "./historias";

export function HeroEmendas({ meta }: { meta: Meta | undefined }) {
  const t = meta?.totais;
  const anos = meta ? `${meta.anos[0]}` : "2014";

  return (
    <section aria-labelledby="emendas-titulo" className="relative isolate overflow-hidden rounded-[2rem] border border-line bg-surface px-5 pb-7 pt-8 shadow-[0_30px_80px_-50px_rgb(0_39_118/0.45)] sm:px-10 sm:pb-10 sm:pt-12">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute -left-24 -top-32 size-[28rem] rounded-full bg-verde/15 blur-3xl" />
        <div className="absolute -bottom-40 right-[-6rem] size-[30rem] rounded-full bg-azul/12 blur-3xl dark:bg-azul-400/15" />
        <div className="absolute right-[18%] top-10 size-40 rounded-full bg-amarelo/25 blur-3xl dark:bg-amarelo/10" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-end">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent sm:text-[11px] sm:tracking-[0.16em]">
            <span className="size-1.5 rounded-full bg-verde" aria-hidden />{HERO.eyebrow} {anos}
          </p>
          <RevealText as="h1" className="mt-4 text-lg font-semibold text-muted sm:text-xl" step={0.05}>
            {HERO.rotulo}
          </RevealText>
          <div id="emendas-titulo" className="mt-1 min-h-[6rem] font-display text-[2.9rem] font-bold leading-[1.02] tracking-[-0.035em] sm:min-h-0 sm:whitespace-nowrap sm:text-[clamp(3rem,6vw,4.4rem)]">
            {t ? (
              <Link to="/dinheiro" className="hover:opacity-90" aria-label={`${valorExtenso(t.pago)}: ver para onde foi`}>
                <CountUp value={t.pago} format={(n) => valorExtenso(n)} className="bg-gradient-to-r from-verde via-[#1fa24f] to-azul bg-clip-text text-transparent dark:from-[#3ddc84] dark:via-amarelo dark:to-[#8fb4ff]" />
              </Link>
            ) : <Skeleton className="h-[0.95em] w-[9ch] rounded-2xl" />}
          </div>
          <p className="mt-4 max-w-2xl text-base text-fg/85 text-pretty sm:text-lg">
            {HERO.linha}
            <span className="mt-1 block text-xs text-muted"><Term k="emenda">{HERO.oficial}</Term> · <Link className="link" to="/entenda">Entenda em 2 min</Link></span>
          </p>

          <div className="mt-6 max-w-xl rounded-2xl border border-line bg-surface/90 p-2.5 shadow-[0_18px_40px_-24px_rgb(0_39_118/0.5)] backdrop-blur">
            <BuscaUniversal variante="hero" modoInicial="cidade" onFocoMovel={(q, m) => abrirBusca(q, m)} />
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-1">
          {[
            { k: "Indicações", v: t ? <CountUp value={t.n} /> : null, h: "desde " + anos },
            { k: "Prometido", v: t ? <CountUp value={t.empenhado} format={(n) => formatBRL(n, true)} /> : null, h: "promessa de gasto", tip: "empenhado" },
            { k: "Pago depois", v: t ? <CountUp value={t.rapPago} format={(n) => formatBRL(n, true)} /> : null, h: "de anos anteriores", tip: "restos a pagar" },
          ].map((x) => (
            <div key={x.k} className="rounded-2xl border border-line bg-surface/70 p-3 backdrop-blur sm:p-4">
              <dt className="text-[11px] font-medium leading-tight text-muted sm:text-xs">{x.tip ? <Term k={x.tip}>{x.k}</Term> : x.k}</dt>
              <dd className="mt-1 font-display text-lg font-bold leading-none tabular sm:text-2xl">{x.v ?? <Skeleton className="h-6 w-20" />}</dd>
              <dd className="mt-1 hidden text-xs text-muted sm:block">{x.h}</dd>
            </div>
          ))}
          <div className="col-span-3 flex flex-wrap items-center gap-2 lg:col-span-1">
            <ShareButton kind="pagina" title="Emendas parlamentares" url="/emendas"
              text={t ? `💰 Deputados e senadores já mandaram ${valorExtenso(t.pago)} para cidades e estados desde ${anos}. Veja quanto chegou na sua cidade e quem mandou:` : undefined}
              metric={t ? { value: t.pago, format: "brl", label: "pagos" } : undefined} label="Compartilhar" />
            <Link to="/dinheiro" className="press inline-flex items-center gap-1 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-accent">Siga o dinheiro <ArrowRight className="size-4" aria-hidden /></Link>
          </div>
        </dl>
      </div>
    </section>
  );
}
