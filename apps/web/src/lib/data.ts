// Acesso a dados: tudo same-origin (/api/* e /data/* servidos pelo Worker).
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { GeoFC } from "@/features/geo/malhas";

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
  /** Presente no índice estático (public/geo/municipios.json). */
  uf?: string;
  microrregiao?: { nome: string; mesorregiao?: { nome: string; UF?: { sigla: string; nome: string; regiao?: { nome: string } } } } | null;
  "regiao-imediata"?: { nome: string; "regiao-intermediaria"?: { nome: string; UF?: { sigla: string; nome: string; regiao?: { nome: string } } } } | null;
}

/** Malha geográfica (TopoJSON estático ou GeoJSON) já como FeatureCollection. */
export function useMalha(url: string | null): UseQueryResult<GeoFC, Error> {
  return useQuery<GeoFC, Error>({
    queryKey: ["malha", url],
    queryFn: async ({ signal }) => {
      // topojson-client só entra quando um mapa é desenhado (fora do bundle inicial).
      const [{ toFeatureCollection }, raw] = await Promise.all([import("@/features/geo/malhas"), fetchJson<unknown>(url!, signal)]);
      return toFeatureCollection(raw);
    },
    enabled: !!url,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: noRetry404,
  });
}

export const ibge = {
  municipios: () => "/api/ibge/v1/localidades/municipios",
  municipio: (id: string | number) => `/api/ibge/v1/localidades/municipios/${id}`,
  /** Malhas estáticas (TopoJSON em public/geo, geradas por scripts/fetch-geo.ts). */
  malhaBrasilUF: () => "/geo/br-uf.json",
  malhaUF: (uf: string) => `/geo/uf/${uf.toUpperCase()}.json`,
  /** Índice estático [id, nome, uf] de todos os municípios. */
  municipiosIndice: () => "/geo/municipios.json",
};

export const ufDoMunicipio = (m: IbgeMunicipio) =>
  m.uf || (m.microrregiao?.mesorregiao?.UF?.sigla ?? m["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ?? "");

/** Lista de municípios (índice estático; cache longo: muda raramente). */
export function useMunicipiosIbge(enabled = true) {
  return useQuery<IbgeMunicipio[], Error>({
    queryKey: ["ibge-municipios"],
    queryFn: async ({ signal }) =>
      (await fetchJson<Array<[number, string, string]>>(ibge.municipiosIndice(), signal)).map(([id, nome, uf]) => ({ id, nome, uf })),
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
