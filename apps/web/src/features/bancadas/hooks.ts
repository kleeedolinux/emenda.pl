// Dados das bancadas (Câmara via /api/camara, mesmo cache das outras páginas).
import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { camara, fetchJson } from "@/lib/data";
import { cam, type Pagina, type VotacaoLista } from "@/features/legislativo/api";
import { useCamaraTodas } from "@/features/legislativo/hooks";
import { PAUTAS, type Pauta } from "@/features/legislativo/pautas";
import { escolherVotacaoFinal } from "@/features/perfil/resumo";
import type { VotoCamara } from "@/features/legislativo/votacao";
import type { FrenteLista, MembroFrente } from "./bancadas";

export const LEGISLATURA = 57;
const DIA = 86_400_000;
export const pathFrentes = `/frentes?idLegislatura=${LEGISLATURA}`;
export const pathFrente = (id: number) => `/frentes/${id}`;
export const pathMembros = (id: number) => `/frentes/${id}/membros`;

/** Executa `f` sobre `xs` com no máximo `n` chamadas simultâneas (respeita a API pública). */
export async function emLotes<T, R>(xs: readonly T[], n: number, f: (x: T, i: number) => Promise<R>, onProgresso?: (feitos: number) => void): Promise<R[]> {
  const out = new Array<R>(xs.length);
  let i = 0, feitos = 0;
  const worker = async () => {
    while (i < xs.length) {
      const k = i++;
      out[k] = await f(xs[k]!, k);
      onProgresso?.(++feitos);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, worker));
  return out;
}

export const useFrentes = () => useCamaraTodas<FrenteLista>(pathFrentes, DIA);

/** Membros de várias frentes (mesma chave de cache de `useCamara(pathMembros(id))`). */
export function useMembrosVarias(ids: readonly number[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ["camara", pathMembros(id)],
      queryFn: ({ signal }: { signal: AbortSignal }) => camara<MembroFrente[]>(pathMembros(id), signal),
      staleTime: DIA, retry: 1,
    })),
  });
}

/** Tamanho de todas as frentes, sob demanda (≈ 300 chamadas em lotes de 6). */
export function useTamanhos(ids: readonly number[], ativo: boolean) {
  const [estado, setEstado] = useState<{ mapa: Map<number, number>; feitos: number; pronto: boolean }>({ mapa: new Map(), feitos: 0, pronto: false });
  const chave = ids.join(",");
  useEffect(() => {
    if (!ativo || !ids.length) return;
    const ctrl = new AbortController();
    const mapa = new Map<number, number>();
    setEstado({ mapa: new Map(), feitos: 0, pronto: false });
    emLotes(ids, 6, async (id) => {
      try { mapa.set(id, (await camara<MembroFrente[]>(pathMembros(id), ctrl.signal)).length); } catch { /* frente sem membros públicos */ }
    }, (feitos) => { if (feitos % 10 === 0 || feitos === ids.length) setEstado({ mapa: new Map(mapa), feitos, pronto: feitos === ids.length }); })
      .catch(() => undefined);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ativo]);
  return { ...estado, total: ids.length };
}

export interface VotacaoPauta { pauta: Pauta; votacao: VotacaoLista; votos: VotoCamara[] | null }

/** Votação de mérito de cada pauta polêmica + votos nominais (mesmas chaves de cache de perfil/Pautas). */
export function useVotosPautas() {
  const listas = useQueries({
    queries: PAUTAS.map((p) => ({
      queryKey: ["camara", cam.votacoesProposicao(p.camaraId)],
      queryFn: ({ signal }: { signal: AbortSignal }) => camara<VotacaoLista[]>(cam.votacoesProposicao(p.camaraId), signal),
      staleTime: DIA, retry: 0,
    })),
  });
  const finais = PAUTAS.map((_, i) => (listas[i]?.data ? escolherVotacaoFinal(listas[i]!.data!) : null));
  const votos = useQueries({
    queries: finais.map((v) => ({
      queryKey: ["camara-pagina", v ? cam.votos(v.id) : null],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchJson<Pagina<VotoCamara>>(`/api/camara${cam.votos(v!.id)}`, signal),
      enabled: !!v, staleTime: DIA, retry: 0,
    })),
  });
  const carregando = listas.some((q) => q.isPending) || votos.some((q, i) => !!finais[i] && q.isPending);
  const itens: VotacaoPauta[] = PAUTAS.flatMap((pauta, i) => {
    const v = finais[i];
    return v ? [{ pauta, votacao: v, votos: votos[i]?.data?.dados ?? null }] : [];
  });
  return { itens, carregando };
}
