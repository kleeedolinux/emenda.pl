// Hooks de dados das comissões (react-query; tudo same-origin via Worker).
import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { camara, fetchJson } from "@/lib/data";
import { camaraTodas, useCamaraTodas, useSenado } from "@/features/legislativo/hooks";
import {
  camOrg, indexProximasCamara, indexProximasSenado, mapAgendaSenado, mapComissaoSenado, mapListaSenado, mapMembrosCamara, senCom,
  type EventoCamara, type MembroCamaraRaw, type OrgaoCamara, type OrgaoCamaraDetalhe,
} from "./api";

const HORA = 60 * 60_000;
export const hojeIso = () => new Date().toISOString().slice(0, 10);
export const somaDias = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86_400_000).toISOString().slice(0, 10);
/** "Agora" no fuso de Brasília (as APIs usam hora local), formato AAAA-MM-DDTHH:MM. */
export const agoraBrasilia = () => new Date(Date.now() - 3 * HORA).toISOString().slice(0, 16);

export function useOrgaosCamara(codTipo: number, dataInicio?: string) {
  return useCamaraTodas<OrgaoCamara>(camOrg.lista(codTipo, dataInicio), 6 * HORA);
}

/** CPIs da Câmara criadas na legislatura, só as ainda em funcionamento (sem data de fim, ou fim futuro). */
export function useCpisCamaraAtivas() {
  const lista = useOrgaosCamara(4, "2023-02-01");
  const det = useQueries({
    queries: (lista.data ?? []).map((o) => ({
      queryKey: ["camara", camOrg.orgao(o.id)],
      queryFn: ({ signal }: { signal: AbortSignal }) => camara<OrgaoCamaraDetalhe>(camOrg.orgao(o.id), signal),
      staleTime: 6 * HORA,
    })),
  });
  const hoje = hojeIso();
  const prontos = det.every((d) => !d.isPending);
  return {
    isPending: lista.isPending || !prontos,
    data: det.flatMap((d) => (d.data && (!d.data.dataFim || d.data.dataFim.slice(0, 10) >= hoje) ? [d.data] : [])),
  };
}

export function useListaSenado(tipo: "permanente" | "cpi" | "temporaria" | "mista") {
  const path = tipo === "mista" ? senCom.mistas() : senCom.lista(tipo);
  return useSenado(path, (j: never) => mapListaSenado(j, tipo));
}

/** Próximas reuniões das comissões da Câmara (30 dias), indexadas por id do órgão. */
export function useProximasCamara() {
  const h = hojeIso();
  const q = useCamaraTodas<EventoCamara>(camOrg.eventosTodos(h, somaDias(h, 30)), 30 * 60_000);
  return { ...q, mapa: q.data ? indexProximasCamara(q.data, agoraBrasilia()) : null };
}
export function useAgendaSenado(diasAntes = 0, diasDepois = 30) {
  const h = hojeIso();
  return useSenado(senCom.agenda(somaDias(h, -diasAntes), somaDias(h, diasDepois)), mapAgendaSenado);
}
export function useProximasSenado() {
  const q = useAgendaSenado();
  return { ...q, mapa: q.data ? indexProximasSenado(q.data, agoraBrasilia()) : null };
}

export function useMembrosCamara(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ["camara-todas", id ? camOrg.membros(id) : null],
    queryFn: ({ signal }) => camaraTodas<MembroCamaraRaw>(camOrg.membros(id!), signal),
    enabled: !!id && enabled,
    staleTime: 6 * HORA,
    select: mapMembrosCamara,
  });
}
export function useComissaoSenado(codigo: number | null, enabled = true) {
  return useSenado(codigo && enabled ? senCom.comissao(codigo) : null, mapComissaoSenado);
}

/** Pauta de vários eventos da Câmara (em paralelo). */
export function usePautas(ids: number[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ["camara", camOrg.pauta(id)],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchJson<{ dados: import("./api").ItemPautaCamara[] }>(`/api/camara${camOrg.pauta(id)}`, signal).then((r) => r.dados),
      staleTime: 30 * 60_000,
    })),
  });
}

/** true quando o elemento entra na tela (uma vez): adia buscas por cartão. */
export function useNaTela<T extends Element>() {
  const ref = useRef<T>(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    if (visto || !ref.current) return;
    if (typeof IntersectionObserver === "undefined") { setVisto(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVisto(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visto]);
  return [ref, visto] as const;
}
