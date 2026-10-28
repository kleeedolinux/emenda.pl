// Abertura do /emendas: total animado, explicação de uma linha, busca.
import type { Meta } from "@emenda/contracts";
import { ArrowRight, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ShareButton } from "@/features/share";
import { formatBRL, formatNumber } from "@/lib/format";
import { CountUp, openSearch, RevealText, Skeleton, Term } from "@/ui";
import { valorExtenso } from "./historias";

const SUGESTOES = ["Salvador", "Juazeiro do Norte", "Tabata Amaral", "Nikolas Ferreira"];

export function HeroEmendas({ meta }: { meta: Meta | undefined }) {
  const [q, setQ] = useState("");
  const submit = (e: FormEvent) => { e.preventDefault(); openSearch(q.trim()); };
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
            <span className="size-1.5 rounded-full bg-verde" aria-hidden />Emendas parlamentares · desde {anos}
          </p>
          <RevealText as="h1" className="mt-4 text-lg font-semibold text-muted sm:text-xl" step={0.05}>
            {"Dinheiro de emendas já pago pelo governo federal"}
          </RevealText>
          <div id="emendas-titulo" className="mt-1 min-h-[6rem] font-display text-[2.9rem] font-bold leading-[1.02] tracking-[-0.035em] sm:min-h-0 sm:whitespace-nowrap sm:text-[clamp(3rem,6vw,4.4rem)]">
            {t ? (
              <CountUp value={t.pago} format={(n) => valorExtenso(n)} className="bg-gradient-to-r from-verde via-[#1fa24f] to-azul bg-clip-text text-transparent dark:from-[#3ddc84] dark:via-amarelo dark:to-[#8fb4ff]" />
            ) : <Skeleton className="h-[0.95em] w-[9ch] rounded-2xl" />}
          </div>
          <p className="mt-4 max-w-2xl text-base text-fg/85 text-pretty sm:text-lg">
            <Term k="emenda">Emenda</Term> é a parte do Orçamento que deputados e senadores escolhem para onde vai — uma obra, um hospital, a prefeitura da sua cidade.{" "}
            <Link to="/entenda/o-que-e-emenda" className="link whitespace-nowrap font-medium">Entenda em 2 min</Link>
          </p>

          <form onSubmit={submit} role="search" className="mt-6 flex max-w-xl gap-2 rounded-2xl border border-line bg-surface/90 p-1.5 shadow-[0_18px_40px_-24px_rgb(0_39_118/0.5)] backdrop-blur">
            <label className="relative flex-1">
              <span className="sr-only">Busque seu município ou deputado</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cidade ou deputado"
                className="h-12 w-full rounded-xl bg-transparent pl-10 pr-2 text-base outline-none placeholder:text-muted/80 focus-visible:ring-2 focus-visible:ring-accent" />
            </label>
            <button type="submit" className="sheen press h-12 shrink-0 rounded-xl bg-verde-700 px-4 font-semibold text-white hover:bg-[#005c23] sm:px-6">Buscar</button>
          </form>
          <p className="mt-2.5 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-sm text-muted">
            Tente:
            {SUGESTOES.map((s) => (
              <button key={s} type="button" onClick={() => openSearch(s)} className="press rounded-full border border-line bg-surface-2/70 px-2.5 py-0.5 text-[13px] text-fg/80 hover:border-accent hover:text-fg">{s}</button>
            ))}
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-1">
          {[
            { k: "Emendas registradas", v: t ? <CountUp value={t.n} /> : null, h: "desde " + anos },
            { k: "Reservado (empenhado)", v: t ? <CountUp value={t.empenhado} format={(n) => formatBRL(n, true)} /> : null, h: "promessa de gasto", tip: "empenhado" },
            { k: "Pago em restos a pagar", v: t ? <CountUp value={t.rapPago} format={(n) => formatBRL(n, true)} /> : null, h: "de anos anteriores", tip: "restos a pagar" },
          ].map((x) => (
            <div key={x.k} className="rounded-2xl border border-line bg-surface/70 p-3 backdrop-blur sm:p-4">
              <dt className="text-[11px] font-medium leading-tight text-muted sm:text-xs">{x.tip ? <Term k={x.tip}>{x.k}</Term> : x.k}</dt>
              <dd className="mt-1 font-display text-lg font-bold leading-none tabular sm:text-2xl">{x.v ?? <Skeleton className="h-6 w-20" />}</dd>
              <dd className="mt-1 hidden text-xs text-muted sm:block">{x.h}</dd>
            </div>
          ))}
          <div className="col-span-3 flex flex-wrap items-center gap-2 lg:col-span-1">
            <ShareButton kind="pagina" title="Emendas parlamentares" url="/emendas"
              text={t ? `💰 ${valorExtenso(t.pago)} em emendas parlamentares já foram pagos desde ${anos} — ${formatNumber(t.n)} emendas. Veja quem mandou e para onde foi:` : undefined}
              metric={t ? { value: t.pago, format: "brl", label: "pagos" } : undefined} label="Compartilhar" />
            <Link to="/dinheiro" className="press inline-flex items-center gap-1 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-accent">Siga o dinheiro <ArrowRight className="size-4" aria-hidden /></Link>
          </div>
        </dl>
      </div>
    </section>
  );
}
