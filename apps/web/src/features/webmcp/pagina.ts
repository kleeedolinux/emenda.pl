// Página do site → recurso /v1 equivalente (rotas de src/router.tsx).

const UM: Record<string, (p: string) => string> = {
  deputado: (p) => `/v1/deputados/${p}`,
  senador: (p) => `/v1/senadores/${p}`,
  municipio: (p) => `/v1/municipios/${p}`,
  uf: (p) => `/v1/ufs/${p.toUpperCase()}`,
  autor: (p) => `/v1/autores/${p}`,
  proposicao: (p) => `/v1/proposicoes/${p}`,
  votacao: (p) => `/v1/votacoes/${p}`,
  partido: (p) => `/v1/partidos/${p}`,
};

const FIXAS: Record<string, string> = { "": "/v1/brasil", agenda: "/v1/agenda", pix: "/v1/pix", ultimas: "/v1/feed" };

/** `pathname` → caminho /v1, ou null se a página não tem entidade. */
export function paginaParaRota(pathname: string): string | null {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return FIXAS[""]!;
  if (segs.length === 1) return FIXAS[segs[0]!] ?? null;
  if (segs.length === 2) return UM[segs[0]!]?.(segs[1]!) ?? null;
  return null;
}
