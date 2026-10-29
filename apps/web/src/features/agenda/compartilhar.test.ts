import { describe, expect, test } from "bun:test";
import { buildMessage, ogImagePath } from "@/features/share/links";
import type { AgendaEvento } from "./agenda";
import { contagem, eventoShare, materiaShare, resultadoShare, semanaShare } from "./compartilhar";

const ev = (o: Partial<AgendaEvento> = {}): AgendaEvento => ({
  id: "camara-77", casa: "camara", ambito: "plenario", titulo: "Sessão Deliberativa Extraordinária", orgao: "Plenário", orgaoSigla: "PLEN",
  dia: "2026-10-28", hora: "13:55", inicio: "2026-10-28T13:55", status: "agendada", deliberativa: true,
  fonte: "https://camara.leg.br", materias: [], camaraId: 77, ...o,
});
// 2026-10-28 10:00 em Brasília = 13:00Z
const AGORA = Date.parse("2026-10-28T13:00:00Z");

describe("contagem", () => {
  test.each([
    ["2026-10-28T13:55", "agendada", "HOJE · 13:55"],
    ["2026-10-29T10:00", "agendada", "AMANHÃ · 10:00"],
    ["2026-10-31T09:00", "agendada", "EM 3 DIAS"],
    ["2026-10-28T09:00", "em-andamento", "AO VIVO AGORA"],
    ["2026-10-27T14:00", "encerrada", "ENCERRADA"],
  ] as const)("%s %s", (inicio, status, out) => expect(contagem(ev({ inicio, dia: inicio.slice(0, 10), hora: inicio.slice(11), status }), AGORA)).toBe(out));
});

describe("eventoShare", () => {
  test("Plenário da Câmara, hoje, deep link e OG do dia", () => {
    const d = eventoShare(ev(), AGORA);
    expect(d).toMatchObject({ kind: "agenda", url: "/agenda?dia=2026-10-28&evento=camara-77", ogId: "2026-10-28", quando: "Hoje", casa: "Plenário da Câmara", destaque: "HOJE · 13:55" });
    expect(ogImagePath(d)).toBe("/og/agenda/2026-10-28.png");
  });
  test("comissão do Senado usa o órgão", () => {
    const d = eventoShare(ev({ id: "senado-r1", casa: "senado", ambito: "comissao", orgao: "Comissão de Assuntos Econômicos", orgaoSigla: "CAE" }), AGORA);
    expect(d.casa).toBe("Comissão de Assuntos Econômicos (CAE)");
  });
  test("matérias do Senado entram como itens", () => {
    const d = eventoShare(ev({ casa: "senado", materias: [{ id: "1", sigla: "PL 1/2026", ementa: "x" }, { id: "2", sigla: "PEC 2/2026" }] }), AGORA);
    expect(d.items?.map((i) => i.sigla)).toEqual(["PL 1/2026", "PEC 2/2026"]);
    expect(d.casa).toBe("Plenário do Senado");
  });
});

describe("materiaShare", () => {
  test("mensagem viral de item da pauta", () => {
    const d = materiaShare(ev(), { id: "1", sigla: "PL 2630/2020", ementa: "Institui a Lei Brasileira de Liberdade, Responsabilidade e Transparência na Internet.", href: "/proposicao/2256735" }, AGORA, "Fake News");
    expect(buildMessage(d)).toBe("🗳️ Hoje o Plenário da Câmara vota o PL 2630/2020 (Fake News). Acompanhe 👇");
    expect(d.url).toBe("/agenda?dia=2026-10-28&evento=camara-77");
    expect(d.subtitle).toContain("Liberdade");
  });
});

describe("resultadoShare", () => {
  test("placar extraído da descrição", () => {
    const d = resultadoShare({ id: "2196833-395", descricao: "Aprovada a Proposta. Sim: 375; não: 113; abstenção: 4; total: 492.", aprovacao: 1, proposicaoObjeto: "PEC 45/2019" });
    expect(buildMessage(d)).toBe("✅ Resultado: PEC 45/2019 aprovada 375×113. Veja como votou cada deputado 👇");
    expect(ogImagePath(d)).toBe("/og/votacao/2196833-395.png");
    expect(d.url).toBe("/votacao/2196833-395");
  });
  test("sem placar nem objeto", () => {
    const d = resultadoShare({ id: "1-2", descricao: "Rejeitado o Requerimento.", aprovacao: 0 });
    expect(buildMessage(d)).toBe("❌ Resultado: Rejeitado o Requerimento. Veja como votou cada deputado 👇");
  });
});

describe("semanaShare", () => {
  test("conta sessões com votação", () => {
    const d = semanaShare([ev(), ev({ id: "x", casa: "senado" }), ev({ id: "y", ambito: "comissao" })], "2026-10-26");
    expect(buildMessage(d)).toBe("🗳️ Agenda do Congresso nesta semana: 2 sessões com votação no Plenário. Veja o que será votado 👇");
    expect(d.url).toBe("/agenda");
    expect(d.ogId).toBe("hoje");
  });
});
