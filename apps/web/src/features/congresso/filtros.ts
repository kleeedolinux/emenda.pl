// Filtros da página /congresso, sincronizados com a URL. Puro.
import { UFS } from "@emenda/contracts";

export type Casa = "ambas" | "camara" | "senado";
export interface FiltrosCongresso { casa: Casa; partido: string; uf: string; leg: number }

export const LEG_ATUAL = 57;
/** Legislaturas com lista completa na API da Câmara usadas na composição. */
export const LEGS = [57, 56, 55, 54] as const;
export const PADRAO: FiltrosCongresso = { casa: "ambas", partido: "", uf: "", leg: LEG_ATUAL };

export function parseFiltros(sp: URLSearchParams): FiltrosCongresso {
  const casa = sp.get("casa");
  const uf = (sp.get("uf") ?? "").toUpperCase();
  const leg = Number(sp.get("leg"));
  return {
    casa: casa === "camara" || casa === "senado" ? casa : "ambas",
    partido: (sp.get("partido") ?? "").trim(),
    uf: uf in UFS ? uf : "",
    leg: (LEGS as readonly number[]).includes(leg) ? leg : LEG_ATUAL,
  };
}

/** Escreve os filtros sobre `base` (mantém outros parâmetros), omitindo valores padrão. */
export function filtrosToSearch(f: FiltrosCongresso, base = new URLSearchParams()): URLSearchParams {
  const s = new URLSearchParams(base);
  const put = (k: string, v: string, def: string) => (v && v !== def ? s.set(k, v) : s.delete(k));
  put("casa", f.casa, PADRAO.casa);
  put("partido", f.partido, "");
  put("uf", f.uf, "");
  put("leg", String(f.leg), String(LEG_ATUAL));
  return s;
}

/** Anos civis da legislatura (a 57ª começou em 2023; cada uma dura 4 anos), até `anoAtual`. */
export function anosDaLegislatura(leg: number, anoAtual = new Date().getFullYear()): number[] {
  const ini = 2023 + 4 * (leg - 57);
  return [0, 1, 2, 3].map((i) => ini + i).filter((a) => a <= anoAtual);
}
