// Orçamento secreto (emendas de relator-geral, RP9): agregações para a página-história. Puro.
import { UFS, type Autor, type Brasil, type Pix, type SiglaUf } from "@emenda/contracts";
import { porArea } from "@/features/linguagem/linguagem";
import { nomeLeigo } from "@/lib/nomes";

export function resumoSecreto(b: Brasil, relator?: Autor) {
  const fluxo = b.fluxo.filter((f) => f.tipo === "relator");
  const uf = new Map<string, number>();
  for (const f of fluxo) uf.set(f.uf, (uf.get(f.uf) ?? 0) + f.pago);
  const total = b.porTipo.filter((t) => t.tipo === "relator").reduce((s, t) => s + t.pago, 0);
  const comEstado = [...uf.values()].reduce((s, v) => s + v, 0);
  const comAno = (relator?.porAno ?? []).reduce((s, a) => s + a.pago, 0);
  return {
    total,
    /** Nem todo o dinheiro tem estado (órgãos nacionais) ou ano (pagos em nome de outros relatores) nos dados. */
    cobertura: { comEstado, semEstado: Math.max(0, total - comEstado), comAno, semAno: Math.max(0, total - comAno) },
    porUf: [...uf].filter(([k, v]) => k in UFS && v > 0).sort((a, c) => c[1] - a[1]).map(([k, v]) => ({ uf: k, nome: UFS[k as SiglaUf], pago: v })),
    areas: porArea(fluxo.map((f) => ({ funcao: f.funcao, valor: f.pago }))),
    porAno: [...(relator?.porAno ?? [])].sort((a, c) => a.ano - c.ano).map((a) => ({ ano: a.ano, pago: a.pago })),
    recebedores: (relator?.favorecidos ?? []).filter((f) => f.valor > 0).slice(0, 8).map((f) => ({ nome: nomeLeigo(f.nome), valor: f.valor })),
  };
}

/** Ano a ano: orçamento secreto x dinheiro sem dizer para quê (Pix), para mostrar o que veio depois. */
export function antesEDepois(secreto: ReadonlyArray<{ ano: number; pago: number }>, pix?: Pix) {
  const anos = new Map<number, { ano: number; secreto: number; pix: number }>();
  const linha = (ano: number) => anos.get(ano) ?? anos.set(ano, { ano, secreto: 0, pix: 0 }).get(ano)!;
  for (const s of secreto) linha(s.ano).secreto += s.pago;
  for (const p of pix?.porAno ?? []) linha(p.ano).pix += p.pago;
  return [...anos.values()].sort((a, c) => a.ano - c.ano);
}
