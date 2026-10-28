import { TIPOS_EMENDA, type TipoEmenda } from "@emenda/contracts";

export const COR_TIPO: Record<TipoEmenda, string> = {
  pix: "#e0b800",
  individual: "#009c3b",
  bancada: "#002776",
  comissao: "#2f80ed",
  relator: "#c2410c",
  outra: "#64748b",
};
export const TIP_TIPO: Record<TipoEmenda, string> = {
  pix: "emenda pix",
  individual: "emenda individual",
  bancada: "bancada",
  comissao: "comissão",
  relator: "RP9",
  outra: "emenda",
};
export const nomeTipo = (t: TipoEmenda | string) => TIPOS_EMENDA[t as TipoEmenda] ?? t;
export const nomeTipoCurto = (t: TipoEmenda | string) =>
  ({ pix: "Emenda Pix", individual: "Individual", bancada: "Bancada", comissao: "Comissão", relator: "Relator (RP9)", outra: "Outra" })[t as TipoEmenda] ?? t;
