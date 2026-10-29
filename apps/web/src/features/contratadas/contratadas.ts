import type { Beneficiados, CasaGastos, GastosFornecedores, GastosRanking, GrupoGasto } from "@emenda/contracts";

export const GRUPOS: Record<GrupoGasto, { rotulo: string; linha: string }> = {
  passagens: { rotulo: "Passagens e voos", linha: "Companhias aéreas, agências e fretamento de avião ou barco." },
  divulgacao: { rotulo: "Propaganda e marketing", linha: "Gráficas, agências, vídeos e redes sociais para divulgar o mandato." },
  carros: { rotulo: "Carros e combustível", linha: "Aluguel de carro, combustível, táxi e pedágio." },
  consultorias: { rotulo: "Consultorias", linha: "Pesquisas, assessorias e trabalhos técnicos." },
  escritorio: { rotulo: "Escritório", linha: "Aluguel, contas, telefone, material e correio do escritório político." },
  hospedagem: { rotulo: "Hotel e comida", linha: "Hospedagem fora de Brasília e refeições." },
  seguranca: { rotulo: "Segurança", linha: "Empresas de segurança privada." },
  outros: { rotulo: "Outros", linha: "Cursos, eventos e o resto." },
};

type Forn = GastosFornecedores["grupos"][number]["fornecedores"][number];
export interface Contratante { casa: CasaGastos; id: string; valor: number; nome: string; partido: string | null; uf: string | null; href: string }

/** Contratantes com nome, partido e estado do ranking de gastos; link pela casa. */
export function comNomes(f: Forn, ranking?: GastosRanking): Contratante[] {
  const por = new Map((ranking?.parlamentares ?? []).map((p) => [`${p.casa}:${p.id}`, p]));
  return f.contratantes.map((c) => {
    const p = por.get(`${c.casa}:${c.id}`);
    const rota = c.casa === "camara" ? "deputado" : "senador";
    return {
      ...c,
      nome: p?.nome ?? `${c.casa === "camara" ? "Deputado" : "Senador"} ${c.id}`,
      partido: p?.partido ?? null,
      uf: p?.uf ?? null,
      href: `/${rota}/${c.id}`,
    };
  });
}

export interface Empresa {
  cnpj: string;
  nome: string;
  /** cota parlamentar recebida (centavos) */
  cota: number;
  /** dinheiro de emendas recebido (centavos) */
  emendas: number;
  parlamentares: number;
  grupos: Array<{ grupo: GrupoGasto; valor: number }>;
  contratantes: Contratante[];
}

/** Uma empresa pelo CNPJ: cota (todos os tipos de gasto) + emendas; quem contratou somado entre tipos. */
export function empresaDe(cnpj: string, forn?: GastosFornecedores, ben?: Beneficiados, ranking?: GastosRanking): Empresa | null {
  let nome = "";
  let cota = 0, parlamentares = 0;
  const grupos: Empresa["grupos"] = [];
  const cs = new Map<string, Forn["contratantes"][number]>();
  for (const g of forn?.grupos ?? []) {
    const f = g.fornecedores.find((x) => x.cnpjCpf === cnpj);
    if (!f) continue;
    nome ||= f.nome;
    cota += f.valor;
    parlamentares = Math.max(parlamentares, f.parlamentares);
    grupos.push({ grupo: g.grupo, valor: f.valor });
    for (const c of f.contratantes) {
      const k = `${c.casa}:${c.id}`;
      const x = cs.get(k);
      cs.set(k, x ? { ...x, valor: x.valor + c.valor } : { ...c });
    }
  }
  let emendas = 0;
  for (const b of [...(ben?.empresas ?? []), ...(ben?.entidades ?? []), ...(ben?.fundos ?? [])]) {
    if (b.documento !== cnpj) continue;
    emendas += b.valor;
    nome ||= b.nome;
  }
  if (!nome) return null;
  const contratantes = comNomes({ cnpjCpf: cnpj, nome, valor: cota, n: 0, parlamentares, contratantes: [...cs.values()] }, ranking)
    .sort((a, z) => z.valor - a.valor || a.id.localeCompare(z.id));
  return { cnpj, nome, cota, emendas, parlamentares, grupos: grupos.sort((a, z) => z.valor - a.valor), contratantes };
}
