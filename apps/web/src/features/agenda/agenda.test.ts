import { describe, expect, test } from "bun:test";
import {
  diaSP, semanaSP, somarDias, mesesDaSemana, fromCamara, fromSenadoSessao, fromSenadoReuniao, toICS, icsFilename,
  type AgendaEvento,
} from "./agenda";

describe("datas em America/Sao_Paulo", () => {
  test.each([
    ["2026-10-28T12:00:00Z", "2026-10-28"],
    ["2026-10-29T02:30:00Z", "2026-10-28"], // 23:30 em Brasília
    ["2026-10-29T03:00:00Z", "2026-10-29"],
  ])("diaSP(%s) = %s", (iso, dia) => expect(diaSP(new Date(iso))).toBe(dia));

  test.each([
    ["2026-10-28T12:00:00Z", 0, "2026-10-26", "2026-11-01"],
    ["2026-11-02T02:00:00Z", 0, "2026-10-26", "2026-11-01"], // domingo 23h em SP
    ["2026-10-28T12:00:00Z", -1, "2026-10-19", "2026-10-25"],
    ["2026-10-28T12:00:00Z", 1, "2026-11-02", "2026-11-08"],
    ["2026-12-30T12:00:00Z", 0, "2026-12-28", "2027-01-03"],
  ])("semanaSP(%s, %d)", (iso, off, ini, fim) => {
    const s = semanaSP(new Date(iso), off as number);
    expect([s.inicio, s.fim]).toEqual([ini as string, fim as string]);
    expect(s.dias).toHaveLength(7);
    expect(s.dias[0]).toBe(ini as string);
  });

  test("somarDias e meses da semana", () => {
    expect(somarDias("2026-02-28", 1)).toBe("2026-03-01");
    expect(mesesDaSemana(semanaSP(new Date("2026-10-28T12:00:00Z")))).toEqual(["20261026", "20261101"]);
    expect(mesesDaSemana(semanaSP(new Date("2026-10-14T12:00:00Z")))).toEqual(["20261012"]);
  });
});

describe("normalização", () => {
  test("Câmara plenário", () => {
    const e = fromCamara({
      id: 83098, dataHoraInicio: "2026-10-27T14:14", dataHoraFim: "2026-10-27T22:07", situacao: "Encerrada",
      descricaoTipo: "Sessão Deliberativa", descricao: "Sessão Deliberativa Extraordinária",
      orgaos: [{ sigla: "PLEN", nome: "Plenário", codTipoOrgao: 26 }],
      localCamara: { nome: "Plenário da Câmara dos Deputados" }, urlRegistro: "https://youtube.com/x",
    });
    expect(e).toMatchObject({
      id: "camara-83098", casa: "camara", ambito: "plenario", dia: "2026-10-27", hora: "14:14",
      fim: "2026-10-27T22:07", deliberativa: true, status: "encerrada", orgao: "Plenário",
      local: "Plenário da Câmara dos Deputados", video: "https://youtube.com/x", camaraId: 83098,
    });
    expect(e.fonte).toContain("camara.leg.br");
  });

  test("Câmara comissão cancelada", () => {
    const e = fromCamara({
      id: 1, dataHoraInicio: "2026-10-29T10:00", situacao: "Cancelada", descricaoTipo: "Audiência Pública",
      descricao: "Debate", orgaos: [{ sigla: "CSAUDE", nome: "Comissão de Saúde", codTipoOrgao: 2 }], localExterno: "Recife",
    });
    expect(e).toMatchObject({ ambito: "comissao", status: "cancelada", deliberativa: false, local: "Recife", orgaoSigla: "CSAUDE" });
  });

  test("Senado sessão plenária com matérias", () => {
    const e = fromSenadoSessao({
      Data: "2026-10-28", Hora: "16:00", CodigoSessao: "590100", TipoSessao: "SESSÃO DELIBERATIVA EXTRAORDINÁRIA ",
      NumeroSessao: "138ª SESSÃO ", LocalSessao: "Plenário do Senado Federal", SituacaoSessao: "Agendada", Casa: "SF",
      Materias: { Materia: { CodigoMateria: "174386", DescricaoIdentificacaoMateria: "PEC 221/2019", Ementa: "Reduz jornada",
        Apreciacao: "Primeira sessão de discussão", Parecer: "Relator: Senador Omar Aziz" } },
    });
    expect(e).toMatchObject({
      id: "senado-590100", casa: "senado", ambito: "plenario", dia: "2026-10-28", hora: "16:00",
      deliberativa: true, status: "agendada", titulo: "138ª Sessão Deliberativa Extraordinária",
    });
    expect(e.materias).toEqual([{ id: "174386", sigla: "PEC 221/2019", ementa: "Reduz jornada", apreciacao: "Primeira sessão de discussão",
      relator: "Relator: Senador Omar Aziz", href: "https://www25.senado.leg.br/web/atividade/materias/-/materia/174386" }]);
  });

  test("Senado reunião de comissão", () => {
    const e = fromSenadoReuniao({
      codigo: "14997", titulo: "2ª Reunião", dataInicio: "2026-10-29T10:00:00.000", situacao: "Realizada", realizada: "true",
      colegiadoCriador: { sigla: "CAE", nome: "Comissão de Assuntos Econômicos" }, local: "Ala Nilo Coelho",
      urlUltimaPautaSimplesPublicada: "https://x/pauta", partes: { descricaoTipo: "Deliberativa", isDeliberativa: "true", evento: { finalidade: "Votar PL" } },
    });
    expect(e).toMatchObject({ id: "senado-r14997", ambito: "comissao", dia: "2026-10-29", hora: "10:00", status: "encerrada",
      deliberativa: true, orgaoSigla: "CAE", pautaUrl: "https://x/pauta", descricao: "Votar PL" });
  });
});

describe("ICS", () => {
  const ev: AgendaEvento = {
    id: "camara-1", casa: "camara", ambito: "plenario", titulo: "Sessão; Deliberativa, extra", descricao: "Linha1\nLinha2",
    orgao: "Plenário", orgaoSigla: "PLEN", dia: "2026-10-27", hora: "14:00", inicio: "2026-10-27T14:00",
    status: "agendada", deliberativa: true, local: "Brasília", fonte: "https://camara.leg.br/evento/1", materias: [],
  };
  test("gera VEVENT com UTC, escape e fim padrão de 2h", () => {
    const ics = toICS(ev, new Date("2026-10-01T00:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261027T170000Z\r\n");
    expect(ics).toContain("DTEND:20261027T190000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261001T000000Z\r\n");
    expect(ics).toContain("SUMMARY:[Câmara] Sessão\; Deliberativa\\, extra\r\n");
    expect(ics).toContain("UID:camara-1@emenda.pl\r\n");
    expect(ics).toContain("URL:https://camara.leg.br/evento/1\r\n");
    expect(ics).toContain("Linha1\\nLinha2");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    for (const l of ics.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });
  test("usa fim real quando existe", () => {
    expect(toICS({ ...ev, fim: "2026-10-27T22:07" })).toContain("DTEND:20261028T010700Z");
  });
  test("nome de arquivo", () => expect(icsFilename(ev)).toBe("camara-plenario-2026-10-27.ics"));
});
