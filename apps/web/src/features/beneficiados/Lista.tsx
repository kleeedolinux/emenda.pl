import { Building2, HeartHandshake, Landmark } from "lucide-react";
import type { Beneficiado } from "@emenda/contracts";
import { formatBRL } from "@/lib/format";
import { nomeLeigo } from "@/lib/nomes";
import { ListaVerMais } from "@/features/linguagem";
import { formatCnpjCpf, linkFornecedor } from "@/features/gastos/gastos";
import { ROTULO_GRUPO, type Privado } from "./beneficiados";

const brl = (n: number) => formatBRL(Math.round(n), true);
const ICONE = { empresa: Building2, entidade: HeartHandshake, fundo: Landmark } as const;

/** Linha de ranking: posição, ícone do grupo, nome, onde fica e valor. */
export function LinhaBeneficiado({ x, i }: { x: Beneficiado | Privado; i: number }) {
  const grupo = "grupo" in x ? x.grupo : "fundo";
  const Icone = ICONE[grupo];
  const onde = [x.municipio && nomeLeigo(x.municipio), x.uf].filter(Boolean).join(" - ");
  return (
    <div className="flex items-start gap-2 py-2 sm:gap-3">
      <span className="w-6 shrink-0 pt-0.5 text-right text-xs text-muted tabular">{i + 1}</span>
      <span className="hidden size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-accent sm:grid" aria-hidden><Icone className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium break-words">{nomeLeigo(x.nome).replace(/,(?=\S)/g, ", ")}</span>
        <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-muted">
          <span>{grupo === "fundo" ? "Fundo público" : ROTULO_GRUPO[grupo]}{onde ? ` · ${onde}` : ""} · <Documento d={x.documento} /></span>
          <b className="text-sm text-fg tabular">{brl(x.valor)}</b>
        </span>
      </span>
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

/** CNPJ/CPF formatado; CNPJ vira link para a ficha no Portal da Transparência. */
export function Documento({ d }: { d: string }) {
  if (!d || d.startsWith("#")) return null;
  const link = linkFornecedor(d);
  const txt = formatCnpjCpf(d);
  return link
    ? <a href={link} target="_blank" rel="noopener noreferrer" className="link whitespace-nowrap tabular">{txt}</a>
    : <span className="whitespace-nowrap tabular">{txt}</span>;
}
