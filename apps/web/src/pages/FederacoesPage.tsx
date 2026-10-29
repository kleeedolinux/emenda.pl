import { CABECALHOS, CabecalhoPagina } from "@/features/linguagem";
import { Link } from "react-router";
import { Handshake } from "lucide-react";
import { Badge, Bars, Card, Money, PageHeader, PartyBadge, Section, Skeleton, Stat, StatGrid, Tip, formatDate, formatNumber, partyColor } from "@/ui";
import { Fontes } from "@/features/legislativo/components";
import { fontes, sen } from "@/features/legislativo/api";
import { ShareButton } from "@/features/share";
import { FEDERACOES, LEI_FEDERACOES, STF_ADI7021, vigencia } from "@/features/federacoes/dados";
import { useBancadas } from "@/features/federacoes/hooks";

const COMPARA: [string, string, string][] = [
  ["Para que serve", "Atuar como um único partido nas eleições e no Congresso", "Somar votos só na eleição"],
  ["Duração", "No mínimo 4 anos; quem sai antes sofre punições (ex.: não pode usar o fundo partidário até completar o prazo)", "Acabava depois da eleição"],
  ["Abrangência", "Nacional: vale em todos os estados e municípios", "Podia variar de estado para estado"],
  ["No Congresso", "Funciona como bancada única (liderança, orientação de voto)", "Sem efeito"],
  ["Situação hoje", "Permitida (Lei 14.208/2021, validada pelo STF)", "Proibida para deputados e vereadores desde 2020 (EC 97/2017)"],
];

export default function FederacoesPage() {
  const { bancadas, deps, sens, autores } = useBancadas(FEDERACOES);
  const totDep = bancadas?.reduce((s, b) => s + b.deputados.length, 0);
  const totSen = bancadas?.reduce((s, b) => s + b.senadores.length, 0);
  return (
    <>
      <CabecalhoPagina
        c={CABECALHOS.federacoes}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Partidos", to: "/partidos" }, { label: "Federações" }]}
        actions={<ShareButton kind="pagina" title="Federações partidárias" subtitle="Quem se uniu a quem, e o peso de cada federação no Congresso" url="/federacoes" />}
      />

      <StatGrid className="mb-8">
        <Stat label="Federações registradas no TSE" value={formatNumber(FEDERACOES.length)} />
        <Stat label="Partidos federados" value={formatNumber(FEDERACOES.reduce((s, f) => s + f.partidos.length, 0))} />
        <Stat label="Deputados em federações" value={totDep != null ? formatNumber(totDep) : "…"} hint={totDep != null ? `${((totDep / 513) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% da Câmara` : undefined} />
        <Stat label="Senadores em federações" value={totSen != null ? formatNumber(totSen) : "…"} hint="de 81" />
      </StatGrid>

      <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card title="O que é uma federação" tip="Lei 9.096/1995, art. 11-A, incluído pela Lei 14.208/2021.">
          <div className="space-y-2 text-sm">
            <p>Dois ou mais partidos se juntam e passam a funcionar <b>como se fossem um só</b>: lançam candidatos juntos, somam votos para dividir as cadeiras e, no Congresso, atuam como uma bancada única.</p>
            <p>Cada partido mantém nome, número e estrutura próprios, mas fica preso à federação por <b>no mínimo quatro anos</b>. O registro é feito no TSE.</p>
            <p className="text-muted">Na Câmara, a federação orienta o voto como uma bancada só; nas orientações oficiais ela aparece como “Fdr PT-PCdoB-PV”, “Fdr PSOL-REDE” etc.</p>
          </div>
        </Card>
        <Card title="Federação × coligação">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="py-1.5 pr-3 font-medium" scope="col"></th><th className="py-1.5 pr-3 font-semibold text-fg" scope="col">Federação</th><th className="py-1.5 font-semibold text-fg" scope="col">Coligação</th></tr></thead>
              <tbody className="divide-y divide-line">
                {COMPARA.map(([k, a, b]) => <tr key={k}><th scope="row" className="py-2 pr-3 align-top text-xs font-medium text-muted">{k}</th><td className="py-2 pr-3 align-top">{a}</td><td className="py-2 align-top text-muted">{b}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Section title="Federações em vigor" tip="Lista conferida no TSE (federações registradas). Bancadas e emendas são calculadas ao vivo com os parlamentares hoje filiados a cada partido.">
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {FEDERACOES.map((f, i) => {
            const b = bancadas?.[i];
            const v = vigencia(f);
            return (
              <li key={f.id} className="card relative flex flex-col p-5 transition hover:shadow-[0_0_0_1px_var(--color-accent)]">
                <span className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ background: `linear-gradient(90deg, ${f.partidos.map((p) => partyColor(p)).join(",")})` }} aria-hidden />
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-accent"><Handshake className="size-4" aria-hidden />Desde {formatDate(f.deferimento)}</p>
                <Link to={`/federacao/${f.id}`} className="mt-1 text-lg font-bold leading-snug hover:underline after:absolute after:inset-0 after:content-['']">{f.nome}</Link>
                <p className="relative z-10 mt-2 flex flex-wrap gap-1.5">{f.partidos.map((p) => <PartyBadge key={p} sigla={p} />)}</p>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-surface-2 p-2"><dt className="text-[11px] text-muted">Deputados</dt><dd className="font-display text-xl font-bold tabular">{b ? b.deputados.length : <Skeleton className="mx-auto h-6 w-8" />}</dd></div>
                  <div className="rounded-xl bg-surface-2 p-2"><dt className="text-[11px] text-muted">Senadores</dt><dd className="font-display text-xl font-bold tabular">{b ? b.senadores.length : <Skeleton className="mx-auto h-6 w-8" />}</dd></div>
                  <div className="rounded-xl bg-surface-2 p-2"><dt className="text-[11px] text-muted">Dinheiro mandado</dt><dd className="font-display text-base font-bold tabular leading-7">{b?.pago != null ? <Money centavos={b.pago} compact /> : autores.isError ? "—" : <Skeleton className="mx-auto h-6 w-12" />}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-muted">
                  Prazo mínimo: até {formatDate(v.minimoAte)} {v.cumpriuMinimo ? <Badge tone="neutro">cumprido; segue registrada</Badge> : <Badge tone="verde">em curso</Badge>}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted">Dinheiro mandado: soma dos valores pagos (Portal da Transparência) das emendas de autoria dos parlamentares hoje filiados, ao longo de toda a carreira.<Tip content="Cruzamento por nome entre a lista de parlamentares e os autores de emendas; pode haver parlamentar sem correspondência." /></p>
      </Section>

      <Section title="Peso no Congresso">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Cadeiras na Câmara" tip="Deputados em exercício, de 513.">
            {bancadas ? <Bars data={FEDERACOES.map((f, i) => ({ label: f.nome.replace("Federação ", ""), value: bancadas[i]!.deputados.length, href: `/federacao/${f.id}`, color: partyColor(f.partidos[0]!) })).sort((a, b) => b.value - a.value)} /> : <Skeleton className="h-40" />}
          </Card>
          <Card title="Cadeiras no Senado" tip="Senadores em exercício, de 81.">
            {bancadas ? <Bars data={FEDERACOES.map((f, i) => ({ label: f.nome.replace("Federação ", ""), value: bancadas[i]!.senadores.length, href: `/federacao/${f.id}`, color: partyColor(f.partidos[0]!) })).sort((a, b) => b.value - a.value)} /> : <Skeleton className="h-40" />}
          </Card>
        </div>
        {(deps.isError || sens.isError) && <p className="mt-2 text-sm text-vermelho">Não foi possível carregar parte das bancadas agora.</p>}
      </Section>

      <Fontes items={[
        ...FEDERACOES.flatMap((f) => f.fontes).filter((x, i, a) => a.findIndex((y) => y.href === x.href) === i),
        LEI_FEDERACOES, STF_ADI7021,
        { label: "EC 97/2017 (fim das coligações proporcionais)", href: "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc97.htm" },
        { label: "Deputados (API da Câmara)", href: fontes.camaraApi("/deputados") },
        { label: "Senadores (API do Senado)", href: fontes.senadoApi(sen.listaAtual()) },
        ...fontes.emendas(),
      ]} />
    </>
  );
}
