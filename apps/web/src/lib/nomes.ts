// Nomes vindos do Portal/Câmara em CAIXA ALTA, abreviados e sem acento -> leitura comum. Puro.
// "MUNICIPIO DE BELEM" -> "Prefeitura de Belém"; "COM. DESENV REGIONAL E TURISMO" -> "Comissão de Desenvolvimento Regional e Turismo".
import { chaveNome, UFS as NOMES_UF, type SiglaUf } from "@emenda/contracts";

const MINUSCULAS = new Set(["DA", "DAS", "DE", "DO", "DOS", "E", "EM", "SOBRE", "COM", "AO", "AOS", "A", "AS", "NA", "NO", "NAS", "NOS"]);
const SIGLAS = new Set(["APAE", "SUS", "FNDE", "FNS", "SESI", "SENAI", "SESC", "SENAC", "CNPJ", "CPF", "ONG", "OSCIP", "S/A", "SA", "S.A.", "ME", "EPP", "EIRELI", "LTDA.", "IBGE", "INSS", "UPA", "UBS", "CRAS", "CREAS", "DNIT", "CODEVASF", "EMBRAPA", "UFBA", "UFMG", "USP", "IFBA", "PT", "PL", "PSD", "MDB", "PP"]);
const UFS = new Set(["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"]);

/** Abreviações comuns nos nomes do Portal (com e sem ponto). */
const ABREV: Record<string, string> = {
  "COM.": "Comissão", "DESENV": "Desenvolvimento", "DESENV.": "Desenvolvimento", "DES.": "Desenvolvimento", "MUN.": "Municipal", "MUN": "Municipal",
  "SEC.": "Secretaria", "ASSOC.": "Associação", "INST.": "Instituto", "PREVI.": "Previdência", "ASSIS.": "Assistência", "SOCI": "Social",
  "INFAN.": "Infância", "ADOL.": "Adolescência", "FAMIL": "Família", "PERM": "Permanente", "MIG": "Migrações", "REFUGIAD": "Refugiados",
  "DEFICIENC": "Deficiência", "PREF.": "Prefeitura", "GOV.": "Governo", "MIN.": "Ministério", "EST.": "Estadual", "NAC.": "Nacional",
};

/** Palavras frequentes que o Portal grava sem acento. */
const ACENTO: Record<string, string> = Object.fromEntries(
  ("Comissão Saúde Orçamentos Orçamento Públicos Públicas Pública Público Constituição Justiça Educação Viação Relações Segurança Serviços Serviço " +
    "Integração Finanças Tributação Administração Mudanças Climáticas Transparência Governança Fiscalização Econômicos Econômico Ciência Inovação " +
    "Comunicação Legislação Indústria Deficiência Agrária Violência Previdência Assistência Família Infância Adolescência Água Habitação Ação " +
    "Associação Fundação Município Municipio Ministério Polícia Técnico Técnica Tecnológico Básica Agrícola Agropecuária Pecuária Hospitalar Médico " +
    "Saneamento Pavimentação Construção Aquisição Manutenção Promoção Proteção Atenção Gestão Execução Instalação Implantação Recuperação Ampliação " +
    "Reforma Contribuição Participação Gerência Elétrica Rodoviário Hídricos Indígena Ceará Piauí Maranhão Paraíba Amapá Espírito Goiás Rondônia " +
    "Paraná São Belém Brasília Maceió Goiânia Cuiabá Vitória Florianópolis Macapá João José Conceição Luís Antônio Sebastião Jesus Graças Fátima " +
    "Nossa Senhora Cristóvão Estância Itabaiana Feira Petrolina Juazeiro Imperatriz Mossoró Campina Ilhéus Itapetinga Jequié Barreiras Teresina " +
    "Patrimônio Histórico Artístico Esportiva Desportiva Cultural Ambiental Urbanística Universitário Acadêmico Científico Pesquisa Inclusão Idoso " +
    "Crédito Energética Transferência Plataforma Tráfego Trânsito Vigilância Sanitária Epidemiológica Odontológico Clínica Clínicas Benefício " +
    "Beneficente Filantrópica Evangélica Católica Missionária Comunitária Assembléia Câmara Dívida Média Mínimo Máximo Único Única Física Jurídica").split(" ")
    .map((w) => [w.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase(), w]),
);
// "do PARA" é o estado; "PARA" sozinho é a preposição.
const tirarAcento = (w: string) => w.normalize("NFD").replace(/[̀-ͯ]/g, "");
const vogal = /[AEIOUÁÉÍÓÚÂÊÔÃÕ]/;
const capitalizar = (w: string) => w.charAt(0) + w.slice(1).toLowerCase();

/**
 * Nome em caixa alta -> forma comum: título com conectivos minúsculos, acentos comuns, abreviações expandidas,
 * "MUNICIPIO DE X" -> "Prefeitura de X", sigla final de comissão removida. Texto já em caixa mista volta igual.
 */
export function nomeLeigo(entrada: string): string {
  let s = entrada.replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (/[a-zà-ú]/.test(s)) return s;
  s = s.replace(/^MUNIC[IÍ]PIO DE /, "PREFEITURA DE ").replace(/^PREFEITURA MUNICIPAL DE /, "PREFEITURA DE ");
  if (/^COM(\.|ISS)/.test(s) || /^COM MISTA/.test(s)) { const sem = s.replace(/\s+-\s*[A-Z]*$/, ""); if (sem.split(" ").length > 2) s = sem; }
  const ws = s.split(" ");
  const out: string[] = [];
  ws.forEach((tok, i) => {
    const m = /^(.*?)(,?)$/.exec(tok)!;
    const w = m[1]!, virgula = m[2]!;
    const prox = ws[i + 1]?.replace(/,$/, "");
    let r: string;
    if (w === "FUND." || w === "FUND") r = prox && /^(MUN\.?|MUNICIPAL|NACIONAL|ESTADUAL)$/.test(prox) ? "Fundo" : "Fundação";
    else if (i === 0 && w === "COM" && prox === "MISTA") r = "Comissão";
    else if (ABREV[w]) r = ABREV[w]!;
    else if (w === "PARA" && /^(DO|DE)$/.test(ws[i - 1] ?? "")) r = "Pará";
    else if (ws[i - 1] === "-" && (UFS.has(w) || w.length <= 5)) r = w;
    else if (SIGLAS.has(w) && w !== "SA") r = w === "LTDA." ? "Ltda." : w;
    else if (i > 0 && MINUSCULAS.has(w)) r = w.toLowerCase();
    else if (w === "LTDA") r = "Ltda";
    else if (ACENTO[tirarAcento(w)]) r = ACENTO[tirarAcento(w)]!;
    else if (/\d/.test(w) || (w.length > 1 && !vogal.test(w))) r = w;
    else r = capitalizar(w);
    out.push(r + virgula);
  });
  // "Comissão Defesa ..." -> "Comissão de Defesa ..."
  for (let i = 0; i < out.length - 1; i++)
    if (out[i] === "Comissão" && !/^(de|da|do|dos|das|Mista|Permanente|Senado|sobre|-)$/.test(out[i + 1]!)) out.splice(i + 1, 0, "de");
  return out.join(" ");
}

/** "Bancada de Minas Gerais" → "MG". Bancadas temáticas ("Bancada Ruralista") → null. */
export function ufDaBancada(nome: string): SiglaUf | null {
  const m = /^bancada\s+(?:de|do|da|dos|das)\s+(.+)$/i.exec(nome.trim());
  if (!m) return null;
  const alvo = chaveNome(m[1]!);
  return (Object.keys(NOMES_UF) as SiglaUf[]).find((uf) => chaveNome(NOMES_UF[uf]) === alvo) ?? null;
}
