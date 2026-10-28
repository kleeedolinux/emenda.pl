// Conteúdo do "Entenda": explicações curtas para quem nunca leu um orçamento.
// Texto neutro; cada tema cita fontes oficiais. Números ao vivo vêm de `numeros`.
import type { TipoEmenda } from "@emenda/contracts";

export interface Passo { titulo: string; texto: string }
export interface FonteOficial { label: string; href: string }
export interface Veja { to: string; label: string }
export interface Tema {
  slug: string;
  titulo: string;
  /** uma frase */
  resumo: string;
  grupo: "Dinheiro" | "Congresso";
  passos: Passo[];
  /** parágrafos extras (contexto, controvérsias) */
  detalhes?: string[];
  /** bloco de números reais a mostrar */
  numeros?: { tipo: TipoEmenda } | "brasil" | "abertas" | "ciclo";
  fontes: FonteOficial[];
  veja: Veja[];
}

const PLANALTO = "https://www.planalto.gov.br/ccivil_03";
export const F = {
  cf165: { label: "Constituição Federal, arts. 165 a 166 (orçamento e emendas)", href: `${PLANALTO}/constituicao/constituicao.htm#art165` },
  cf166a: { label: "Constituição Federal, art. 166-A (transferência especial)", href: `${PLANALTO}/constituicao/constituicao.htm#art166a` },
  cf59: { label: "Constituição Federal, arts. 59 a 69 (processo legislativo)", href: `${PLANALTO}/constituicao/constituicao.htm#art59` },
  cf44: { label: "Constituição Federal, arts. 44 a 47 (Câmara e Senado)", href: `${PLANALTO}/constituicao/constituicao.htm#art44` },
  ec86: { label: "EC 86/2015 (emendas individuais obrigatórias)", href: `${PLANALTO}/constituicao/emendas/emc/emc86.htm` },
  ec100: { label: "EC 100/2019 (emendas de bancada obrigatórias)", href: `${PLANALTO}/constituicao/emendas/emc/emc100.htm` },
  ec105: { label: "EC 105/2019 (cria a transferência especial, a “Emenda Pix”)", href: `${PLANALTO}/constituicao/emendas/emc/emc105.htm` },
  ec126: { label: "EC 126/2022 (PEC da Transição; redistribui recursos após o fim do RP9)", href: `${PLANALTO}/constituicao/emendas/emc/emc126.htm` },
  lc210: { label: "Lei Complementar 210/2024 (regras de transparência para emendas)", href: `${PLANALTO}/leis/lcp/lcp210.htm` },
  ldo: { label: "LDO 2025 — Lei 15.080/2024 (Lei de Diretrizes Orçamentárias)", href: `${PLANALTO}/_ato2023-2026/2024/lei/L15080.htm` },
  lei4320: { label: "Lei 4.320/1964 (empenho, liquidação e pagamento)", href: `${PLANALTO}/leis/l4320.htm` },
  adpf850: { label: "STF — ADPF 850 (orçamento secreto)", href: "https://portal.stf.jus.br/processos/listarProcessos.asp?classe=ADPF&numeroProcesso=850" },
  adpf851: { label: "STF — ADPF 851 (orçamento secreto)", href: "https://portal.stf.jus.br/processos/listarProcessos.asp?classe=ADPF&numeroProcesso=851" },
  adpf854: { label: "STF — ADPF 854 (orçamento secreto; rastreabilidade das emendas)", href: "https://portal.stf.jus.br/processos/listarProcessos.asp?classe=ADPF&numeroProcesso=854" },
  portal: { label: "Portal da Transparência — emendas parlamentares", href: "https://portaldatransparencia.gov.br/emendas" },
  lei9096: { label: "Lei 9.096/1995, art. 22-A (janela partidária)", href: `${PLANALTO}/leis/l9096.htm` },
  ec97: { label: "EC 97/2017 (fidelidade partidária e janela)", href: `${PLANALTO}/constituicao/emendas/emc/emc97.htm` },
  camaraApi: { label: "Dados Abertos da Câmara (votações e votos)", href: "https://dadosabertos.camara.leg.br/swagger/api.html" },
  senadoApi: { label: "Dados Abertos do Senado", href: "https://legis.senado.leg.br/dadosabertos/docs/" },
} satisfies Record<string, FonteOficial>;

export const TEMAS: Tema[] = [
  {
    slug: "o-que-e-emenda", titulo: "O que é uma emenda parlamentar", grupo: "Dinheiro", numeros: "brasil",
    resumo: "É o pedaço do Orçamento da União que deputados e senadores podem direcionar para obras, serviços e cidades.",
    passos: [
      { titulo: "Governo propõe", texto: "Todo ano o Executivo envia ao Congresso o projeto de lei do Orçamento (PLOA)." },
      { titulo: "Congresso emenda", texto: "Parlamentares, bancadas estaduais e comissões apresentam emendas: “tire daqui, coloque ali”." },
      { titulo: "Lei aprovada", texto: "O Orçamento aprovado (LOA) traz as emendas. Boa parte delas é de execução obrigatória." },
      { titulo: "Dinheiro chega", texto: "O governo empenha, a obra ou compra acontece e o valor é pago ao município, estado ou entidade." },
    ],
    detalhes: [
      "Emendas existem para que quem conhece a realidade local ajude a decidir gastos federais. A crítica mais comum é que elas pulverizam o orçamento e podem servir de moeda de troca política.",
      "Há quatro tipos principais: individual, de bancada, de comissão e de relator (esta última extinta como RP9 em 2022).",
    ],
    fontes: [F.cf165, F.ec86, F.portal],
    veja: [{ to: "/emendas", label: "Explorador de emendas" }, { to: "/dinheiro", label: "Fluxo do dinheiro" }],
  },
  {
    slug: "emenda-individual", titulo: "Emenda individual", grupo: "Dinheiro", numeros: { tipo: "individual" },
    resumo: "Cada deputado e senador tem uma cota anual para indicar, e o governo é obrigado a executá-la.",
    passos: [
      { titulo: "Cota igual", texto: "Todos os parlamentares recebem o mesmo valor de cota, definido pela Constituição como percentual da receita." },
      { titulo: "Metade para saúde", texto: "Pelo menos metade da cota individual precisa ir para ações e serviços públicos de saúde." },
      { titulo: "Execução obrigatória", texto: "Desde a EC 86/2015 o governo não pode simplesmente deixar de pagar (salvo impedimento técnico)." },
      { titulo: "Duas formas", texto: "Com finalidade definida (convênio, objeto específico) ou como transferência especial, a “Emenda Pix”." },
    ],
    fontes: [F.cf165, F.ec86, F.portal],
    veja: [{ to: "/emendas?tipo=individual", label: "Emendas individuais" }, { to: "/deputados", label: "Deputados" }],
  },
  {
    slug: "emenda-pix", titulo: "Emenda Pix", grupo: "Dinheiro", numeros: { tipo: "pix" },
    resumo: "Transferência especial: o dinheiro cai direto na conta da prefeitura ou do estado, sem convênio e sem objeto definido na origem.",
    passos: [
      { titulo: "Parlamentar indica", texto: "Escolhe o município ou estado que vai receber, dentro da sua cota individual." },
      { titulo: "Transferência direta", texto: "A União repassa o valor para a conta do ente, sem convênio nem plano de trabalho prévio (EC 105/2019)." },
      { titulo: "Ente decide o uso", texto: "A prefeitura ou o estado aplica o recurso; pelo menos 70% devem ir para investimento." },
      { titulo: "Fiscalização", texto: "Como o dinheiro vira recurso do ente, a fiscalização é feita principalmente por tribunais de contas locais." },
    ],
    detalhes: [
      "Por que é polêmica: críticos — incluindo órgãos de controle — apontam que fica difícil rastrear em que o dinheiro foi gasto. Defensores dizem que reduz burocracia e acelera obras em cidades pequenas.",
      "Em 2024 o STF (relator Flávio Dino, no âmbito da ADPF 854) passou a exigir plano de trabalho, conta específica e identificação do objeto. A Lei Complementar 210/2024 incorporou regras de transparência.",
    ],
    fontes: [F.ec105, F.cf166a, F.adpf854, F.lc210, F.portal],
    veja: [{ to: "/pix", label: "Painel da Emenda Pix" }, { to: "/ultimas?tipo=pix", label: "Pagamentos Pix recentes" }],
  },
  {
    slug: "emenda-de-bancada", titulo: "Emenda de bancada", grupo: "Dinheiro", numeros: { tipo: "bancada" },
    resumo: "Os parlamentares de um mesmo estado decidem juntos projetos estruturantes para o estado.",
    passos: [
      { titulo: "Bancada se reúne", texto: "Deputados e senadores de cada UF votam quais projetos apoiar." },
      { titulo: "Projetos maiores", texto: "Costumam ser obras e equipamentos de impacto regional." },
      { titulo: "Execução obrigatória", texto: "Desde a EC 100/2019, parte das emendas de bancada também é obrigatória." },
    ],
    fontes: [F.cf165, F.ec100, F.portal],
    veja: [{ to: "/emendas?tipo=bancada", label: "Emendas de bancada" }],
  },
  {
    slug: "emenda-de-comissao", titulo: "Emenda de comissão", grupo: "Dinheiro", numeros: { tipo: "comissao" },
    resumo: "Apresentada por comissões temáticas da Câmara e do Senado (saúde, educação, agricultura…).",
    passos: [
      { titulo: "Comissão aprova", texto: "A comissão vota as emendas da sua área." },
      { titulo: "Execução discricionária", texto: "Não é obrigatória: o governo pode executar ou não." },
      { titulo: "Cresceu após 2022", texto: "Com o fim do RP9, parte desse espaço migrou para emendas de comissão, alvo de cobrança por mais transparência sobre quem indicou cada valor." },
    ],
    fontes: [F.cf165, F.adpf854, F.lc210],
    veja: [{ to: "/emendas?tipo=comissao", label: "Emendas de comissão" }],
  },
  {
    slug: "emenda-de-relator", titulo: "Emenda de relator (RP9)", grupo: "Dinheiro", numeros: { tipo: "relator" },
    resumo: "O “orçamento secreto”: emendas registradas em nome do relator-geral, sem mostrar quem de fato pediu cada valor.",
    passos: [
      { titulo: "2020–2022", texto: "O relator-geral do Orçamento concentrou bilhões no identificador RP9." },
      { titulo: "Sem autoria real", texto: "Os parlamentares que indicavam os recursos não apareciam nos sistemas públicos." },
      { titulo: "STF decide", texto: "Em dezembro de 2022 o STF julgou o RP9 inconstitucional (ADPFs 850, 851 e 854)." },
      { titulo: "O que mudou", texto: "A EC 126/2022 redistribuiu os valores; desde 2024 o STF cobra rastreabilidade também de outras emendas." },
    ],
    detalhes: [
      "Segundo o STF, o modelo violava princípios de transparência e impessoalidade. Os defensores argumentavam que se tratava de instrumento legítimo de negociação orçamentária.",
    ],
    fontes: [F.adpf850, F.adpf851, F.adpf854, F.ec126, F.portal],
    veja: [{ to: "/emendas?tipo=relator", label: "Emendas de relator registradas" }],
  },
  {
    slug: "ciclo-do-dinheiro", titulo: "Ciclo do dinheiro", grupo: "Dinheiro", numeros: "ciclo",
    resumo: "Da promessa ao cofre: empenho, liquidação, pagamento e restos a pagar.",
    passos: [
      { titulo: "Empenho", texto: "O governo reserva o valor. É a promessa formal de pagar." },
      { titulo: "Liquidação", texto: "O governo confere se a obra, compra ou serviço foi entregue." },
      { titulo: "Pagamento", texto: "O dinheiro sai do Tesouro para o favorecido." },
      { titulo: "Restos a pagar", texto: "O que foi empenhado e não pago no ano passa para os anos seguintes — ou é cancelado." },
    ],
    fontes: [F.lei4320, F.ldo, F.portal],
    veja: [{ to: "/entenda/o-que-esta-aberto", label: "Quanto está em aberto" }, { to: "/ultimas", label: "Últimos pagamentos" }],
  },
  {
    slug: "o-que-esta-aberto", titulo: "O que está aberto", grupo: "Dinheiro", numeros: "abertas",
    resumo: "Dinheiro de emendas já empenhado (prometido) que ainda não foi pago nem cancelado.",
    passos: [
      { titulo: "Empenhado", texto: "Valor reservado para a emenda." },
      { titulo: "Menos pago", texto: "Tiramos o que foi pago no ano e os restos a pagar já pagos." },
      { titulo: "Menos cancelado", texto: "Tiramos os restos a pagar cancelados." },
      { titulo: "= Em aberto", texto: "O que sobra ainda pode virar pagamento: é dinheiro comprometido, mas não entregue." },
    ],
    detalhes: ["Saldo em aberto não é irregularidade: obras levam tempo. Mas saldos antigos merecem atenção, porque podem indicar obra parada."],
    fontes: [F.lei4320, F.portal],
    veja: [{ to: "/entenda/ciclo-do-dinheiro", label: "Ciclo do dinheiro" }, { to: "/emendas", label: "Explorar emendas" }],
  },
  {
    slug: "como-ler-uma-votacao", titulo: "Como ler uma votação", grupo: "Congresso",
    resumo: "Placar, votos nominais, orientação de bancada e por que às vezes não há registro de voto.",
    passos: [
      { titulo: "Simbólica ou nominal", texto: "Na simbólica o presidente vê o plenário; só na nominal cada voto fica registrado." },
      { titulo: "Orientação", texto: "Líderes orientam a bancada (Sim, Não, Liberado, Obstrução)." },
      { titulo: "Votos", texto: "Sim, Não, Abstenção, Obstrução ou ausência. Ausente não é o mesmo que votar contra." },
      { titulo: "Quórum", texto: "Leis ordinárias precisam de maioria simples; PEC precisa de 3/5 em dois turnos em cada Casa." },
    ],
    fontes: [F.cf59, F.camaraApi, F.senadoApi],
    veja: [{ to: "/proposicoes", label: "Proposições e votações" }, { to: "/agenda", label: "Agenda da semana" }],
  },
  {
    slug: "tipos-de-proposicao", titulo: "Tipos de proposição", grupo: "Congresso",
    resumo: "PL, PLP, PEC, MPV e PDL: o que cada sigla quer dizer.",
    passos: [
      { titulo: "PL", texto: "Projeto de lei ordinária: maioria simples." },
      { titulo: "PLP", texto: "Projeto de lei complementar: maioria absoluta, para temas que a Constituição exige." },
      { titulo: "PEC", texto: "Proposta de emenda à Constituição: 3/5 dos votos, dois turnos, nas duas Casas; não passa por sanção." },
      { titulo: "MPV", texto: "Medida provisória: editada pelo Presidente, vale na hora e perde efeito se não for aprovada em até 120 dias." },
      { titulo: "PDL", texto: "Projeto de decreto legislativo: competência exclusiva do Congresso (ex.: sustar atos do Executivo)." },
    ],
    fontes: [F.cf59],
    veja: [{ to: "/proposicoes", label: "Buscar proposições" }],
  },
  {
    slug: "como-uma-lei-nasce", titulo: "Como uma lei nasce", grupo: "Congresso",
    resumo: "Da apresentação à publicação: Câmara, Senado, sanção ou veto.",
    passos: [
      { titulo: "Apresentação", texto: "Parlamentar, Presidente, tribunais ou cidadãos (iniciativa popular) apresentam o projeto." },
      { titulo: "Comissões", texto: "Comissões analisam mérito e constitucionalidade; algumas decidem sem ir ao plenário." },
      { titulo: "Câmara e Senado", texto: "Uma Casa aprova e envia à outra (revisora). Se mudar, volta para a primeira." },
      { titulo: "Sanção ou veto", texto: "O Presidente tem 15 dias úteis. O Congresso pode derrubar o veto." },
      { titulo: "Publicação", texto: "A lei é publicada no Diário Oficial e passa a valer na data prevista." },
    ],
    fontes: [F.cf59],
    veja: [{ to: "/proposicoes", label: "Leis em tramitação" }],
  },
  {
    slug: "mandatos", titulo: "Mandatos", grupo: "Congresso",
    resumo: "Deputado tem mandato de 4 anos; senador, de 8. Suplentes assumem quando o titular se afasta.",
    passos: [
      { titulo: "Deputados", texto: "513, eleitos a cada 4 anos pelo sistema proporcional." },
      { titulo: "Senadores", texto: "81 (3 por UF), mandato de 8 anos, renovação de 1/3 e 2/3 alternada." },
      { titulo: "Legislatura", texto: "Período de 4 anos de trabalho do Congresso (a 57ª vai de 2023 a 2027)." },
      { titulo: "Suplentes", texto: "Assumem quando o titular vira ministro, se licencia ou perde o mandato." },
    ],
    fontes: [F.cf44],
    veja: [{ to: "/deputados", label: "Deputados" }, { to: "/senadores", label: "Senadores" }],
  },
  {
    slug: "troca-de-partido", titulo: "Troca de partido e janela partidária", grupo: "Congresso",
    resumo: "Deputados só podem trocar de partido sem perder o mandato em situações previstas, como a janela partidária.",
    passos: [
      { titulo: "Fidelidade", texto: "Nos cargos proporcionais (deputados), o mandato pertence ao partido." },
      { titulo: "Janela", texto: "Nos 30 dias antes do prazo de filiação para a eleição seguinte, a troca é permitida (Lei 9.096/1995, art. 22-A)." },
      { titulo: "Justa causa", texto: "Fora da janela, só com justa causa (ex.: desvio do programa, perseguição) ou fusão do partido." },
      { titulo: "Senadores", texto: "Eleitos pelo sistema majoritário, segundo o STF não perdem o mandato ao trocar de partido." },
    ],
    fontes: [F.lei9096, F.ec97, F.camaraApi],
    veja: [{ to: "/deputados", label: "Deputados" }, { to: "/partidos", label: "Partidos" }],
  },
];

export const temaPorSlug = (slug: string | undefined) => TEMAS.find((t) => t.slug === slug) ?? null;

export function vizinhos(slug: string) {
  const i = TEMAS.findIndex((t) => t.slug === slug);
  return { anterior: i > 0 ? TEMAS[i - 1]! : null, proximo: i >= 0 && i < TEMAS.length - 1 ? TEMAS[i + 1]! : null };
}
