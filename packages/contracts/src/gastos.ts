// Contrato v1/gastos/** — gerado por `emenda-gastos` (crates/etl/src/gastos).
// Valores monetários em centavos inteiros.

export type CasaGastos = "camara" | "senado";
export type KindParlamentar = "deputado" | "senador";

export const gastosPath = {
  parlamentar: (kind: KindParlamentar, id: string | number) => `/data/v1/gastos/${kind}/${id}.json`,
  ranking: () => `/data/v1/gastos/ranking.json`,
} as const;

export interface GastoFonte { nome: string; url: string }
export interface GastoAno { ano: number; valor: number; n: number }
export interface GastoCategoria { categoria: string; valor: number; n: number }
export interface GastoCategoriaAno { ano: number; categoria: string; valor: number }
export interface GastoFornecedor {
  /** só dígitos; "" quando a fonte não informa documento válido */
  cnpjCpf: string;
  nome: string;
  valor: number;
  n: number;
}
export interface GastoItem {
  /** AAAA-MM-DD (ou AAAA-MM sem data de emissão) */
  data: string;
  categoria: string;
  fornecedor: string;
  cnpjCpf: string;
  valor: number;
  /** link do documento fiscal (Câmara) */
  url?: string;
  /** trecho (passagens) ou detalhamento */
  det?: string;
}
export interface GastoPessoa {
  nome: string;
  cargo: string;
  grupo: string;
  local?: string;
  /** AAAA-MM-DD (Câmara) ou AAAA (Senado) */
  desde?: string;
  /** remuneração bruta fixa mensal, quando pública em dados abertos */
  remuneracao?: number;
}
export interface GastosParlamentarData {
  casa: CasaGastos;
  id: string;
  nome: string;
  partido: string | null;
  uf: string | null;
  emExercicio: boolean;
  /** último mês (AAAA-MM) com despesa publicada na casa */
  dadosAte: string | null;
  /** total da cota desde 2019 */
  total: number;
  mandato: { inicio: string; total: number; meses: number; mediaMensal: number };
  porAno: GastoAno[];
  porCategoria: GastoCategoria[];
  porCategoriaAno: GastoCategoriaAno[];
  topFornecedores: GastoFornecedor[];
  /** total de despesas; `itens` traz só as mais recentes (até 500) */
  nItens: number;
  itens: GastoItem[];
  /** cota do ano corrente (Câmara): teto = gasto + não utilizado */
  cota: { ano: number; gasto: number; teto: number } | null;
  verbaGabinete: { ano: number; gasto: number; naoUtilizado: number; porMes: Array<{ mes: number; gasto: number }> } | null;
  pessoal: { n: number; custoMensal: number | null; referencia: string | null; lista: GastoPessoa[] } | null;
  subsidio: number | null;
  auxilios: {
    imovelFuncional: string | null;
    auxilioMoradia: string | null;
    auxilioMoradiaValor: number | null;
    viagensMissao: number | null;
  };
  fontes: GastoFonte[];
}

export interface GastosRankingParlamentar {
  casa: CasaGastos;
  id: string;
  nome: string;
  partido: string | null;
  uf: string | null;
  emExercicio: boolean;
  /** total no mandato/legislatura corrente */
  mandato: number;
  porAno: Record<string, number>;
}
export interface GastosRanking {
  anos: number[];
  dadosAte: { camara: string | null; senado: string | null };
  parlamentares: GastosRankingParlamentar[];
  categorias: Array<{
    casa: CasaGastos;
    ano: number;
    categoria: string;
    valor: number;
    n: number;
    top: Array<{ id: string; valor: number }>;
  }>;
  fornecedores: Array<GastoFornecedor & { parlamentares: number }>;
}
