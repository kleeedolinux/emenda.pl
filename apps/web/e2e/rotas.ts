// Rotas auditadas por `bun run audit:responsivo`. Toda rota do router.tsx precisa de ao menos um exemplo
// (teste `src/test/rotas-e2e.test.ts`). Vários exemplos por entidade: nomes longos, muitos dados, vazio, erro.
export interface Rota { path: string; nota: string; padrao: string }

export const ROTAS: Rota[] = [
  { padrao: "/", path: "/", nota: "home" },
  { padrao: "uf/:uf", path: "/uf/SP", nota: "UF grande" },
  { padrao: "uf/:uf", path: "/uf/RR", nota: "UF pequena" },
  { padrao: "municipio/:ibge", path: "/municipio/3550308", nota: "capital, muitos dados" },
  { padrao: "municipio/:ibge", path: "/municipio/5105507", nota: "nome longo (Vila Bela da Santíssima Trindade)" },
  { padrao: "municipio/:ibge", path: "/municipio/0000000", nota: "erro/vazio" },
  { padrao: "autor/:codigo", path: "/autor/3787", nota: "comissão autora" },
  { padrao: "dinheiro", path: "/dinheiro", nota: "" },
  { padrao: "busca", path: "/busca?q=s%C3%A3o", nota: "muitos resultados" },
  { padrao: "busca", path: "/busca?q=zzzxqwy", nota: "vazio" },
  { padrao: "emendas", path: "/emendas", nota: "" },
  { padrao: "deputados", path: "/deputados", nota: "" },
  { padrao: "deputado/:id", path: "/deputado/204554", nota: "muitas emendas e gastos" },
  { padrao: "deputado/:id", path: "/deputado/204379", nota: "" },
  { padrao: "deputado/:id", path: "/deputado/1", nota: "erro" },
  { padrao: "senadores", path: "/senadores", nota: "" },
  { padrao: "senador/:id", path: "/senador/5672", nota: "" },
  { padrao: "senador/:id", path: "/senador/5012", nota: "" },
  { padrao: "estaduais", path: "/estaduais", nota: "" },
  { padrao: "proposicoes", path: "/proposicoes", nota: "" },
  { padrao: "proposicao/:id", path: "/proposicao/2196833", nota: "PEC, ementa longa, palavras-chave longas" },
  { padrao: "votacao/:id", path: "/votacao/2270800-175", nota: "" },
  { padrao: "partidos", path: "/partidos", nota: "" },
  { padrao: "partido/:sigla", path: "/partido/PT", nota: "" },
  { padrao: "partido/:sigla", path: "/partido/REPUBLICANOS", nota: "sigla longa" },
  { padrao: "pix", path: "/pix", nota: "" },
  { padrao: "orcamento-secreto", path: "/orcamento-secreto", nota: "" },
  { padrao: "ultimas", path: "/ultimas", nota: "cartões de pagamento" },
  { padrao: "entenda", path: "/entenda", nota: "" },
  { padrao: "entenda/:tema", path: "/entenda/o-que-e-emenda", nota: "" },
  { padrao: "api", path: "/api", nota: "" },
  { padrao: "bancadas", path: "/bancadas", nota: "" },
  { padrao: "bancada/:id", path: "/bancada/ruralista", nota: "" },
  { padrao: "auditar", path: "/auditar", nota: "" },
  { padrao: "auditar/:casa/:id", path: "/auditar/deputado/204379", nota: "" },
  { padrao: "auditar/:casa/:id", path: "/auditar/senador/5672", nota: "" },
  { padrao: "comissoes", path: "/comissoes", nota: "" },
  { padrao: "comissao/:id", path: "/comissao/senado-1664", nota: "" },
  { padrao: "comissao/:id", path: "/comissao/camara-2001", nota: "" },
  { padrao: "federacoes", path: "/federacoes", nota: "" },
  { padrao: "federacao/:id", path: "/federacao/brasil-da-esperanca", nota: "" },
  { padrao: "novidades", path: "/novidades", nota: "" },
  { padrao: "congresso", path: "/congresso", nota: "" },
  { padrao: "stf", path: "/stf", nota: "" },
  { padrao: "stf/ministro/:slug", path: "/stf/ministro/gilmar-mendes", nota: "" },
  { padrao: "stf/processo/:classe/:numero", path: "/stf/processo/ADI/5000", nota: "" },
  { padrao: "agenda", path: "/agenda", nota: "" },
  { padrao: "sobre", path: "/sobre", nota: "" },
  { padrao: "*", path: "/nao-existe-esta-pagina", nota: "404" },
];

export const LARGURAS = [320, 360, 390, 430, 640, 768, 900, 1024, 1280, 1440, 1920];
/** Larguras em que o tema escuro também é auditado (layout igual; pega contrastes/fundos de sticky). */
export const LARGURAS_TEMA_ESCURO = [390, 1280];
/** Até aqui: celular (toque, `isMobile`), com checagem de alvo de toque. */
export const MAX_CELULAR = 640;
