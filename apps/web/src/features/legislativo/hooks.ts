// Hooks de dados (react-query). Toda chamada é same-origin via Worker.
import { useQueries, useQuery } from "@tanstack/react-query";
import { dataPath, type Autor, type AutorResumo } from "@emenda/contracts";
import { fetchJson, HttpError } from "@/lib/data";
import { indexAutores, lastPage, type LegislaturaApi, type Pagina, cam } from "./api";

const CAM = "/api/camara";
const SEN = "/api/senado";
const retry = (n: number, e: unknown) => !(e instanceof HttpError && e.status < 500) && n < 1;
const DIA = 86_400_000;

/** Página da Câmara com `links` (para paginação). */
export function useCamaraPagina<T>(path: string | null) {
  return useQuery<Pagina<T>, Error>({
    queryKey: ["camara-pagina", path],
    queryFn: ({ signal }) => fetchJson<Pagina<T>>(`${CAM}${path}`, signal),
    enabled: !!path,
    retry,
    placeholderData: (prev) => prev,
  });
}

/** Busca todas as páginas (itens=100) de um recurso da Câmara. */
export async function camaraTodas<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const sep = path.includes("?") ? "&" : "?";
  const first = await fetchJson<Pagina<T>>(`${CAM}${path}${sep}pagina=1${/[?&]itens=/.test(path) ? "" : "&itens=100"}`, signal);
  const n = lastPage(first.links);
  const rest = await Promise.all(
    Array.from({ length: n - 1 }, (_, i) =>
      fetchJson<Pagina<T>>(`${CAM}${path}${sep}pagina=${i + 2}${/[?&]itens=/.test(path) ? "" : "&itens=100"}`, signal).then((p) => p.dados)),
  );
  return [...first.dados, ...rest.flat()];
}

export function useCamaraTodas<T>(path: string | null, staleTime = 60 * 60_000) {
  return useQuery<T[], Error>({
    queryKey: ["camara-todas", path],
    queryFn: ({ signal }) => camaraTodas<T>(path!, signal),
    enabled: !!path,
    retry,
    staleTime,
  });
}

/** Várias listas completas da Câmara em paralelo (ex.: uma por legislatura). */
export function useCamaraTodasVarias<T>(paths: string[], enabled = true) {
  return useQueries({
    queries: paths.map((p) => ({
      queryKey: ["camara-todas", p],
      queryFn: ({ signal }: { signal: AbortSignal }) => camaraTodas<T>(p, signal),
      enabled,
      retry,
      staleTime: DIA,
      gcTime: DIA,
    })),
  });
}

/** JSON do Senado já mapeado. */
export function useSenado<R>(path: string | null, map?: (j: never) => R) {
  return useQuery<R, Error>({
    queryKey: ["senado", path],
    queryFn: async ({ signal }) => {
      const j = await fetchJson<unknown>(`${SEN}${path}`, signal);
      return map ? map(j as never) : (j as R);
    },
    enabled: !!path,
    retry,
    staleTime: 30 * 60_000,
  });
}

export function useLegislaturas() {
  return useQuery<LegislaturaApi[], Error>({
    queryKey: ["legislaturas"],
    queryFn: ({ signal }) => fetchJson<Pagina<LegislaturaApi>>(`${CAM}${cam.legislaturas()}`, signal).then((p) => p.dados),
    staleTime: DIA, gcTime: DIA, retry,
  });
}

/** autores.json + índice por chave de nome. */
export function useAutores() {
  return useQuery({
    queryKey: ["json", dataPath.autores()],
    queryFn: ({ signal }) => fetchJson<AutorResumo[]>(dataPath.autores(), signal),
    select: (as) => ({ lista: as, idx: indexAutores(as) }),
    staleTime: DIA,
    retry,
  });
}

export function useAutor(codigo: string | null | undefined) {
  return useQuery<Autor, Error>({
    queryKey: ["json", codigo ? dataPath.autor(codigo) : null],
    queryFn: ({ signal }) => fetchJson<Autor>(dataPath.autor(codigo!), signal),
    enabled: !!codigo,
    retry,
    staleTime: DIA,
  });
}
