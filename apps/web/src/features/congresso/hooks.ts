// Coleta de dados da página /congresso. Tudo same-origin: /api/camara, /api/senado, /data/v1.
// Rankings que dependem de votações usam amostras pequenas e cache longo (react-query).
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { gastosPath, type Brasil, type GastosRanking, dataPath } from "@emenda/contracts";
import { camara, fetchJson, useApi } from "@/lib/data";
import {
  cam, dedupeDeputados, lastPage, mapSenadores, qs, sen,
  type Autor as AutorProp, type DeputadoLista, type Pagina, type ProposicaoDetalhe, type ProposicaoLista, type SenadorResumo, type Tema, type VotacaoLista, type VotacaoSenado,
} from "@/features/legislativo/api";
import { useAutores, useCamaraTodas, useCamaraTodasVarias, useLegislaturas, useSenado } from "@/features/legislativo/hooks";
import { contarLegislaturas, duracaoDias, hojeISO, periodosSenado, tempoEstimadoLegislaturas } from "@/features/legislativo/mandatos";
import { placarDaDescricao, type Orientacao, type VotoCamara } from "@/features/legislativo/votacao";
import { emLotes } from "@/features/bancadas/hooks";
import { deputadoMembro, senadorMembro, type Membro } from "./composicao";
import { LEG_ATUAL } from "./filtros";
import type { AmostraVotacao } from "./rankings";
import type { EntradaResumo } from "./resumo";
import { aprovadasDasVotacoes } from "./votacoes";
import { ARRECADACAO_PATH, type Arrecadacao } from "./contadores";

const HORA = 3_600_000;
const DIA = 24 * HORA;
/** Votações nominais recentes do Plenário da Câmara usadas em presença/fidelidade/coesão. */
export const AMOSTRA_CAMARA = 30;
/** Janela (dias) das votações do Senado e da Câmara. */
export const JANELA_DIAS = 90;

export const diasAtras = (n: number, hoje = hojeISO()) => new Date(Date.parse(hoje) - n * DIA).toISOString().slice(0, 10);

// ---------- Membros ----------
export function useMembros(leg: number) {
  const atual = leg === LEG_ATUAL;
  const deps = useCamaraTodas<DeputadoLista>(atual ? "/deputados?ordem=ASC&ordenarPor=nome" : cam.deputados({ idLegislatura: leg }));
  const mulheres = useCamaraTodas<DeputadoLista>(atual ? "/deputados?siglaSexo=F" : `/deputados?siglaSexo=F&idLegislatura=${leg}`);
  const sens = useSenado<SenadorResumo[]>(atual ? sen.listaAtual() : sen.listaLegislatura(leg, leg), mapSenadores);
  const membros = useMemo(() => {
    if (!deps.data || !sens.data) return null;
    const f = new Set((mulheres.data ?? []).map((d) => d.id));
    const sexoOk = !!mulheres.data;
    return [
      ...dedupeDeputados(deps.data).map((d) => deputadoMembro(d, sexoOk ? (f.has(d.id) ? "F" : "M") : "")),
      ...sens.data.map(senadorMembro),
    ];
  }, [deps.data, mulheres.data, sens.data]);
  return { membros, senadores: sens.data ?? null, carregando: deps.isPending || sens.isPending, erro: deps.error ?? sens.error ?? null, refetch: () => { void deps.refetch(); void sens.refetch(); } };
}

/** Ids da legislatura anterior (novatos x quem já estava). */
export function useAnteriores(leg: number) {
  const q = useCamaraTodas<DeputadoLista>(cam.deputados({ idLegislatura: leg - 1 }), DIA);
  return useMemo(() => (q.data ? new Set(q.data.map((d) => String(d.id))) : null), [q.data]);
}

/** Lista completa da legislatura (repete o deputado a cada troca de partido). */
export const useListaLegislatura = (leg: number) => useCamaraTodas<DeputadoLista>(cam.deputados({ idLegislatura: leg }), DIA);

/** Tempo de casa: Câmara somando legislaturas (1983+, estimativa); Senado pelos exercícios do mandato atual. */
export function useTempoDeCasa(leg: number, senadores: SenadorResumo[] | null, ativo: boolean) {
  const legs = Array.from({ length: Math.max(0, leg - 47 + 1) }, (_, i) => 47 + i);
  const hist = useCamaraTodasVarias<DeputadoLista>(legs.map((l) => `/deputados?idLegislatura=${l}`), ativo);
  const legislaturas = useLegislaturas();
  const pronto = ativo && hist.every((h) => h.isSuccess) && !!legislaturas.data;
  const carregadas = hist.filter((h) => h.isSuccess).length;
  const camara = useMemo(() => {
    if (!pronto) return null;
    const c = contarLegislaturas(hist.flatMap((h) => h.data ?? []));
    const hoje = leg === LEG_ATUAL ? hojeISO() : (legislaturas.data!.find((l) => l.id === leg)?.dataFim ?? hojeISO());
    return new Map([...c].filter(([, ls]) => ls.has(leg)).map(([id, ls]) => [String(id), tempoEstimadoLegislaturas(ls, legislaturas.data!, hoje)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, leg]);
  const senado = useMemo(() => (senadores ? new Map(senadores.map((s) => [s.codigo, duracaoDias(periodosSenado(s.mandatos).flatMap((m) => m.periodos))])) : null), [senadores]);
  return { camara, senado, progresso: legs.length ? carregadas / legs.length : 1 };
}

// ---------- Dados estáticos ----------
export const useGastosRanking = () => useApi<GastosRanking>(gastosPath.ranking());
export const useBrasil = () => useApi<Brasil>(dataPath.brasil());
export function useArrecadacao() {
  return useQuery<Arrecadacao, Error>({
    queryKey: ["json", ARRECADACAO_PATH],
    queryFn: ({ signal }) => fetchJson<Arrecadacao>(ARRECADACAO_PATH, signal),
    retry: false,
    staleTime: DIA,
  });
}
export { useAutores };

// ---------- Votações ----------
const pathVotacoesCamara = (hoje: string) =>
  qs("/votacoes", { idOrgao: 180, dataInicio: diasAtras(JANELA_DIAS, hoje), dataFim: hoje, itens: 200, ordem: "DESC", ordenarPor: "dataHoraRegistro" });

export function useVotacoesCamara() {
  const hoje = hojeISO();
  return useQuery<VotacaoLista[], Error>({
    queryKey: ["congresso", "votacoes-camara", hoje],
    queryFn: ({ signal }) => camara<VotacaoLista[]>(pathVotacoesCamara(hoje), signal),
    staleTime: 2 * HORA,
    retry: 1,
  });
}

export function useVotacoesSenado() {
  const hoje = hojeISO();
  return useSenado<VotacaoSenado[]>(qs("/votacao", { dataInicio: diasAtras(JANELA_DIAS, hoje), dataFim: hoje }), (j: unknown) => (Array.isArray(j) ? (j as VotacaoSenado[]) : []));
}

/** Votos + orientações das últimas `AMOSTRA_CAMARA` votações nominais da Câmara. */
export function useAmostraCamara(lista: VotacaoLista[] | undefined) {
  const ids = useMemo(() => (lista ?? []).filter((v) => placarDaDescricao(v.descricao)).slice(0, AMOSTRA_CAMARA).map((v) => v.id), [lista]);
  return useQuery<AmostraVotacao[], Error>({
    queryKey: ["congresso", "amostra-camara", ids],
    enabled: ids.length > 0,
    staleTime: 6 * HORA,
    gcTime: DIA,
    queryFn: async ({ signal }) => {
      const r = await emLotes(ids, 6, async (id): Promise<AmostraVotacao | null> => {
        try {
          const [votos, orientacoes] = await Promise.all([
            fetchJson<Pagina<VotoCamara>>(`/api/camara${cam.votos(id)}`, signal).then((p) => p.dados),
            camara<Orientacao[]>(cam.orientacoes(id), signal).catch(() => [] as Orientacao[]),
          ]);
          return { votos, orientacoes };
        } catch (e) {
          if (signal.aborted) throw e;
          return null; // votação com falha na fonte fica fora da amostra
        }
      });
      return r.filter((x): x is AmostraVotacao => x !== null);
    },
  });
}

// ---------- Produção legislativa ----------
export const TIPOS_PRODUCAO = ["PL", "PLP", "PEC"] as const;

/** Total de proposições pelo link "last" com itens=1 (uma requisição por contagem). */
async function contarProposicoes(params: Record<string, string | number | Array<string | number>>, signal?: AbortSignal) {
  const p = await fetchJson<Pagina<unknown>>(`/api/camara${qs("/proposicoes", { ...params, itens: 1 })}`, signal);
  return p.dados.length ? lastPage(p.links) : 0;
}

export function useProducaoAnual(anos: number[]) {
  return useQueries({
    queries: anos.map((ano) => ({
      queryKey: ["congresso", "producao", ano],
      queryFn: ({ signal }: { signal: AbortSignal }) => contarProposicoes({ siglaTipo: TIPOS_PRODUCAO.join(","), ano }, signal),
      staleTime: DIA,
    })),
  });
}

/** Sob demanda: proposições (PL/PLP/PEC) apresentadas por deputado na legislatura. */
export function useProducaoDeputados(ids: string[], anos: number[], ativo: boolean) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ["congresso", "producao-dep", id, anos.join(",")],
      queryFn: ({ signal }: { signal: AbortSignal }) => contarProposicoes({ idDeputadoAutor: id, siglaTipo: TIPOS_PRODUCAO.join(","), ano: anos }, signal),
      enabled: ativo,
      staleTime: DIA,
      gcTime: DIA,
      retry: 1,
    })),
  });
}

// ---------- Perfil detalhado (idade, escolaridade, profissão) ----------
export interface PerfilDetalhe { nascimento: string | null; escolaridade: string | null; profissao: string | null }

export function usePerfis(ms: Membro[], ativo: boolean) {
  return useQueries({
    queries: ms.map((m) => ({
      queryKey: ["congresso", "perfil", m.casa, m.id],
      enabled: ativo,
      staleTime: 7 * DIA,
      gcTime: DIA,
      retry: 1,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<PerfilDetalhe> => {
        if (m.casa === "camara") {
          const [d, ps] = await Promise.all([
            camara<{ dataNascimento: string | null; escolaridade: string | null }>(cam.deputado(m.id), signal),
            camara<Array<{ titulo: string; dataHora: string | null }>>(cam.profissoes(m.id), signal).catch(() => []),
          ]);
          return { nascimento: d.dataNascimento, escolaridade: d.escolaridade, profissao: ps.find((p) => p.titulo)?.titulo ?? null };
        }
        const [d, p] = await Promise.all([
          fetchJson<{ DetalheParlamentar?: { Parlamentar?: { DadosBasicosParlamentar?: { DataNascimento?: string } } } }>(`/api/senado${sen.senador(m.id)}`, signal),
          fetchJson<unknown>(`/api/senado/senador/${m.id}/profissao`, signal).catch(() => null),
        ]);
        const prof = /"NomeProfissao":"([^"]+)"/.exec(JSON.stringify(p ?? {}))?.[1] ?? null;
        return { nascimento: d.DetalheParlamentar?.Parlamentar?.DadosBasicosParlamentar?.DataNascimento ?? null, escolaridade: null, profissao: prof };
      },
    })),
  });
}

// ---------- Resumo de PLs ----------
export type ModoResumo = "apresentadas" | "aprovadas";
export const RESUMO_N = 12;

async function entradaResumo(id: number, signal: AbortSignal, deps: ReadonlyMap<string, Membro>): Promise<EntradaResumo | null> {
  try {
    const [d, temas, autores] = await Promise.all([
      camara<ProposicaoDetalhe & { ementaDetalhada?: string }>(cam.proposicao(id), signal),
      camara<Tema[]>(cam.temas(id), signal).catch(() => [] as Tema[]),
      camara<AutorProp[]>(cam.autores(id), signal).catch(() => [] as AutorProp[]),
    ]);
    return {
      id: d.id, siglaTipo: d.siglaTipo, numero: d.numero, ano: d.ano, ementa: d.ementa, explicacao: d.ementaDetalhada || null, keywords: d.keywords,
      temas: temas.map((t) => t.tema),
      autores: autores.sort((a, b) => a.ordemAssinatura - b.ordemAssinatura).map((a) => {
        const dep = /\/deputados\/(\d+)$/.exec(a.uri ?? "")?.[1];
        const m = dep ? deps.get(dep) : undefined;
        return { nome: m?.nome ?? a.nome, tipo: a.tipo, partido: m?.partido, uf: m?.uf };
      }),
      regime: d.statusProposicao?.regime ?? null, situacao: d.statusProposicao?.descricaoSituacao ?? null,
      orgao: d.statusProposicao?.siglaOrgao ?? null, dataApresentacao: d.dataApresentacao ?? null,
    };
  } catch (e) {
    if (signal.aborted) throw e;
    return null;
  }
}

export function useResumoPLs(modo: ModoResumo, membros: Membro[] | null, votacoes: VotacaoLista[] | undefined) {
  const hoje = hojeISO();
  const deps = useMemo(() => new Map((membros ?? []).filter((m) => m.casa === "camara").map((m) => [m.id, m])), [membros]);
  const aprovadas = useMemo(() => aprovadasDasVotacoes(votacoes ?? [], RESUMO_N), [votacoes]);
  return useQuery<EntradaResumo[], Error>({
    queryKey: ["congresso", "resumo", modo, modo === "aprovadas" ? aprovadas : hoje, deps.size],
    enabled: !!membros && (modo === "apresentadas" || !!votacoes),
    staleTime: 6 * HORA,
    queryFn: async ({ signal }) => {
      const ids = modo === "aprovadas"
        ? aprovadas
        : (await camara<ProposicaoLista[]>(qs("/proposicoes", {
          siglaTipo: "PL,PLP,PEC,MPV", dataApresentacaoInicio: diasAtras(14, hoje), dataApresentacaoFim: hoje, ordem: "DESC", ordenarPor: "id", itens: RESUMO_N,
        }), signal)).map((p) => p.id);
      const r = await emLotes(ids, 4, (id) => entradaResumo(id, signal, deps));
      return r.filter((x): x is EntradaResumo => x !== null);
    },
  });
}
