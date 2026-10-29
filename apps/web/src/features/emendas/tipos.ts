import { TIPOS_EMENDA, type TipoEmenda } from "@emenda/contracts";
import { TIPO_DINHEIRO } from "@/features/linguagem/linguagem";
import { TIPOS_LEIGO } from "@/ui/glossario";

/** Mesma cor da legenda única (`features/linguagem`). */
export const COR_TIPO: Record<TipoEmenda, string> = Object.fromEntries(Object.entries(TIPO_DINHEIRO).map(([k, v]) => [k, v.cor])) as Record<TipoEmenda, string>;
export const TIP_TIPO: Record<TipoEmenda, string> = {
  pix: "emenda pix",
  individual: "emenda individual",
  bancada: "bancada",
  comissao: "comissão",
  relator: "RP9",
  outra: "emenda",
};
/** Nome em palavras do dia a dia + nome técnico entre parênteses. */
export const nomeTipo = (t: TipoEmenda | string) => (TIPOS_LEIGO[t as TipoEmenda] ? `${TIPOS_LEIGO[t as TipoEmenda].rotulo} (${TIPOS_LEIGO[t as TipoEmenda].jargao})` : TIPOS_EMENDA[t as TipoEmenda] ?? t);
/** Só o nome do dia a dia ("Sem dizer para quê", "Orçamento secreto"...). */
export const nomeTipoCurto = (t: TipoEmenda | string) => TIPOS_LEIGO[t as TipoEmenda]?.rotulo ?? t;
