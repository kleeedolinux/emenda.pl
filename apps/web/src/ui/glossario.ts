// Glossário em português simples. Puro (sem React) para ser testável.
const EMENDA_PIX =
  "Emenda Pix (transferência especial): dinheiro que o parlamentar manda direto para o caixa da prefeitura ou do estado, sem dizer antes em que obra ou serviço ele será usado. É rápida, mas mais difícil de fiscalizar.";
const RELATOR =
  "Emenda de relator (RP9): verba distribuída pelo relator do Orçamento a pedido de parlamentares, sem que o nome de quem pediu aparecesse. Ficou conhecida como “orçamento secreto” e foi declarada inconstitucional pelo STF em 2022.";
const CEAP =
  "Cota parlamentar (CEAP): valor mensal que cada deputado ou senador pode gastar com passagens, combustível, aluguel de escritório, divulgação e outras despesas do mandato, com reembolso pago pela Casa.";

export const GLOSSARIO: Record<string, string> = {
  emenda: "Emenda parlamentar: pedaço do Orçamento da União que deputados e senadores podem indicar para uma cidade, estado ou entidade.",
  empenhado: "Empenhado: o governo reservou o dinheiro e assumiu o compromisso de pagar. Ainda não saiu do cofre.",
  liquidado: "Liquidado: o governo conferiu que a obra, compra ou serviço foi entregue e que o pagamento é devido.",
  pago: "Pago: o dinheiro de fato saiu do cofre público e chegou a quem tinha direito.",
  "restos a pagar": "Restos a pagar: valores empenhados em um ano e que só são pagos em anos seguintes. Muitas emendas são pagas assim.",
  "emenda pix": EMENDA_PIX,
  "transferência especial": EMENDA_PIX,
  "emenda individual": "Emenda individual: indicação feita por um único deputado ou senador. Cada parlamentar tem uma cota anual, e parte dela é de execução obrigatória.",
  bancada: "Emenda de bancada: indicação feita em conjunto pelos deputados e senadores de um mesmo estado, geralmente para obras maiores.",
  comissão: "Emenda de comissão: indicação feita por uma comissão temática do Congresso (como Saúde ou Educação), e não por uma pessoa.",
  relator: RELATOR,
  RP9: RELATOR,
  PL: "PL (Projeto de Lei): proposta para criar ou mudar uma lei comum. Precisa da maioria dos votos presentes para ser aprovada.",
  PEC: "PEC (Proposta de Emenda à Constituição): proposta para mudar a Constituição. Precisa de 3/5 dos votos em dois turnos na Câmara e no Senado.",
  PLP: "PLP (Projeto de Lei Complementar): lei que detalha pontos da Constituição. Precisa da maioria absoluta (metade mais um de todos os membros).",
  MPV: "MPV (Medida Provisória): norma editada pelo presidente que vale na hora, mas precisa ser aprovada pelo Congresso em até 120 dias ou perde a validade.",
  PDL: "PDL (Projeto de Decreto Legislativo): trata de assuntos exclusivos do Congresso, como aprovar tratados ou derrubar decretos do Executivo.",
  PLN: "PLN (Projeto de Lei do Congresso Nacional): proposta sobre orçamento (LDO, LOA, créditos) votada em sessão conjunta de deputados e senadores.",
  "votação nominal": "Votação nominal: votação em que fica registrado como cada parlamentar votou (sim, não, abstenção ou obstrução).",
  "orientação de bancada": "Orientação de bancada: recomendação que o líder de um partido ou bloco dá aos seus membros sobre como votar.",
  quórum: "Quórum: número mínimo de parlamentares presentes para que uma sessão ou votação seja válida.",
  legislatura: "Legislatura: período de quatro anos de trabalho do Congresso. A 57ª legislatura vai de 2023 a 2027.",
  CNPJ: "CNPJ: número de cadastro de empresas, associações, prefeituras e outros órgãos na Receita Federal. É público.",
  "CPF mascarado": "CPF mascarado: a fonte oficial esconde parte do CPF de pessoas físicas (ex.: ***.123.456-**) para proteger a privacidade.",
  favorecido: "Favorecido: quem recebeu o dinheiro na ponta, como uma prefeitura, empresa, hospital ou associação.",
  convênio: "Convênio: acordo entre o governo federal e um município, estado ou entidade para executar um projeto, com prazos e prestação de contas.",
  "função orçamentária": "Função orçamentária: grande área em que o dinheiro é gasto, como Saúde, Educação, Urbanismo ou Agricultura.",
  "ação orçamentária": "Ação orçamentária: o que exatamente será feito com o dinheiro, como “construção de unidade básica de saúde”.",
  prefeito: "Prefeito: chefe do Executivo municipal, eleito a cada quatro anos. A prefeitura é quem costuma receber e aplicar as emendas.",
  "cota parlamentar": CEAP,
  CEAP: CEAP,
  tramitação: "Tramitação: o caminho que uma proposta percorre (comissões, plenário, outra Casa, sanção) até virar lei ou ser arquivada.",
  "regime de urgência": "Regime de urgência: atalho que deixa a proposta pular etapas e prazos, indo mais rápido para votação no plenário.",
  "natureza jurídica": "Natureza jurídica: o tipo de organização segundo a Receita (prefeitura, empresa, associação, fundação etc.).",
  "código IBGE": "Código IBGE: número oficial que identifica cada município (7 dígitos) e estado (2 dígitos) no Brasil.",
  "deputado federal": "Deputado federal: representante do povo na Câmara dos Deputados. São 513, eleitos a cada quatro anos.",
  senador: "Senador: representante de um estado no Senado Federal. São 81 (três por estado), com mandato de oito anos.",
  "deputado estadual": "Deputado estadual: membro da Assembleia Legislativa do estado, que faz as leis estaduais e fiscaliza o governador.",
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const INDEX = new Map(Object.entries(GLOSSARIO).map(([k, v]) => [norm(k), v]));

/** Busca definição ignorando caixa e acentos. */
export function termo(k: string): string | undefined {
  return GLOSSARIO[k] ?? INDEX.get(norm(k));
}
