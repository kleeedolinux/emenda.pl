// Cabeçalho de cada página em linguagem comum. Ordem: (1) o que é, (2) por que importa, (3) o que fazer aqui.
// Jargão só no rótulo pequeno "Oficialmente: ...". Testado em cabecalhos.test.ts. Puro.
import { naUf } from "@/features/share/viral";

export interface Cabecalho { titulo: string; subtitulo: string; oficial?: string }

export const CABECALHOS = {
  home: {
    titulo: "Veja quanto dinheiro chegou na sua cidade — e quem mandou",
    subtitulo: "Deputados e senadores mandam dinheiro público para cidades. Digite o nome da sua e veja quanto chegou, quem mandou e no que foi gasto.",
    oficial: "Oficialmente: emendas parlamentares",
  },
  emendas: {
    titulo: "Dinheiro que deputados e senadores mandaram",
    subtitulo: "Todo ano, cada deputado e senador escolhe para onde vai uma parte do dinheiro público. Veja quanto foi, para onde e quem mandou.",
    oficial: "Oficialmente: emendas parlamentares",
  },
  ultimas: {
    titulo: "Dinheiro que acabou de ser pago",
    subtitulo: "Os pagamentos mais recentes do dinheiro mandado por deputados e senadores. Veja quem mandou, quem recebeu e em que cidade.",
    oficial: "Oficialmente: pagamentos de emendas parlamentares",
  },
  dinheiro: {
    titulo: "Para onde vai o dinheiro que os políticos mandam",
    subtitulo: "Siga o caminho do dinheiro: de que jeito foi mandado, no que foi gasto e em que estado chegou. Toque numa parte para ver mais.",
    oficial: "Oficialmente: emendas parlamentares por tipo, função e UF",
  },
  pix: {
    titulo: "Dinheiro mandado sem dizer para quê",
    subtitulo: "Deputados e senadores podem mandar dinheiro público direto para a prefeitura da sua cidade, sem dizer em que ele vai ser usado. Veja quanto chegou na sua cidade e quem mandou.",
    oficial: "Oficialmente: emenda Pix (transferência especial)",
  },
  proposicoes: {
    titulo: "Leis em discussão",
    subtitulo: "Tudo o que deputados querem mudar nas leis — e na Constituição. Isso muda regras que valem para você. Procure por assunto, número ou pelo nome de quem apresentou.",
    oficial: "Oficialmente: proposições (PL, PEC, MPV e outras)",
  },
  votacao: {
    titulo: "Como cada deputado votou",
    subtitulo: "Veja o resultado e o voto de cada deputado. Procure o seu pelo nome ou pelo estado.",
    oficial: "Oficialmente: votação nominal na Câmara",
  },
  partidos: {
    titulo: "Partidos",
    subtitulo: "Quantos deputados e senadores cada partido tem hoje e quanto dinheiro eles mandaram para as cidades. Toque num partido para ver quem faz parte.",
  },
  bancadas: {
    titulo: "Grupos de interesse no Congresso",
    subtitulo: "Políticos de vários partidos se juntam para defender um tema: religião, agro, segurança e outros. Veja quem faz parte de cada grupo e como votaram.",
    oficial: "Oficialmente: frentes parlamentares",
  },
  comissoes: {
    titulo: "Grupos que analisam as leis por tema",
    subtitulo: "Antes de uma lei ser votada por todos, um grupo menor de políticos especialistas no tema discute e vota. Veja quem manda em cada grupo e o que vão discutir.",
    oficial: "Oficialmente: comissões da Câmara e do Senado",
  },
  federacoes: {
    titulo: "Partidos que se juntaram",
    subtitulo: "Alguns partidos se uniram para agir como um só por pelo menos quatro anos. Veja quem está junto e quantos políticos eles têm.",
    oficial: "Oficialmente: federações partidárias",
  },
  congresso: {
    titulo: "O Congresso em números",
    subtitulo: "Quem são os 594 deputados e senadores, quanto gastam, quanto dinheiro mandaram para as cidades e se aparecem para votar. Tudo com dados oficiais.",
  },
  stf: {
    titulo: "Supremo Tribunal Federal",
    subtitulo: "Os 11 juízes que decidem se as leis respeitam a Constituição. Veja quem são, como foram escolhidos e os casos que estão julgando.",
    oficial: "Oficialmente: STF",
  },
  agenda: {
    titulo: "O que o Congresso vai votar",
    subtitulo: "As votações marcadas para os próximos dias na Câmara e no Senado. Veja o que pode mudar e quando, no horário de Brasília.",
    oficial: "Oficialmente: pauta do Plenário e das comissões",
  },
  auditar: {
    titulo: "Audite seu candidato",
    subtitulo: "Antes de votar de novo, veja o que seu deputado ou senador fez: quanto dinheiro mandou e para onde, como votou e quanto gastou. Só números oficiais, sem opinião.",
  },
  deputados: {
    titulo: "Deputados federais",
    subtitulo: "Os 513 políticos eleitos para fazer as leis do país e mandar dinheiro para as cidades. Procure o do seu estado pelo nome.",
  },
  senadores: {
    titulo: "Senadores",
    subtitulo: "Os 81 políticos eleitos, 3 por estado, para revisar as leis do país e mandar dinheiro para as cidades. Procure os do seu estado pelo nome.",
  },
  estaduais: {
    titulo: "Deputados estaduais",
    subtitulo: "Os políticos que fazem as leis do seu estado e fiscalizam o governador. Veja quem são, por estado.",
    oficial: "Oficialmente: Assembleias Legislativas",
  },
  novidades: {
    titulo: "O que mudou hoje",
    subtitulo: "Votações, leis novas, dinheiro pago e políticos que mudaram de partido, atualizados todo dia a partir dos dados oficiais.",
  },
  orcamentoSecreto: {
    titulo: "Orçamento secreto",
    subtitulo: "Entre 2020 e 2022, bilhões de reais foram distribuídos pelo relator do Orçamento sem mostrar qual político pediu. O STF mandou acabar com isso em dezembro de 2022. Veja para onde foi o dinheiro.",
    oficial: "Oficialmente: emendas de relator-geral (RP9)",
  },
} satisfies Record<string, Cabecalho>;

export type PaginaCabecalho = keyof typeof CABECALHOS;

/** Páginas de um lugar ou de uma pessoa: o nome vem dos dados. */
export const cabecalhoMunicipio = (nome: string): Cabecalho => ({
  titulo: nome,
  subtitulo: `Quanto dinheiro deputados e senadores mandaram para ${nome}, quem mandou e no que foi gasto.`,
  oficial: "Oficialmente: emendas parlamentares pagas ao município",
});
/** "da Bahia", "de São Paulo", "do Rio de Janeiro". */
const daUf = (nome: string, uf?: string) => (uf ? naUf(uf).replace(/^na /, "da ").replace(/^no /, "do ").replace(/^em /, "de ") : `de ${nome}`);
export const cabecalhoUf = (nome: string, uf?: string): Cabecalho => ({
  titulo: nome,
  subtitulo: `Quanto dinheiro deputados e senadores mandaram para cidades ${daUf(nome, uf)}, quem mandou e quais cidades mais receberam.`,
  oficial: "Oficialmente: emendas parlamentares pagas na UF",
});
export const cabecalhoPolitico = (nome: string, cargo: "deputado" | "senador"): Cabecalho => ({
  titulo: nome,
  subtitulo: `O que ${cargo === "senador" ? "este senador" : "este deputado"} fez com o seu voto: dinheiro que mandou para as cidades, como votou, o que quer mudar nas leis e quanto gastou.`,
});

/** Topo grande (Home e /emendas): número total em destaque. */
export const HERO = {
  eyebrow: "Dinheiro público · desde",
  rotulo: "Deputados e senadores já mandaram",
  linha: "para cidades e estados de todo o Brasil. Veja quanto chegou na sua — e quem mandou.",
  oficial: "Oficialmente: emendas parlamentares",
  placeholder: "Digite sua cidade",
} as const;
