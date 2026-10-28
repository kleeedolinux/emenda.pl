// Utilidades geográficas puras.
import { UF_POR_CODIGO, UFS, type SiglaUf } from "@emenda/contracts";

export const isSiglaUf = (s: string): s is SiglaUf => s.toUpperCase() in UFS;
export const nomeUf = (s: string) => (isSiglaUf(s) ? UFS[s.toUpperCase() as SiglaUf] : s);
/** Código IBGE de UF (2 dígitos) -> sigla. */
export const siglaPorCodigo = (cod: string) => UF_POR_CODIGO[cod.slice(0, 2)];
