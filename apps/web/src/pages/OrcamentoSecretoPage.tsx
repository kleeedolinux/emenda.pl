// /orcamento-secreto: história do orçamento secreto (emendas de relator-geral) com dados oficiais e fontes.
import { dataPath, UF_POR_CODIGO, UFS, type Autor, type Brasil, type Pix, type SiglaUf } from "@emenda/contracts";
import { EyeOff } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router";
import { AreasGasto, CABECALHOS, CabecalhoPagina } from "@/features/linguagem";
import { F } from "@/features/entenda/temas";
import { antesEDepois, resumoSecreto } from "@/features/orcamento/secreto";
import { ShareButton } from "@/features/share";
import { bandeiraUf } from "@/lib/cdn";
import { ibge, useApi } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { Choropleth, CountUp, ErrorState, ExternalLink, NextSteps, Skeleton } from "@/ui";

const brl = (n: number) => formatBRL(n, true);
const URL_PAGINA = "/orcamento-secreto";
const VERMELHO = "#dc2626";

function Bloco({ id, titulo, share, children }: { id: string; titulo: string; share: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="card scroll-mt-24 p-4 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 id={`${id}-t`} className="text-lg font-bold sm:text-xl">{titulo}</h2>
        <ShareButton compact kind="pagina" title={`Orçamento secreto: ${titulo}`} text={share} url={`${URL_PAGINA}#${id}`} />
      </div>
      {children}
    </section>
  );
}

function BarrasAno({ dados }: { dados: Array<{ ano: number; pago: number }> }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...dados.map((d) => d.pago));
  return (
    <ol className="flex h-56 items-end gap-3 sm:gap-6" aria-label="Pago por ano">
      {dados.map((d, i) => (
        <li key={d.ano} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className="text-xs font-semibold tabular sm:text-sm">{brl(d.pago)}</span>
          <motion.span className="w-full origin-bottom rounded-t-lg" style={{ height: `${(d.pago / max) * 100}%`, background: VERMELHO }}
            initial={reduce ? false : { scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }} />
          <span className="text-sm text-muted">{d.ano}</span>
        </li>
      ))}
    </ol>
  );
}

export default function OrcamentoSecretoPage() {
  const b = useApi<Brasil>(dataPath.brasil());
  const rel = useApi<Autor>(dataPath.autor("8100"));
  const pix = useApi<Pix>(dataPath.pix());
  const r = useMemo(() => (b.data ? resumoSecreto(b.data, rel.data) : null), [b.data, rel.data]);
  const linha = useMemo(() => (r ? antesEDepois(r.porAno, pix.data) : []), [r, pix.data]);
  const gancho = r ? `${brl(r.total)} foram distribuídos sem mostrar quem pediu. Veja para onde foi 👇` : "";
  const values = useMemo(() => {
    const v: Record<string, number | undefined> = {};
    if (r) for (const [cod, uf] of Object.entries(UF_POR_CODIGO)) v[cod] = r.porUf.find((x) => x.uf === uf)?.pago;
    return v;
  }, [r]);

  return (
    <>
      <CabecalhoPagina c={CABECALHOS.orcamentoSecreto}
        eyebrow={<span className="inline-flex items-center gap-1"><EyeOff className="size-3.5" aria-hidden />Dinheiro sem nome de quem pediu</span>}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Orçamento secreto" }]}
        actions={r ? <ShareButton fab kind="pagina" title="Orçamento secreto" text={gancho} url={URL_PAGINA} metric={{ value: r.total, format: "brl", label: "sem mostrar quem pediu" }} /> : undefined} />

      {b.isError ? <ErrorState error={b.error} retry={() => b.refetch()} /> : !r ? <Skeleton className="h-64 rounded-3xl" /> : (
        <div className="grid grid-cols-1 gap-5">
          <section className="card overflow-hidden p-5 sm:p-8" style={{ background: `linear-gradient(135deg, ${VERMELHO}14, transparent 60%)` }}>
            <p className="text-sm font-semibold text-muted">Pago pelo orçamento secreto</p>
            <p className="font-display text-5xl font-bold tracking-tight tabular sm:text-7xl" style={{ color: VERMELHO }}><CountUp value={r.total} format={brl} /></p>
            <p className="mt-3 text-sm text-muted">Quem pediu cada valor não aparece nos dados oficiais usados aqui: no Portal da Transparência, todo esse dinheiro está em nome do “relator-geral”. Ainda não cruzamos as listas de nomes que o Congresso publicou depois da decisão do STF.</p>
          </section>

          <Bloco id="por-ano" titulo="Quanto foi pago, ano a ano" share={gancho}>
            {rel.data ? <BarrasAno dados={r.porAno} /> : <Skeleton className="h-56" />}
            {rel.data && r.cobertura.semAno > 0 && <p className="mt-3 text-sm text-muted">Aqui estão {brl(r.cobertura.comAno)} pagos em nome do “relator-geral”. Os outros {brl(r.cobertura.semAno)} aparecem nos dados sem esse detalhe por ano.</p>}
          </Bloco>

          <Bloco id="mapa" titulo="Para quais estados foi" share={gancho}>
            <p className="mb-3 text-sm text-muted">Só {brl(r.cobertura.comEstado)} têm estado definido. Os outros {brl(r.cobertura.semEstado)} foram para órgãos nacionais ou para vários estados ao mesmo tempo. Toque num estado para ver tudo o que chegou lá.</p>
            <Choropleth url={ibge.malhaBrasilUF()} values={values}
              label={(c) => UFS[UF_POR_CODIGO[c] as SiglaUf] ?? c}
              href={(c) => (UF_POR_CODIGO[c] ? `/uf/${UF_POR_CODIGO[c]}` : null)}
              format={brl} ariaLabel="Mapa do Brasil: dinheiro do orçamento secreto por estado." />
            <ol className="mt-4 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {r.porUf.slice(0, 8).map((u, i) => (
                <li key={u.uf}>
                  <Link to={`/uf/${u.uf}`} className="flex min-h-11 items-center gap-3 rounded-lg px-1 hover:bg-surface-2">
                    <span className="w-5 text-right text-sm text-muted tabular">{i + 1}</span>
                    <img src={bandeiraUf(u.uf, 64)} alt="" width={24} height={17} loading="lazy" className="h-[17px] w-6 rounded-[2px] object-cover ring-1 ring-line" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                    <span className="min-w-0 flex-1 truncate font-medium">{u.nome}</span>
                    <span className="text-sm font-semibold tabular">{brl(u.pago)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </Bloco>

          <Bloco id="quem-recebeu" titulo="Quem mais recebeu" share={gancho}>
            {!rel.data ? <Skeleton className="h-40" /> : r.recebedores.length ? (
              <ol className="grid gap-1">
                {r.recebedores.map((x, i) => (
                  <li key={i} className="flex min-h-11 items-center gap-3 border-b border-line py-1 last:border-0">
                    <span className="w-5 text-right text-sm text-muted tabular">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{x.nome}</span>
                    <span className="text-sm font-semibold tabular">{brl(x.valor)}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-muted">Sem lista de quem recebeu.</p>}
          </Bloco>

          <Bloco id="no-que" titulo="No que foi gasto" share={gancho}>
            <AreasGasto itens={b.data!.fluxo.filter((f) => f.tipo === "relator").map((f) => ({ funcao: f.funcao, valor: f.pago }))} inicial={6} />
          </Bloco>

          <Bloco id="depois" titulo="O que mudou depois" share="Depois que o STF acabou com o orçamento secreto, cresceu o dinheiro mandado sem dizer para quê. Veja os números 👇">
            <ol className="relative grid gap-4 border-l-2 border-line pl-5">
              <li><b>2020–2022:</b> o relator do Orçamento distribui bilhões sem mostrar quem pediu.</li>
              <li><b>Dezembro de 2022:</b> o STF decide que isso não pode continuar.</li>
              <li><b>Depois:</b> parte do dinheiro passa a ser mandada de outros jeitos, como o dinheiro mandado sem dizer para quê.</li>
            </ol>
            {linha.length > 0 && (
              <table className="mt-5 w-full text-sm">
                <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Ano</th><th className="py-1 text-right font-medium">Orçamento secreto</th><th className="py-1 text-right font-medium"><Link className="link" to="/pix">Sem dizer para quê</Link></th></tr></thead>
                <tbody>{linha.map((l) => <tr key={l.ano} className="border-t border-line"><td className="py-1.5">{l.ano}</td><td className="py-1.5 text-right tabular" style={{ color: l.secreto ? VERMELHO : undefined }}>{l.secreto ? brl(l.secreto) : "—"}</td><td className="py-1.5 text-right tabular">{l.pix ? brl(l.pix) : "—"}</td></tr>)}</tbody>
              </table>
            )}
          </Bloco>

          <section className="card p-4 sm:p-6">
            <h2 className="mb-2 font-semibold">Fontes oficiais</h2>
            <ul className="grid gap-1 text-sm">
              {[F.adpf850, F.adpf851, F.adpf854, F.portal, F.ec126].map((f) => <li key={f.href}><ExternalLink href={f.href}>{f.label}</ExternalLink></li>)}
            </ul>
          </section>
        </div>
      )}
      <NextSteps items={[
        { to: "/pix", label: "Dinheiro sem dizer para quê", desc: "O jeito de mandar dinheiro que mais cresceu." },
        { to: "/emendas?tipo=relator", label: "Cada pagamento", desc: "A lista completa, com valores." },
        { to: "/entenda/emenda-de-relator", label: "Entenda em 1 minuto", desc: "Como funcionava, passo a passo." },
      ]} />
    </>
  );
}
