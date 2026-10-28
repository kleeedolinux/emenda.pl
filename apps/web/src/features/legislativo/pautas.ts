// Pautas de grande repercussão. Curadoria neutra; IDs conferidos na API da Câmara e
// matérias conferidas em /processo do Senado (out/2026). Desfecho e votos vêm sempre ao vivo.

export interface RefSenado { sigla: string; numero: number; ano: number }
export interface Pauta {
  camaraId: number;
  sigla: string;
  numero: number;
  ano: number;
  apelido: string;
  tema: string;
  resumo: string;
  /** número no Senado quando difere do da Câmara (numeração anterior a 2019) */
  senado?: RefSenado;
  nota?: string;
}

export const PAUTAS: Pauta[] = [
  {
    camaraId: 2196833, sigla: "PEC", numero: 45, ano: 2019, apelido: "Reforma tributária", tema: "Economia",
    resumo: "Substitui cinco tributos sobre consumo (PIS, Cofins, IPI, ICMS e ISS) por um IVA dual: CBS (federal) e IBS (estados e municípios).",
  },
  {
    camaraId: 2430143, sigla: "PLP", numero: 68, ano: 2024, apelido: "Regulamentação da reforma tributária", tema: "Economia",
    resumo: "Detalha as regras do IBS, da CBS e do Imposto Seletivo, incluindo cesta básica, regimes específicos e devolução de imposto (cashback).",
  },
  {
    camaraId: 2357053, sigla: "PLP", numero: 93, ano: 2023, apelido: "Arcabouço fiscal", tema: "Economia",
    resumo: "Cria o novo regime fiscal que substituiu o teto de gastos, ligando o crescimento da despesa ao da receita e a metas de resultado primário.",
  },
  {
    camaraId: 2422697, sigla: "PL", numero: 914, ano: 2024, apelido: "Programa Mover / “taxa das blusinhas”", tema: "Economia",
    resumo: "Cria incentivos para a indústria automotiva de baixo carbono. Durante a tramitação, recebeu o trecho que passou a tributar compras internacionais de até US$ 50.",
  },
  {
    camaraId: 2487436, sigla: "PL", numero: 1087, ano: 2025, apelido: "Isenção do IR até R$ 5 mil", tema: "Economia",
    resumo: "Amplia a faixa de isenção do Imposto de Renda da pessoa física e cria uma tributação mínima para rendas mais altas.",
  },
  {
    camaraId: 2341862, sigla: "PEC", numero: 32, ano: 2022, apelido: "PEC da Transição", tema: "Economia",
    resumo: "Autorizou gastos acima do teto em 2023 para programas sociais, aprovada entre a eleição e a posse do novo governo.",
    nota: "A API da Câmara não lista votações nominais para este identificador; os votos do Senado aparecem abaixo.",
  },
  {
    camaraId: 2256735, sigla: "PL", numero: 2630, ano: 2020, apelido: "PL das Fake News", tema: "Internet",
    resumo: "Propõe regras de transparência e responsabilidade para plataformas digitais e serviços de mensagens.",
    nota: "Aprovado no Senado em 2020. Na Câmara, a urgência foi aprovada em abril de 2023, mas o projeto saiu da pauta e não teve votação de mérito.",
  },
  {
    camaraId: 2487262, sigla: "PL", numero: 2338, ano: 2023, apelido: "Marco da inteligência artificial", tema: "Internet",
    resumo: "Estabelece regras para desenvolvimento e uso de sistemas de inteligência artificial, com classificação por grau de risco.",
  },
  {
    camaraId: 345311, sigla: "PL", numero: 490, ano: 2007, apelido: "Marco temporal das terras indígenas", tema: "Direitos e meio ambiente",
    resumo: "Restringe a demarcação de terras indígenas às áreas ocupadas em 5/10/1988, entre outras mudanças no Estatuto do Índio.",
    senado: { sigla: "PL", numero: 2903, ano: 2023 },
    nota: "No Senado tramitou como PL 2.903/2023.",
  },
  {
    camaraId: 257161, sigla: "PL", numero: 2159, ano: 2021, apelido: "Lei geral do licenciamento ambiental", tema: "Direitos e meio ambiente",
    resumo: "Unifica regras de licenciamento ambiental e cria modalidades simplificadas, como a licença por adesão e compromisso.",
  },
  {
    camaraId: 2434493, sigla: "PL", numero: 1904, ano: 2024, apelido: "Aborto após 22 semanas", tema: "Direitos e meio ambiente",
    resumo: "Equipara ao crime de homicídio simples o aborto realizado após 22 semanas de gestação, inclusive nos casos hoje permitidos em lei.",
    nota: "A urgência foi aprovada em votação simbólica (sem registro nominal) em junho de 2024; não houve votação de mérito.",
  },
  {
    camaraId: 2270800, sigla: "PEC", numero: 3, ano: 2021, apelido: "PEC das prerrogativas (“PEC da Blindagem”)", tema: "Instituições",
    resumo: "Amplia proteções a parlamentares, exigindo autorização da Casa para abertura de processo criminal contra eles.",
    nota: "Aprovada na Câmara em setembro de 2025 e rejeitada na CCJ do Senado.",
  },
];

export const pautaPorCamaraId = (id: number) => PAUTAS.find((p) => p.camaraId === id) ?? null;
