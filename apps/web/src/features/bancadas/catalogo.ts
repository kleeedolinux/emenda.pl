// Bancadas temáticas: nome popular -> frente parlamentar oficial registrada na Câmara (57ª legislatura).
// Curadoria neutra. IDs e títulos conferidos em /api/v2/frentes/{id} (out/2026).
// `resumo` parafraseia a finalidade declarada pela própria frente no requerimento/estatuto (urlDocumento),
// sem juízo de valor; `fonte` indica o trecho do documento. Membros, coordenação e partidos vêm sempre ao vivo.

export interface BancadaTematica {
  id: number;
  slug: string;
  /** como a imprensa e o público costumam chamar */
  apelido: string;
  /** outros nomes populares (busca) */
  aliases: string[];
  /** título oficial, como registrado na Câmara */
  oficial: string;
  tema: string;
  /** finalidade declarada pela própria frente (paráfrase neutra) */
  resumo: string;
  /** trecho do documento oficial usado no resumo */
  fonte: string;
  nota?: string;
}

export const BANCADAS_TEMATICAS: BancadaTematica[] = [
  {
    id: 54323, slug: "ruralista", apelido: "Bancada ruralista", aliases: ["agro", "agropecuaria", "fpa", "bancada do boi"],
    oficial: "Frente Parlamentar da Agropecuária - FPA", tema: "Economia rural",
    resumo: "Declara reunir parlamentares de diferentes partidos para estimular políticas públicas voltadas ao desenvolvimento do agronegócio: acompanhar a política agrícola, promover debates e aperfeiçoar a legislação do setor.",
    fonte: "Estatuto, arts. 1º e 2º",
  },
  {
    id: 54317, slug: "seguranca-publica", apelido: "Bancada da bala", aliases: ["seguranca publica", "policiais", "bala"],
    oficial: "Frente Parlamentar da Segurança Pública", tema: "Segurança",
    resumo: "Declara acompanhar a política oficial de segurança pública, debater prevenção e repressão ao crime e aperfeiçoar a legislação sobre carreira, remuneração e equipamentos dos profissionais de segurança.",
    fonte: "Estatuto, art. 2º",
    nota: "“Bancada da bala” é um apelido da imprensa; não é o nome usado pela frente.",
  },
  {
    id: 54477, slug: "evangelica", apelido: "Bancada evangélica", aliases: ["evangelicos", "fpe", "bancada da biblia"],
    oficial: "Frente Parlamentar Evangélica do Congresso Nacional", tema: "Religião",
    resumo: "Declara promover a defesa e a articulação política das bandeiras evangélicas no Congresso, acompanhar programas e políticas do governo e promover debates sobre temas de relevância para o segmento.",
    fonte: "Estatuto, art. 2º",
  },
  {
    id: 54326, slug: "catolica", apelido: "Bancada católica", aliases: ["catolicos", "igreja catolica"],
    oficial: "Frente Parlamentar Católica Apostólica Romana", tema: "Religião",
    resumo: "Declara defender no Congresso os princípios éticos e morais da Igreja Católica, acompanhar projetos relacionados a esses princípios e divulgar assuntos de interesse da CNBB.",
    fonte: "Estatuto, art. 2º",
  },
  {
    id: 54538, slug: "vida-e-familia", apelido: "Bancada da família", aliases: ["familia", "vida", "pro-vida"],
    oficial: "Frente Parlamentar em Defesa da Vida e da Família", tema: "Costumes",
    resumo: "Declara acompanhar e fiscalizar políticas públicas destinadas à proteção dos direitos à vida, da família, da criança e do adolescente, e promover debates e legislação sobre esses temas.",
    fonte: "Estatuto, art. 2º",
  },
  {
    id: 54406, slug: "ambientalista", apelido: "Bancada ambientalista", aliases: ["meio ambiente", "verde", "clima"],
    oficial: "Frente Parlamentar Mista Ambientalista", tema: "Meio ambiente",
    resumo: "Declara acompanhar processos legislativos ligados à questão ambiental e apoiar, com a sociedade civil, políticas que busquem padrões sustentáveis de desenvolvimento, como acordos climáticos e licenciamento ambiental.",
    fonte: "Estatuto, arts. 1º e 3º",
  },
  {
    id: 54464, slug: "cacs", apelido: "Bancada das armas (CACs)", aliases: ["armas", "cac", "atiradores", "clubes de tiro"],
    oficial: "Frente Parlamentar Mista de Proteção aos Colecionadores, Atiradores Desportivos, Caçadores e Clubes de Tiro", tema: "Segurança",
    resumo: "Declara atuar como plataforma política para promover os direitos de colecionadores, atiradores desportivos, caçadores e clubes de tiro, mobilizando parlamentares em políticas que afetem essas categorias.",
    fonte: "Estatuto, arts. 1º e 2º",
  },
  {
    id: 54449, slug: "saude", apelido: "Bancada da saúde", aliases: ["saude", "sus", "medicos"],
    oficial: "Frente Parlamentar Mista da Saúde", tema: "Saúde",
    resumo: "Declara trabalhar pela saúde como direito social, consolidar o Sistema Único de Saúde (SUS), buscar recursos do Orçamento para sua manutenção e fiscalizar a gestão do SUS nas três esferas de governo.",
    fonte: "Estatuto, arts. 2º e 3º",
  },
  {
    id: 54377, slug: "educacao", apelido: "Bancada da educação", aliases: ["educacao", "escola", "ensino"],
    oficial: "Frente Parlamentar Mista da Educação", tema: "Educação",
    resumo: "Declara acompanhar e fiscalizar a Política Nacional de Educação, monitorar o orçamento com o objetivo de ampliar o investimento público na área e defender uma educação de qualidade para todos.",
    fonte: "Estatuto, art. 2º",
  },
  {
    id: 54342, slug: "mulher", apelido: "Frente da mulher", aliases: ["mulheres", "feminina", "bancada feminina"],
    oficial: "Frente Parlamentar para o Fortalecimento da Mulher", tema: "Direitos",
    resumo: "Declara fiscalizar e acompanhar processos legislativos, programas e políticas públicas de proteção, promoção e garantia dos direitos das mulheres, em conjunto com as procuradorias da mulher.",
    fonte: "Requerimento de registro, Justificativa",
    nota: "A Bancada Feminina oficial da Câmara reúne todas as deputadas e não é uma frente parlamentar; esta é a frente registrada sobre o tema.",
  },
  {
    id: 54318, slug: "povos-indigenas", apelido: "Bancada indígena", aliases: ["indigenas", "povos originarios"],
    oficial: "Frente Parlamentar Mista em Defesa dos Direitos dos Povos Indígenas", tema: "Direitos",
    resumo: "Declara defender os direitos indígenas garantidos na Constituição de 1988, propor e acompanhar proposições sobre o tema e acompanhar a execução da política indigenista oficial.",
    fonte: "Estatuto, arts. 1º e 2º",
  },
  {
    id: 54343, slug: "agricultura-familiar", apelido: "Bancada da agricultura familiar", aliases: ["agricultura familiar", "fpaf", "pequeno produtor"],
    oficial: "Frente Parlamentar Mista da Agricultura Familiar e Desenvolvimento Rural Sustentável (FPAF)", tema: "Economia rural",
    resumo: "Declara fortalecer as políticas para a agricultura familiar e os empreendimentos familiares rurais, como crédito, assistência técnica, previdência rural e desenvolvimento rural sustentável.",
    fonte: "Estatuto, art. 2º",
  },
  {
    id: 54341, slug: "livre-mercado", apelido: "Bancada do livre mercado", aliases: ["liberal", "livre iniciativa", "fplm", "desregulamentacao"],
    oficial: "Frente Parlamentar Mista pelo Livre Mercado - FPLM", tema: "Economia",
    resumo: "Declara defender a livre iniciativa, com foco em desregulamentação, desburocratização, equilíbrio tributário e aperfeiçoamento da legislação sobre a ordem econômica.",
    fonte: "Estatuto, arts. 1º e 2º",
  },
  {
    id: 54444, slug: "municipalista", apelido: "Bancada municipalista", aliases: ["municipios", "prefeituras", "cnm"],
    oficial: "Frente Parlamentar Mista Municipalista", tema: "Federação",
    resumo: "Declara promover e defender os interesses sociais e econômicos dos municípios, acompanhar matérias de interesse municipal no Congresso e atuar em parceria com a Confederação Nacional de Municípios.",
    fonte: "Estatuto, arts. 1º e 2º",
  },
  {
    id: 54320, slug: "combate-a-corrupcao", apelido: "Frente de combate à corrupção", aliases: ["corrupcao", "anticorrupcao", "transparencia"],
    oficial: "Frente Parlamentar Mista de Combate à Corrupção", tema: "Instituições",
    resumo: "Declara desenvolver uma agenda de combate à corrupção, com propostas de legislação, melhoria da fiscalização e busca de eficiência no uso dos recursos públicos.",
    fonte: "Estatuto, art. 2º",
  },
  {
    id: 55590, slug: "lgbti", apelido: "Frente LGBTI+", aliases: ["lgbt", "lgbtqia", "diversidade"],
    oficial: "Frente Parlamentar Mista por Cidadania e Direitos LGBTI+", tema: "Direitos",
    resumo: "Declara promover e defender a cidadania e os direitos humanos da população LGBTI+, propor e acompanhar proposições sobre o tema e fiscalizar políticas públicas voltadas a essa população.",
    fonte: "Estatuto, art. 3º",
  },
];

export const bancadaPorId = (id: number) => BANCADAS_TEMATICAS.find((b) => b.id === id) ?? null;
export const bancadaPorSlug = (s: string) => BANCADAS_TEMATICAS.find((b) => b.slug === s) ?? null;

/** Documento oficial da frente (requerimento, ata e estatuto), padrão da Câmara. */
export const documentoFrente = (id: number) => `https://www.camara.leg.br/internet/deputado/Frente_Parlamentar/${id}-integra.pdf`;
export const paginaFrente = (id: number) => `https://www.camara.leg.br/internet/deputado/frenteDetalhe.asp?id=${id}`;
