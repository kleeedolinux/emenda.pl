// Contratos de dados do emenda.pl.
// Fonte única de verdade para: ETL Rust (crates/etl) -> JSON estático (v1) -> Worker -> Web.
// Valores monetários SEMPRE em centavos inteiros (number seguro até 2^53).

export const DATA_VERSION = "v1" as const;

/** Rotas de dados estáticos (servidas pelo Worker em /data/v1/...). */
export const dataPath = {
  meta: () => `/data/${DATA_VERSION}/meta.json`,
  brasil: () => `/data/${DATA_VERSION}/brasil.json`,
  autores: () => `/data/${DATA_VERSION}/autores.json`,
  uf: (uf: string) => `/data/${DATA_VERSION}/uf/${uf.toUpperCase()}.json`,
  municipio: (ibge: string | number) => `/data/${DATA_VERSION}/municipio/${ibge}.json`,
  autor: (codigo: string) => `/data/${DATA_VERSION}/autor/${codigo}.json`,
} as const;

/** Tipos de emenda normalizados a partir de "Tipo de Emenda" do Portal da Transparência. */
export const TIPOS_EMENDA = {
  pix: "Emenda Pix (Transferência Especial)",
  individual: "Emenda Individual (Finalidade Definida)",
  bancada: "Emenda de Bancada",
  comissao: "Emenda de Comissão",
  relator: "Emenda de Relator (RP9)",
  outra: "Outra",
} as const;
export type TipoEmenda = keyof typeof TIPOS_EMENDA;

export interface Valores {
  /** centavos */
  empenhado: number;
  liquidado: number;
  pago: number;
  /** restos a pagar pagos, centavos */
  rapPago: number;
}

export interface Totais extends Valores {
  /** quantidade de emendas (linhas distintas) */
  n: number;
}

export interface Meta {
  version: typeof DATA_VERSION;
  generatedAt: string; // ISO-8601
  fonte: string; // URL de origem
  anos: number[];
  totais: Totais;
}

export interface Brasil {
  totais: Totais;
  porAno: Array<{ ano: number } & Totais>;
  porTipo: Array<{ tipo: TipoEmenda } & Totais>;
  porFuncao: Array<{ funcao: string } & Totais>;
  porUf: Array<{ uf: string; nome: string } & Totais>;
  /** fluxo tipo -> funcao -> uf (pago), para Sankey */
  fluxo: Array<{ tipo: TipoEmenda; funcao: string; uf: string; pago: number }>;
}

export interface AutorResumo {
  codigo: string;
  nome: string;
  /** nome normalizado (sem acento, maiúsculo) para cruzar com Câmara/Senado */
  chave: string;
  n: number;
  pago: number;
  empenhado: number;
}

export interface MunicipioResumo extends Totais {
  ibge: string;
  nome: string;
}

export interface Uf {
  uf: string;
  nome: string;
  totais: Totais;
  porTipo: Array<{ tipo: TipoEmenda } & Totais>;
  porAno: Array<{ ano: number } & Totais>;
  municipios: MunicipioResumo[];
  autores: AutorResumo[];
}

export interface EmendaItem extends Valores {
  codigo: string;
  numero: string;
  ano: number;
  tipo: TipoEmenda;
  tipoOriginal: string;
  autor: { codigo: string; nome: string };
  localidade: string;
  ibge: string | null;
  uf: string | null;
  funcao: string;
  subfuncao: string;
  programa: string;
  acao: string;
}

export interface Favorecido {
  documento: string;
  nome: string;
  tipo: string; // Pessoa Jurídica / Física / Município...
  valor: number; // centavos
}

export interface Prefeito {
  nome: string;
  partido: string;
  eleicao: number; // ano
  situacao: string;
}

export interface Municipio {
  ibge: string;
  nome: string;
  uf: string;
  prefeito: Prefeito | null;
  totais: Totais;
  porTipo: Array<{ tipo: TipoEmenda } & Totais>;
  autores: AutorResumo[];
  emendas: EmendaItem[];
  favorecidos: Favorecido[];
}

export interface Autor {
  codigo: string;
  nome: string;
  chave: string;
  totais: Totais;
  porAno: Array<{ ano: number } & Totais>;
  porUf: Array<{ uf: string } & Totais>;
  porTipo: Array<{ tipo: TipoEmenda } & Totais>;
  emendas: EmendaItem[];
}

// ---------- funções puras compartilhadas ----------

/** Classifica o texto "Tipo de Emenda" do Portal. */
export function classificarTipo(original: string): TipoEmenda {
  const t = semAcento(original).toLowerCase();
  if (t.includes("transferencias especiais") || t.includes("transferencia especial")) return "pix";
  if (t.includes("relator")) return "relator";
  if (t.includes("comissao")) return "comissao";
  if (t.includes("bancada")) return "bancada";
  if (t.includes("individual")) return "individual";
  return "outra";
}

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Chave para cruzar nomes entre bases (Portal x Câmara x Senado). */
export function chaveNome(s: string): string {
  return semAcento(s).toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
}

/** "1450000,00" -> 145000000 centavos. Vazio/inválido -> 0. */
export function parseValorBR(s: string): number {
  const v = s.trim();
  if (!v) return 0;
  const neg = v.startsWith("-");
  const [int = "0", dec = ""] = v.replace(/^-/, "").replace(/\./g, "").split(",");
  const cents = Number(int) * 100 + Number((dec + "00").slice(0, 2));
  if (!Number.isFinite(cents)) return 0;
  return neg ? -cents : cents;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatBRL(centavos: number, compact = false): string {
  return (compact ? brlCompact : brl).format(centavos / 100);
}

export const UFS = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso",
  MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
} as const;
export type SiglaUf = keyof typeof UFS;

/** Código IBGE (2 dígitos) da UF -> sigla. */
export const UF_POR_CODIGO: Record<string, SiglaUf> = {
  "12": "AC", "27": "AL", "16": "AP", "13": "AM", "29": "BA", "23": "CE", "53": "DF", "32": "ES",
  "52": "GO", "21": "MA", "51": "MT", "50": "MS", "31": "MG", "15": "PA", "25": "PB", "41": "PR",
  "26": "PE", "22": "PI", "33": "RJ", "24": "RN", "43": "RS", "11": "RO", "14": "RR", "42": "SC",
  "35": "SP", "28": "SE", "17": "TO",
};

/** Legislaturas da Câmara relevantes (id -> período). */
export const LEGISLATURAS = [
  { id: 56, inicio: "2019-02-01", fim: "2023-01-31" },
  { id: 57, inicio: "2023-02-01", fim: "2027-01-31" },
] as const;
