import type { CasaGastos, GastosFornecedores, GastosRanking, GrupoGasto } from "@emenda/contracts";

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
