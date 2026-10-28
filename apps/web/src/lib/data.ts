// Acesso a dados: tudo same-origin (/api/* e /data/* servidos pelo Worker).
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

export class HttpError extends Error {
  constructor(public status: number, public url: string) {
    super(status === 404 ? "Dados ainda não disponíveis para este item." : `Falha ao carregar (${status}).`);
    this.name = "HttpError";
  }
}

export async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new HttpError(res.status, path);
  return (await res.json()) as T;
}

/** Resposta padrão da API de Dados Abertos da Câmara. */
export interface CamaraResponse<T> { dados: T; links?: { rel: string; href: string }[] }

/** Desembrulha {dados, links} da Câmara. */
export async function camara<T>(path: string, signal?: AbortSignal): Promise<T> {
  const p = path.startsWith("/api/camara") ? path : `/api/camara${path.startsWith("/") ? "" : "/"}${path}`;
  return (await fetchJson<CamaraResponse<T>>(p, signal)).dados;
}

const noRetry404 = (n: number, e: unknown) => !(e instanceof HttpError && e.status === 404) && n < 1;

/** Hook JSON genérico. `null` desliga a busca. */
export function useApi<T>(path: string | null): UseQueryResult<T, Error> {
  return useQuery<T, Error>({
    queryKey: ["json", path],
    queryFn: ({ signal }) => fetchJson<T>(path!, signal),
    enabled: !!path,
    retry: noRetry404,
  });
}

/** Hook para a API da Câmara já desembrulhada. */
export function useCamara<T>(path: string | null): UseQueryResult<T, Error> {
  return useQuery<T, Error>({
    queryKey: ["camara", path],
    queryFn: ({ signal }) => camara<T>(path!, signal),
    enabled: !!path,
    retry: noRetry404,
  });
}

// ---------- IBGE ----------
export interface IbgeMunicipio {
  id: number;
  nome: string;
  microrregiao?: { nome: string; mesorregiao?: { nome: string; UF?: { sigla: string; nome: string; regiao?: { nome: string } } } } | null;
  "regiao-imediata"?: { nome: string; "regiao-intermediaria"?: { nome: string; UF?: { sigla: string; nome: string; regiao?: { nome: string } } } } | null;
}

export const ibge = {
  municipios: () => "/api/ibge/v1/localidades/municipios",
  municipio: (id: string | number) => `/api/ibge/v1/localidades/municipios/${id}`,
  malhaBrasilUF: () => "/api/ibge/v3/malhas/paises/BR?intrarregiao=UF&formato=application/vnd.geo%2Bjson&qualidade=minima",
  malhaUF: (uf: string) =>
    `/api/ibge/v3/malhas/estados/${uf.toUpperCase()}?intrarregiao=municipio&formato=application/vnd.geo%2Bjson&qualidade=minima`,
};

export const ufDoMunicipio = (m: IbgeMunicipio) =>
  m.microrregiao?.mesorregiao?.UF?.sigla ?? m["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ?? "";

/** Lista de municípios do IBGE (cache longo: muda raramente). */
export function useMunicipiosIbge(enabled = true) {
  return useQuery<IbgeMunicipio[], Error>({
    queryKey: ["ibge-municipios"],
    queryFn: ({ signal }) => fetchJson<IbgeMunicipio[]>(ibge.municipios(), signal),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

// ---------- Links externos ----------
export const externo = {
  emenda: (codigo: string) => `https://portaldatransparencia.gov.br/emendas/detalhe?codigoEmenda=${encodeURIComponent(codigo)}`,
  cnpj: (doc: string) => `https://cnpj.biz/${doc.replace(/\D/g, "")}`,
};
