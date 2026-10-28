// Contrato v1/novidades.json + v1/novidades/<AAAAMM>.json — gerado por `emenda-novidades`
// (crates/etl/src/novidades). Valores monetários em centavos inteiros.

export const novidadesPath = {
  /** Últimos 500 eventos, mais novo primeiro, + índice de meses. */
  recentes: () => `/data/v1/novidades.json`,
  /** Todos os eventos do mês (arquivo). */
  mes: (aaaamm: number) => `/data/v1/novidades/${aaaamm}.json`,
} as const;

/** Rótulo pt-BR por tipo (mesmos valores do enum `Tipo` do ETL). */
export const TIPOS_NOVIDADE = {
  votacao: "Votações",
  lei: "Leis",
  urgencia: "Urgências",
  proposicao: "Novas propostas",
  agenda: "Agenda",
  pagamentos: "Pagamentos",
  pix: "Emendas Pix",
  gastos: "Cota parlamentar",
  partido: "Troca de partido",
} as const;
export type TipoNovidade = keyof typeof TIPOS_NOVIDADE;

/** Corte de "alta relevância" (regra no ETL: crates/etl/src/novidades/relevancia.rs). */
export const ALTA_RELEVANCIA = 70;

export interface NovidadeEntidade {
  /** deputado | senador | autor | municipio | uf | partido | proposicao | votacao | materia | lei */
  tipo: string;
  id: string;
  nome: string;
  /** caminho interno ("/deputado/123") ou URL oficial externa */
  url: string;
}

export interface NovidadeNumero {
  rotulo: string;
  valor: number;
  /** "brl" = centavos; "n" = contagem */
  formato: "brl" | "n";
}

export interface Novidade {
  /** estável: `<tipo>-<hash>` */
  id: string;
  tipo: TipoNovidade;
  /** ISO-8601 com fuso */
  data: string;
  titulo: string;
  /** pronto para compartilhar, ≤ 280 caracteres */
  texto: string;
  entidades: NovidadeEntidade[];
  numeros?: NovidadeNumero[];
  fonte: string[];
  /** 0–100, regra explícita; alta ≥ ALTA_RELEVANCIA */
  relevancia: number;
}

export interface NovidadesRecentes {
  geradoEm: string;
  /** meses com arquivo, mais novo primeiro */
  meses: { mes: number; n: number }[];
  itens: Novidade[];
}

export interface NovidadesMes {
  mes: number;
  itens: Novidade[];
}
