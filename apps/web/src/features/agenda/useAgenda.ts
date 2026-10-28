// Busca da agenda nas duas Casas (via proxies same-origin /api/camara e /api/senado).
import { useQuery } from "@tanstack/react-query";
import { camara, fetchJson, useCamara } from "@/ui";
import {
  fromCamara, fromSenadoReuniao, fromSenadoSessao, materiaCamara, mesesDaSemana, ordenar,
  type AgendaEvento, type CamaraEvento, type CamaraPautaItem, type SenadoReuniao, type SenadoSessao, type Semana,
} from "./agenda";

const arr = <T,>(x: T | T[] | null | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const ITENS = 100;

async function camaraSemana(s: Semana, signal: AbortSignal): Promise<AgendaEvento[]> {
  const out: CamaraEvento[] = [];
  for (let pagina = 1; pagina <= 8; pagina++) {
    const page = await camara<CamaraEvento[]>(
      `/eventos?dataInicio=${s.inicio}&dataFim=${s.fim}&ordem=ASC&ordenarPor=dataHoraInicio&itens=${ITENS}&pagina=${pagina}`, signal);
    out.push(...page);
    if (page.length < ITENS) break;
  }
  return out.map(fromCamara);
}

interface PlenarioResp { AgendaPlenario?: { Sessoes?: { Sessao?: SenadoSessao | SenadoSessao[] } } }
interface ReuniaoResp { AgendaReuniao?: { reunioes?: { reuniao?: SenadoReuniao | SenadoReuniao[] } } }

async function senadoSemana(s: Semana, signal: AbortSignal): Promise<AgendaEvento[]> {
  const [plen, com] = await Promise.all([
    Promise.all(mesesDaSemana(s).map((d) => fetchJson<PlenarioResp>(`/api/senado/plenario/agenda/mes/${d}.json`, signal))),
    fetchJson<ReuniaoResp>(`/api/senado/comissao/agenda/${s.inicio.replaceAll("-", "")}/${s.fim.replaceAll("-", "")}.json`, signal),
  ]);
  const sessoes = plen.flatMap((r) => arr(r.AgendaPlenario?.Sessoes?.Sessao)).map(fromSenadoSessao);
  const reunioes = arr(com.AgendaReuniao?.reunioes?.reuniao).map(fromSenadoReuniao);
  const visto = new Set<string>();
  return [...sessoes, ...reunioes].filter((e) => {
    if (e.dia < s.inicio || e.dia > s.fim || visto.has(e.id)) return false;
    visto.add(e.id);
    return true;
  });
}

const STALE = 5 * 60_000;

export function useAgendaSemana(s: Semana) {
  const cam = useQuery({ queryKey: ["agenda", "camara", s.inicio], queryFn: ({ signal }) => camaraSemana(s, signal), staleTime: STALE });
  const sen = useQuery({ queryKey: ["agenda", "senado", s.inicio], queryFn: ({ signal }) => senadoSemana(s, signal), staleTime: STALE, retry: 1 });
  const eventos = [...(cam.data ?? []), ...(sen.data ?? [])].sort(ordenar);
  return { eventos, camara: cam, senado: sen };
}

export function usePautaCamara(id: number | undefined) {
  const q = useCamara<CamaraPautaItem[]>(id ? `/eventos/${id}/pauta` : null);
  return { ...q, materias: q.data?.map(materiaCamara) };
}

export interface CamaraVotacao {
  id: string;
  dataHoraRegistro?: string;
  siglaOrgao?: string;
  descricao?: string;
  aprovacao?: number | null;
  proposicaoObjeto?: string | null;
}

export const useVotacoesEvento = (id: number | undefined) => useCamara<CamaraVotacao[]>(id ? `/eventos/${id}/votacoes` : null);
