import { Building2, HeartHandshake, Landmark } from "lucide-react";
import type { Beneficiado } from "@emenda/contracts";
import { formatBRL } from "@/lib/format";
import { nomeLeigo } from "@/lib/nomes";
import { ListaVerMais } from "@/features/linguagem";
import { ROTULO_GRUPO, type Privado } from "./beneficiados";

const brl = (n: number) => formatBRL(Math.round(n), true);
const ICONE = { empresa: Building2, entidade: HeartHandshake, fundo: Landmark } as const;

/** Linha de ranking: posição, ícone do grupo, nome, onde fica e valor. */
export function LinhaBeneficiado({ x, i }: { x: Beneficiado | Privado; i: number }) {
  const grupo = "grupo" in x ? x.grupo : "fundo";
  const Icone = ICONE[grupo];
  const onde = [x.municipio && nomeLeigo(x.municipio), x.uf].filter(Boolean).join(" - ");
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-6 shrink-0 text-right text-xs text-muted tabular">{i + 1}</span>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-accent" title={grupo === "fundo" ? "Fundo público" : ROTULO_GRUPO[grupo]}><Icone className="size-4" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium [overflow-wrap:anywhere]">{nomeLeigo(x.nome)}</span>
        <span className="block text-xs text-muted">{grupo === "fundo" ? "Fundo público" : ROTULO_GRUPO[grupo]}{onde ? ` · ${onde}` : ""}</span>
      </span>
      <b className="shrink-0 tabular">{brl(x.valor)}</b>
    </div>
  );
}

export function ListaBeneficiados<T extends Beneficiado>({ itens, inicial = 10 }: { itens: readonly T[]; inicial?: number }) {
  return (
    <ListaVerMais itens={itens} inicial={inicial} passo={20} chave={(x) => x.documento} className="divide-y divide-line"
      vazio={<p className="py-4 text-sm text-muted">Nada encontrado.</p>}
      render={(x, i) => <LinhaBeneficiado x={x} i={i} />} />
  );
}
