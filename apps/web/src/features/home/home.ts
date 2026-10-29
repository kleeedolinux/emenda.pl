// Home: lugar do visitante (localStorage) e "fato do dia" a partir de dados reais. Puro.
import { useEffect } from "react";
import type { AutorResumo, Brasil, Rankings } from "@emenda/contracts";
import { mesLongo } from "@/features/feed/feed";
import { tipoAutor } from "@/features/linguagem/linguagem";
import { nomeLeigo } from "@/lib/nomes";

type Armazem = Pick<Storage, "getItem" | "setItem">;
export interface LocalVisitante { tipo: "municipio" | "uf"; id: string; nome: string; uf: string }
const CHAVE = "emenda:local";

export function lerLocal(s: Armazem | null): LocalVisitante | null {
  try {
    const v = JSON.parse(s?.getItem(CHAVE) ?? "null") as Partial<LocalVisitante> | null;
    return v && (v.tipo === "municipio" || v.tipo === "uf") && v.id && v.nome && v.uf ? { tipo: v.tipo, id: v.id, nome: v.nome, uf: v.uf } : null;
  } catch { return null; }
}
export function salvarLocal(s: Armazem | null, v: LocalVisitante): void {
  try { s?.setItem(CHAVE, JSON.stringify(v)); } catch { /* modo privado */ }
}

export interface Fato {
  id: "mes" | "pessoa" | "cidade" | "secreto";
  /** Nome em destaque (pessoa/cidade), quando houver. */
  titulo?: string;
  /** Centavos. */
  numero: number;
  /** Frase depois do número. */
  gancho: string;
  href: string;
  /** Código do autor, para mostrar o rosto. */
  autor?: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Até 4 fatos curtos, cada um com número grande, frase e link. */
export function fatosDoDia(d: { brasil?: Brasil; rankings?: Rankings; autores?: AutorResumo[] }): Fato[] {
  const out: Fato[] = [];
  const j = d.rankings?.janelas.find((x) => x.janela === "1m");
  if (j && j.valor > 0) {
    const pix = j.tipos.find((t) => t.tipo === "pix")?.valor ?? 0;
    out.push({ id: "mes", numero: j.valor, gancho: `foram pagos em ${mesLongo(j.ate)}.${pix / j.valor >= 0.1 ? ` ${pct(pix / j.valor)} sem dizer para quê.` : ""}`, href: "/ultimas" });
    const p = j.autores.find((a) => tipoAutor(a.nome) === "pessoa");
    if (p) out.push({ id: "pessoa", titulo: nomeLeigo(p.nome), numero: p.valor, gancho: `mandou isso só em ${mesLongo(j.ate)}.`, href: `/autor/${p.codigo}`, autor: p.codigo });
    const c = j.municipios[0];
    if (c) out.push({ id: "cidade", titulo: c.nome, numero: c.valor, gancho: `chegaram em ${c.nome} (${c.uf}) em ${mesLongo(j.ate)}: a cidade que mais recebeu.`, href: `/municipio/${c.ibge}` });
  }
  const secreto = d.brasil?.porTipo.filter((t) => t.tipo === "relator").reduce((s, t) => s + t.pago, 0) ?? 0;
  if (secreto > 0) out.push({ id: "secreto", numero: secreto, gancho: "foram distribuídos sem mostrar qual político pediu.", href: "/orcamento-secreto" });
  return out;
}

/** Guarda o último lugar visto para o "Perto de você" da Home. */
export function useLembrarLocal(v: LocalVisitante | null): void {
  const k = v ? `${v.tipo}:${v.id}` : "";
  useEffect(() => {
    if (!v) return;
    let s: Storage | null = null;
    try { s = window.localStorage; } catch { /* bloqueado */ }
    salvarLocal(s, v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
}
