import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { UFS } from "@emenda/contracts";
import { CalendarDays, ClipboardCheck, Landmark, Users } from "lucide-react";
import { ErrorState, NextSteps, PageHeader, Section, Skeleton } from "@/ui";
import { ShareButton } from "@/features/share";
import { Campo, Fontes, Segmentado, selectCls } from "@/features/legislativo/components";
import { cam, fontes, sen } from "@/features/legislativo/api";
import { gastosPath, dataPath } from "@emenda/contracts";
import { filtrarMembros, contar } from "@/features/congresso/composicao";
import { LEGS, LEG_ATUAL, filtrosToSearch, parseFiltros, type Casa, type FiltrosCongresso } from "@/features/congresso/filtros";
import { useMembros, useVotacoesCamara, useVotacoesSenado } from "@/features/congresso/hooks";
import { Contadores, Tributos } from "@/features/congresso/PainelContadores";
import { Retrato } from "@/features/congresso/Retrato";
import { Destaques, Partidos, Rankings, useDadosRankings } from "@/features/congresso/PainelRankings";
import { ResumoPLs, Votacoes } from "@/features/congresso/Atividade";
import { Repositorio } from "@/features/congresso/Repositorio";
import { ARRECADACAO_PATH } from "@/features/congresso/contadores";

export default function CongressoPage() {
  const [sp, setSp] = useSearchParams();
  const f = parseFiltros(sp);
  const set = (p: Partial<FiltrosCongresso>) => setSp((cur) => filtrosToSearch({ ...f, ...p }, cur), { replace: true, preventScrollReset: true });

  const { membros: todos, senadores, carregando, erro, refetch } = useMembros(f.leg);
  const membros = useMemo(() => (todos ? filtrarMembros(todos, f) : []), [todos, f.casa, f.partido, f.uf]); // eslint-disable-line react-hooks/exhaustive-deps
  const partidos = useMemo(() => (todos ? contar(todos, (m) => m.partido).map((c) => c.label).sort((a, b) => a.localeCompare(b, "pt-BR")) : []), [todos]);
  const vc = useVotacoesCamara();
  const vs = useVotacoesSenado();
  const d = useDadosRankings(membros, f, vc, vs);
  const url = `/congresso${sp.toString() ? `?${filtrosToSearch(f).toString()}` : ""}`;
  const recorte = [f.casa === "camara" ? "Câmara" : f.casa === "senado" ? "Senado" : "", f.partido, f.uf, f.leg !== LEG_ATUAL ? `${f.leg}ª legislatura` : ""].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        eyebrow="Congresso Nacional"
        title="O Congresso em números"
        subtitle="Quem ocupa as 594 cadeiras, quanto usam da cota, quanto indicaram em emendas, se comparecem às votações e o que está sendo votado — tudo calculado a partir de dados oficiais."
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Congresso" }]}
        actions={<ShareButton kind="pagina" title={`O Congresso em números${recorte ? ` — ${recorte}` : ""}`} url={url} subtitle="Câmara e Senado com dados oficiais" />}
      />

      <div className="sticky top-16 z-20 -mx-4 mb-8 border-y border-line bg-bg/85 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex flex-wrap items-end gap-3">
          <Segmentado<Casa> label="Casa" value={f.casa} onChange={(casa) => set({ casa })} options={[{ value: "ambas", label: "Congresso" }, { value: "camara", label: "Câmara" }, { value: "senado", label: "Senado" }]} />
          <Campo label="Partido">
            <select className={selectCls} value={f.partido} onChange={(e) => set({ partido: e.target.value })}>
              <option value="">Todos</option>
              {partidos.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Campo>
          <Campo label="Estado">
            <select className={selectCls} value={f.uf} onChange={(e) => set({ uf: e.target.value })}>
              <option value="">Todos</option>
              {Object.entries(UFS).map(([s, n]) => <option key={s} value={s}>{s} — {n}</option>)}
            </select>
          </Campo>
          <Campo label="Legislatura" tip="Composição e trocas de partido aceitam legislaturas passadas. Presença, orientação e votações são sempre do período recente.">
            <select className={selectCls} value={f.leg} onChange={(e) => set({ leg: Number(e.target.value) })}>
              {LEGS.map((l) => <option key={l} value={l}>{l === LEG_ATUAL ? `${l}ª (atual, 2023–2027)` : `${l}ª (${2023 + 4 * (l - 57)}–${2027 + 4 * (l - 57)})`}</option>)}
            </select>
          </Campo>
          {(f.partido || f.uf || f.casa !== "ambas" || f.leg !== LEG_ATUAL) && (
            <button type="button" className="press text-sm font-semibold text-accent hover:underline" onClick={() => set({ casa: "ambas", partido: "", uf: "", leg: LEG_ATUAL })}>Limpar filtros</button>
          )}
        </div>
      </div>

      <Section title="Agora" id="agora" tip="Contadores ao vivo calculados a partir dos últimos dados oficiais publicados.">
        <Contadores />
      </Section>

      {erro ? <ErrorState error={erro} retry={refetch} /> : carregando || !todos ? <Skeleton className="h-96" /> : (
        <>
          <Section title="Retrato" id="retrato">
            <Retrato todos={todos} membros={membros} senadores={senadores} f={f} />
          </Section>

          <Section title="Destaques" id="destaques" tip="Quem está no topo e na base de cada indicador, no recorte escolhido.">
            <Destaques d={d} />
          </Section>

          <Section title="Rankings" id="rankings" tip="Cada linha leva ao perfil e ao boletim de auditoria do parlamentar.">
            <Rankings membros={membros} d={d} f={f} url={url} />
          </Section>

          <Section title="Partidos lado a lado" id="partidos">
            <Partidos membros={membros} d={d} />
          </Section>
        </>
      )}

      <Section title="Votações recentes no Plenário" id="votacoes" tip="Votações nominais (com placar) dos últimos 90 dias. Na Câmara, abra para ver o voto de cada deputado.">
        <Votacoes vc={vc} vs={vs} casa={f.casa} />
      </Section>

      <Section title="Resumo das proposições" id="proposicoes">
        <ResumoPLs membros={todos} vc={vc} />
      </Section>

      <Section title="Arrecadação federal" id="arrecadacao">
        <Tributos />
      </Section>

      {todos && (
        <Section title="Todos os dados" id="repositorio">
          <Repositorio membros={membros} d={d} />
        </Section>
      )}

      <Fontes items={[
        { label: "Deputados (API da Câmara)", href: fontes.camaraApi("/deputados") },
        { label: "Senadores (API do Senado)", href: fontes.senadoApi(sen.listaAtual()) },
        { label: "Votações da Câmara (API)", href: fontes.camaraApi("/votacoes?idOrgao=180") },
        { label: "Votações do Senado (API)", href: fontes.senadoApi("/votacao") },
        { label: "Proposições (API da Câmara)", href: fontes.camaraApi(cam.tiposProposicao()) },
        { label: "Cota parlamentar — ranking (JSON)", href: gastosPath.ranking() },
        { label: "Emendas por autor (JSON)", href: dataPath.autores() },
        ...fontes.emendas(),
        { label: "Receita Federal — arrecadação (CSV)", href: "https://www.gov.br/receitafederal/dados/arrecadacao-estado.csv" },
        { label: "Arrecadação (JSON)", href: ARRECADACAO_PATH },
      ]} />

      <NextSteps items={[
        { to: "/agenda", label: "Agenda do Plenário", desc: "O que está marcado para votar hoje e nos próximos dias.", icon: <CalendarDays className="size-5" /> },
        { to: "/auditar", label: "Auditar um parlamentar", desc: "Boletim completo com presença, votos, gastos e emendas.", icon: <ClipboardCheck className="size-5" /> },
        { to: "/partidos", label: "Partidos", desc: "Bancadas e emendas por partido.", icon: <Users className="size-5" /> },
        { to: "/federacoes", label: "Federações", desc: "Como os partidos federados votam juntos.", icon: <Landmark className="size-5" /> },
      ]} />
    </>
  );
}
