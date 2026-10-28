// Dados ao vivo das federações: bancadas (Câmara/Senado), emendas (autores.json) e coesão nas pautas.
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { camara } from "@/lib/data";
import { cam, mapSenadores, sen, type DeputadoLista, type SenadorResumo, type VotacaoLista } from "@/features/legislativo/api";
import { useAutores, useCamaraTodas, useSenado } from "@/features/legislativo/hooks";
import { PAUTAS } from "@/features/legislativo/pautas";
import type { VotoCamara } from "@/features/legislativo/votacao";
import { bancadaFederacao, votacaoPrincipal } from "./bancada";
import { coesaoFederacao, type Federacao } from "./dados";

/** Mesma chave da PartidoPage: a lista de deputados em exercício fica em cache entre páginas. */
export function useParlamentares() {
  const deps = useCamaraTodas<DeputadoLista>("/deputados?ordem=ASC&ordenarPor=nome");
  const sens = useSenado<SenadorResumo[]>(sen.listaAtual(), mapSenadores);
  const autores = useAutores();
  return { deps, sens, autores };
}

export function useBancadas(fs: Federacao[]) {
  const { deps, sens, autores } = useParlamentares();
  const bancadas = useMemo(
    () => (deps.data && sens.data ? fs.map((f) => bancadaFederacao(f, deps.data, sens.data, autores.data?.idx ?? null)) : null),
    [fs, deps.data, sens.data, autores.data],
  );
  return { bancadas, deps, sens, autores };
}

/** Para cada pauta de grande repercussão: votação nominal principal no Plenário e a coesão da federação. */
export function useCoesao(f: Federacao, ativo = true) {
  const listas = useQueries({
    queries: PAUTAS.map((p) => ({
      queryKey: ["camara", cam.votacoesProposicao(p.camaraId)],
      queryFn: ({ signal }: { signal: AbortSignal }) => camara<VotacaoLista[]>(cam.votacoesProposicao(p.camaraId), signal),
      staleTime: 6 * 60 * 60_000, enabled: ativo,
    })),
  });
  const principais = listas.map((l) => (l.data ? votacaoPrincipal(l.data) : null));
  const votos = useQueries({
    queries: principais.map((v) => ({
      queryKey: ["camara", v ? cam.votos(v.id) : null],
      queryFn: ({ signal }: { signal: AbortSignal }) => camara<VotoCamara[]>(cam.votos(v!.id), signal),
      enabled: ativo && !!v, staleTime: 24 * 60 * 60_000,
    })),
  });
  const linhas = PAUTAS.map((p, i) => ({
    pauta: p, votacao: principais[i] ?? null,
    carregando: listas[i]!.isPending || (!!principais[i] && votos[i]!.isPending),
    coesao: votos[i]?.data ? coesaoFederacao(votos[i]!.data!, f) : null,
  }));
  return linhas;
}
