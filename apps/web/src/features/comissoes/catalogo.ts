// Catálogo curado de comissões (Câmara, Senado e mistas do Congresso). Puro.
// IDs conferidos em out/2026: Câmara /orgaos?codTipoOrgao=2|6, Senado /comissao/lista/permanente e /comissao/lista/mistas.
// "o que faz" é texto leigo e neutro; composição, reuniões e votações vêm sempre ao vivo.
import { semAcento } from "@emenda/contracts";

export type CasaComissao = "camara" | "senado" | "cn";
export type TipoComissao = "permanente" | "cpi" | "especial" | "mista" | "temporaria";

export interface ComissaoRef {
  casa: CasaComissao;
  sigla: string;
  nome: string;
  tipo: TipoComissao;
  /** id do órgão na API da Câmara */
  camaraId?: number;
  /** código do colegiado na API do Senado (mistas do Congresso usam o do Senado) */
  senadoCodigo?: number;
  oQueFaz?: string;
  /** nomes/siglas alternativos para o AutoLink */
  aliases?: string[];
  /** destaque (ex.: CMO e emendas) */
  destaque?: string;
}

const C = (camaraId: number, sigla: string, nome: string, oQueFaz: string, aliases?: string[]): ComissaoRef =>
  ({ casa: "camara", tipo: "permanente", camaraId, sigla, nome, oQueFaz, aliases });
const S = (senadoCodigo: number, sigla: string, nome: string, oQueFaz: string, aliases?: string[]): ComissaoRef =>
  ({ casa: "senado", tipo: "permanente", senadoCodigo, sigla, nome, oQueFaz, aliases });

export const COMISSOES: ComissaoRef[] = [
  // ---------- Câmara: permanentes ----------
  C(2001, "CAPADR", "Comissão de Agricultura, Pecuária, Abastecimento e Desenvolvimento Rural", "Analisa propostas sobre agricultura, pecuária, abastecimento de alimentos e política agrária."),
  C(2002, "CCTI", "Comissão de Ciência, Tecnologia e Inovação", "Analisa propostas sobre ciência, tecnologia, inovação, internet e telecomunicações."),
  C(2003, "CCJC", "Comissão de Constituição e Justiça e de Cidadania",
    "Confere se as propostas respeitam a Constituição e as regras jurídicas. Quase todo projeto passa por ela, e é a primeira etapa de uma PEC na Câmara.",
    ["CCJ", "Comissão de Constituição e Justiça", "Constituição e Justiça e de Cidadania"]),
  C(2004, "CDC", "Comissão de Defesa do Consumidor", "Analisa propostas sobre direitos do consumidor, serviços e relações de consumo."),
  C(2006, "CDU", "Comissão de Desenvolvimento Urbano", "Analisa propostas sobre cidades, moradia, saneamento e mobilidade urbana."),
  C(2007, "CDHMIR", "Comissão de Direitos Humanos, Minorias e Igualdade Racial", "Recebe denúncias e analisa propostas sobre direitos humanos, minorias e igualdade racial."),
  C(2008, "CDE", "Comissão de Desenvolvimento Econômico", "Analisa propostas sobre atividade econômica, empresas e política industrial."),
  C(2009, "CE", "Comissão de Educação", "Analisa propostas sobre educação, da creche à universidade."),
  C(2010, "CFT", "Comissão de Finanças e Tributação",
    "Verifica se cada proposta cabe no Orçamento e nas regras fiscais (adequação financeira) e analisa temas de impostos e finanças públicas.",
    ["Finanças e Tributação"]),
  C(2011, "CFFC", "Comissão de Fiscalização Financeira e Controle", "Fiscaliza atos do governo e o uso do dinheiro público; pode pedir auditorias ao TCU."),
  C(2012, "CME", "Comissão de Minas e Energia", "Analisa propostas sobre energia elétrica, petróleo, gás e mineração."),
  C(2014, "CSAUDE", "Comissão de Saúde", "Analisa propostas sobre o SUS, saúde pública, medicamentos e planos de saúde."),
  C(2015, "CTRAB", "Comissão de Trabalho", "Analisa propostas sobre emprego, direitos trabalhistas e sindicatos."),
  C(2016, "CVT", "Comissão de Viação e Transportes", "Analisa propostas sobre rodovias, ferrovias, portos, aviação e trânsito."),
  C(2017, "CINDRE", "Comissão de Integração Nacional e Desenvolvimento Regional", "Analisa propostas sobre desenvolvimento das regiões, Defesa Civil e redução de desigualdades regionais."),
  C(2018, "CREDN", "Comissão de Relações Exteriores e de Defesa Nacional", "Analisa tratados internacionais, política externa e defesa nacional."),
  C(5438, "CLP", "Comissão de Legislação Participativa", "Recebe sugestões de lei de associações, sindicatos e outras entidades da sociedade civil."),
  C(5503, "CSPCCO", "Comissão de Segurança Pública e Combate ao Crime Organizado", "Analisa propostas sobre segurança pública, polícias, armas e combate ao crime organizado."),
  C(6066, "CTUR", "Comissão de Turismo", "Analisa propostas sobre turismo e atividades ligadas ao setor."),
  C(6174, "CMADS", "Comissão de Meio Ambiente e Desenvolvimento Sustentável", "Analisa propostas sobre meio ambiente, clima, florestas e uso sustentável de recursos."),
  C(536996, "CCULT", "Comissão de Cultura", "Analisa propostas sobre cultura, patrimônio histórico e incentivo às artes."),
  C(537236, "CESPO", "Comissão do Esporte", "Analisa propostas sobre esporte, do lazer ao alto rendimento."),
  C(537480, "CPD", "Comissão de Defesa dos Direitos das Pessoas com Deficiência", "Analisa propostas sobre acessibilidade e direitos das pessoas com deficiência."),
  C(537870, "CMULHER", "Comissão de Defesa dos Direitos da Mulher", "Analisa propostas sobre direitos das mulheres e combate à violência de gênero."),
  C(537871, "CIDOSO", "Comissão de Defesa dos Direitos da Pessoa Idosa", "Analisa propostas sobre direitos e proteção das pessoas idosas."),
  C(539384, "CPOVOS", "Comissão da Amazônia e dos Povos Originários e Tradicionais", "Analisa propostas sobre a Amazônia, povos indígenas e comunidades tradicionais."),
  C(539385, "CCOM", "Comissão de Comunicação", "Analisa propostas sobre rádio, TV, imprensa e comunicação social."),
  C(539386, "CICS", "Comissão de Indústria, Comércio e Serviços", "Analisa propostas sobre indústria, comércio e setor de serviços."),
  C(539387, "CPASF", "Comissão de Previdência, Assistência Social, Infância, Adolescência e Família", "Analisa propostas sobre aposentadorias, assistência social, crianças, adolescentes e família."),
  C(539388, "CASP", "Comissão de Administração e Serviço Público", "Analisa propostas sobre a organização do governo e os servidores públicos."),

  // ---------- Senado: permanentes ----------
  S(38, "CAE", "Comissão de Assuntos Econômicos", "Analisa temas econômicos e tributários, autoriza empréstimos de estados e municípios e sabatina indicados ao Banco Central.", ["Assuntos Econômicos"]),
  S(40, "CAS", "Comissão de Assuntos Sociais", "Analisa propostas sobre saúde, previdência, assistência social e trabalho."),
  S(34, "CCJ", "Comissão de Constituição, Justiça e Cidadania",
    "Confere se as propostas respeitam a Constituição; analisa PECs e sabatina indicados ao STF e à Procuradoria-Geral da República.",
    ["Comissão de Constituição e Justiça"]),
  S(47, "CE", "Comissão de Educação e Cultura", "Analisa propostas sobre educação, cultura e esporte escolar."),
  S(1956, "CTFC", "Comissão de Transparência, Governança, Fiscalização e Controle e Defesa do Consumidor", "Fiscaliza o uso do dinheiro público, promove transparência e analisa temas de defesa do consumidor."),
  S(834, "CDH", "Comissão de Direitos Humanos e Legislação Participativa", "Analisa propostas sobre direitos humanos e recebe sugestões legislativas da sociedade."),
  S(54, "CRE", "Comissão de Relações Exteriores e Defesa Nacional", "Analisa tratados e política externa e sabatina indicados a embaixadas."),
  S(59, "CI", "Comissão de Serviços de Infraestrutura", "Analisa propostas sobre transportes, energia, obras e agências reguladoras."),
  S(1306, "CDR", "Comissão de Desenvolvimento Regional e Turismo", "Analisa propostas sobre desenvolvimento das regiões e turismo."),
  S(1307, "CRA", "Comissão de Agricultura e Reforma Agrária", "Analisa propostas sobre agricultura, pecuária e reforma agrária."),
  S(1363, "CCT", "Comissão de Ciência, Tecnologia, Inovação e Informática", "Analisa propostas sobre ciência, tecnologia, telecomunicações e outorgas de rádio e TV."),
  S(2617, "CDD", "Comissão de Defesa da Democracia", "Analisa propostas sobre instituições democráticas, eleições e combate à desinformação."),
  S(50, "CMA", "Comissão de Meio Ambiente", "Analisa propostas sobre meio ambiente, clima e fiscalização ambiental."),
  S(2429, "CSP", "Comissão de Segurança Pública", "Analisa propostas sobre segurança pública, polícias e sistema prisional."),
  S(2614, "CCDD", "Comissão de Comunicação e Direito Digital", "Analisa propostas sobre comunicação, internet e direitos no ambiente digital."),
  S(2615, "CEsp", "Comissão de Esporte", "Analisa propostas sobre esporte e lazer."),

  // ---------- Congresso Nacional: mistas permanentes ----------
  {
    casa: "cn", tipo: "mista", sigla: "CMO", senadoCodigo: 1664, camaraId: 6855,
    nome: "Comissão Mista de Planos, Orçamentos Públicos e Fiscalização",
    oQueFaz: "Examina o projeto de Orçamento da União (LOA), a LDO e o PPA. Todas as emendas parlamentares ao Orçamento passam por ela antes da votação no Congresso.",
    destaque: "Deputados e senadores apresentam suas emendas ao Orçamento aqui: a CMO recebe, analisa e consolida as emendas individuais, de bancada e de comissão no parecer do relator-geral (Constituição, art. 166, § 1º).",
    aliases: ["Comissão Mista de Orçamento", "Comissão de Orçamento", "Comissão Mista de Planos, Orçamentos Públicos e Fiscalização"],
  },
  { casa: "cn", tipo: "mista", sigla: "CCAI", senadoCodigo: 449, camaraId: 5504, nome: "Comissão Mista de Controle das Atividades de Inteligência", oQueFaz: "Fiscaliza as atividades de inteligência do governo, como as da Abin." },
  { casa: "cn", tipo: "mista", sigla: "CMMC", senadoCodigo: 1450, camaraId: 536995, nome: "Comissão Mista Permanente sobre Mudanças Climáticas", oQueFaz: "Acompanha as políticas brasileiras sobre mudanças climáticas." },
  { casa: "cn", tipo: "mista", sigla: "CMCVM", senadoCodigo: 1774, camaraId: 537237, nome: "Comissão Permanente Mista de Combate à Violência contra a Mulher", oQueFaz: "Acompanha políticas e denúncias de violência contra a mulher." },
  { casa: "cn", tipo: "mista", sigla: "CMMIR", senadoCodigo: 2301, nome: "Comissão Mista Permanente sobre Migrações Internacionais e Refugiados", oQueFaz: "Acompanha a situação de migrantes e refugiados no Brasil e de brasileiros no exterior." },
];

// ---------- ids de rota ----------
/** Id canônico da rota /comissao/:id. Mistas do Congresso usam o código do Senado (composição das duas Casas). */
export function idComissao(c: Pick<ComissaoRef, "casa" | "camaraId" | "senadoCodigo">): string {
  if (c.casa === "camara") return `camara-${c.camaraId}`;
  return `senado-${c.senadoCodigo}`;
}
export const hrefComissao = (c: Pick<ComissaoRef, "casa" | "camaraId" | "senadoCodigo">) => `/comissao/${idComissao(c)}`;

export type IdComissao = { casa: "camara"; id: number } | { casa: "senado"; id: number };

const norm = (s: string) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "camara-2003" | "senado-38" | "CMO" (sigla do catálogo) -> referência; mistas pela Câmara viram o código do Senado. */
export function parseIdComissao(raw: string): IdComissao | null {
  const s = decodeURIComponent(raw).trim();
  const m = /^(camara|senado)-(\d+)$/i.exec(s);
  if (m) {
    const casa = m[1]!.toLowerCase() as "camara" | "senado";
    const id = Number(m[2]);
    if (casa === "camara") {
      const twin = COMISSOES.find((c) => c.casa === "cn" && c.camaraId === id);
      if (twin?.senadoCodigo) return { casa: "senado", id: twin.senadoCodigo };
    }
    return { casa, id };
  }
  const c = porSigla(s);
  if (!c) return null;
  return c.casa === "camara" ? { casa: "camara", id: c.camaraId! } : { casa: "senado", id: c.senadoCodigo! };
}

/** Sigla/apelido -> comissão do catálogo. A Casa desempata (padrão Câmara); depois Congresso; depois sigla exata de outra Casa. */
export function porSigla(sigla: string, casa: "camara" | "senado" = "camara"): ComissaoRef | null {
  const k = norm(sigla);
  const exato = COMISSOES.filter((c) => norm(c.sigla) === k);
  const alias = COMISSOES.filter((c) => c.aliases?.some((a) => norm(a) === k));
  const da = (cs: ComissaoRef[], x: CasaComissao) => cs.find((c) => c.casa === x);
  return da(exato, casa) ?? da(alias, casa) ?? da(exato, "cn") ?? da(alias, "cn") ?? exato[0] ?? alias[0] ?? null;
}

export function doCatalogo(id: IdComissao): ComissaoRef | null {
  return COMISSOES.find((c) => (id.casa === "camara" ? c.casa === "camara" && c.camaraId === id.id : c.casa !== "camara" && c.senadoCodigo === id.id)) ?? null;
}

// ---------- "o que faz" derivado do nome oficial ----------
const minus = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** Minúsculas, preservando siglas (palavras toda em maiúsculas). */
const leigo = (s: string) => s.split(" ").map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase())).join(" ");

/** Frase leiga a partir do nome oficial, quando não há texto curado. */
export function oQueFazDerivado(nome: string): string {
  const n = nome.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  let m = /^Comiss[aã]o Parlamentar (?:Mista )?de Inqu[eé]rito (?:destinada a |para )?(.+)$/i.exec(n);
  if (m) return `Investiga: ${minus(m[1]!)}.`;
  m = /^CPI (?:d[aoe]s? |sobre )?(.+)$/i.exec(n);
  if (m) return `Investiga: ${minus(m[1]!)}.`;
  m = /^Comiss[aã]o (?:Especial|Mista)? ?destinada a proferir parecer (?:a[oà]s?|sobre) (.+)$/i.exec(n);
  if (m) return `Dá o parecer sobre ${m[1]!}.`;
  m = /^Comiss[aã]o Mista da Medida Provis[oó]ria (.+)$/i.exec(n);
  if (m) return `Analisa a Medida Provisória ${m[1]!} antes da votação nos plenários.`;
  m = /^Comiss[aã]o (?:Especial |Tempor[aá]ria |Externa |Tempor[aá]ria Externa )?destinada a (.+)$/i.exec(n);
  if (m) return `Criada para ${minus(m[1]!)}.`;
  m = /^Comiss[aã]o (?:Permanente |Mista |Mista Permanente |Permanente Mista )*(?:de |da |do |dos |das |sobre )(.+)$/i.exec(n);
  if (m) return `Analisa propostas sobre ${leigo(m[1]!)}.`;
  return "Colegiado do Congresso que analisa propostas e fiscaliza temas da sua área.";
}

export const oQueFaz = (c: { sigla: string; nome: string }, casa: "camara" | "senado" = "camara") =>
  porSigla(c.sigla, casa)?.oQueFaz ?? oQueFazDerivado(c.nome);

/** Órgãos da Câmara que não são comissões (sem página própria). */
const NAO_COMISSAO = new Set(["PLEN", "MESA", "CCP", "SGM", "COPER", "CN", "PR", "SF", "CD", "PRES", "SECAP", "DEPCO"]);

/** Sigla de órgão (tramitação, evento, votação) -> página da comissão. Usa o catálogo; senão o id da URI da Câmara. */
export function hrefOrgao(sigla: string, uriOuId?: string | number | null): string | null {
  const s = sigla.trim().toUpperCase();
  if (NAO_COMISSAO.has(s)) return null;
  const c = porSigla(sigla, "camara");
  if (c && (c.casa !== "senado")) return hrefComissao(c);
  const id = typeof uriOuId === "number" ? uriOuId : Number(/\/orgaos\/(\d+)/.exec(uriOuId ?? "")?.[1]);
  return Number.isInteger(id) && id > 0 ? `/comissao/camara-${id}` : null;
}
