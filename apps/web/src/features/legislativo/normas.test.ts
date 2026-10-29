import { describe, expect, test } from "bun:test";
import { presidenteNaData, parseNormaGerada, linksNorma, desfecho, normaDaTramitacao, statusLeigo } from "./normas";

describe("presidenteNaData", () => {
  test.each([
    ["2024-06-27", "Luiz Inácio Lula da Silva"],
    ["2023-01-01", "Luiz Inácio Lula da Silva"],
    ["2022-12-31", "Jair Bolsonaro"],
    ["2019-01-01", "Jair Bolsonaro"],
    ["2018-12-31", "Michel Temer"],
    ["2016-08-31", "Michel Temer"],
    ["2016-05-11", "Dilma Rousseff"],
    ["2011-01-01", "Dilma Rousseff"],
    ["2010-12-31", "Luiz Inácio Lula da Silva"],
    ["2003-01-01", "Luiz Inácio Lula da Silva"],
    ["1995-01-01", "Fernando Henrique Cardoso"],
  ])("%s -> %s", (d, nome) => expect(presidenteNaData(d)?.nome).toBe(nome));
  test("Temer interino entre 12/05 e 30/08/2016", () => expect(presidenteNaData("2016-06-01")?.interino).toBe(true));
  test("antes da cobertura -> null", () => expect(presidenteNaData("1980-01-01")).toBeNull());
});

describe("parseNormaGerada", () => {
  test.each([
    ["Lei nº 14.902 de 27/06/2024", { tipo: "lei", rotulo: "Lei", numero: 14902, data: "2024-06-27" }],
    ["Emenda Constitucional nº 132 de 20/12/2023", { tipo: "emenda.constitucional", rotulo: "Emenda Constitucional", numero: 132, data: "2023-12-20" }],
    ["Lei Complementar nº 200 de 30/08/2023", { tipo: "lei.complementar", rotulo: "Lei Complementar", numero: 200, data: "2023-08-30" }],
    ["Decreto Legislativo nº 5 de 01/02/2024", { tipo: "decreto.legislativo", rotulo: "Decreto Legislativo", numero: 5, data: "2024-02-01" }],
  ] as [string, unknown][])("%s", (s, o) => expect(parseNormaGerada(s)).toEqual(o as never));
  test("inválido -> null", () => expect(parseNormaGerada("")).toBeNull());
});

describe("linksNorma", () => {
  test("lei ordinária", () => {
    const l = linksNorma({ tipo: "lei", rotulo: "Lei", numero: 14902, data: "2024-06-27" });
    expect(l.lexml).toBe("https://www.lexml.gov.br/urn/urn:lex:br:federal:lei:2024-06-27;14902");
    expect(l.normas).toBe("https://normas.leg.br/?urn=urn:lex:br:federal:lei:2024-06-27;14902");
    expect(l.planalto).toBe("https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14902.htm");
  });
  test("lei 2019-2022 e LC e EC", () => {
    expect(linksNorma({ tipo: "lei", rotulo: "Lei", numero: 14133, data: "2021-04-01" }).planalto)
      .toBe("https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm");
    expect(linksNorma({ tipo: "lei.complementar", rotulo: "Lei Complementar", numero: 200, data: "2023-08-30" }).planalto)
      .toBe("https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp200.htm");
    expect(linksNorma({ tipo: "emenda.constitucional", rotulo: "Emenda Constitucional", numero: 132, data: "2023-12-20" }).planalto)
      .toBe("https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc132.htm");
  });
  test("decreto legislativo sem planalto", () =>
    expect(linksNorma({ tipo: "decreto.legislativo", rotulo: "Decreto Legislativo", numero: 5, data: "2024-02-01" }).planalto).toBeNull());
});

describe("desfecho", () => {
  test.each([
    [{ situacaoCamara: "Transformado em Norma Jurídica" }, "lei"],
    [{ situacaoSenado: "TRANSFORMADA EM NORMA JURÍDICA COM VETO PARCIAL" }, "lei"],
    [{ situacaoCamara: "Arquivada" }, "arquivada"],
    [{ situacaoCamara: "Vetado totalmente" }, "vetada"],
    [{ situacaoSenado: "VETADO TOTALMENTE" }, "vetada"],
    [{ situacaoCamara: "Rejeitada" }, "rejeitada"],
    [{ situacaoCamara: "Aguardando Deliberação" }, "tramitando"],
    [{ situacaoCamara: "Transformado em nova proposição" }, "tramitando"],
  ])("%o -> %s", (i, o) => expect(desfecho(i).tipo).toBe(o as never));
  test("veto parcial detectado e sanção atribuída ao presidente (lei)", () => {
    const d = desfecho({ situacaoSenado: "TRANSFORMADA EM NORMA JURÍDICA COM VETO PARCIAL", normaGerada: "Lei nº 14.902 de 27/06/2024" });
    expect(d.veto).toBe("parcial");
    expect(d.norma?.numero).toBe(14902);
    expect(d.presidente?.nome).toBe("Luiz Inácio Lula da Silva");
  });
  test("usa norma da Câmara quando o Senado não informa", () => {
    const d = desfecho({ situacaoCamara: "Transformado em Norma Jurídica", norma: { tipo: "lei", rotulo: "Lei", numero: 14701, data: "2023-10-20" }, veto: "parcial" });
    expect([d.norma?.numero, d.veto, d.presidente?.nome]).toEqual([14701, "parcial", "Luiz Inácio Lula da Silva"]);
  });
  test("EC é promulgada pelo Congresso: sem presidente", () => {
    const d = desfecho({ situacaoSenado: "TRANSFORMADA EM NORMA JURÍDICA", normaGerada: "Emenda Constitucional nº 132 de 20/12/2023" });
    expect(d.presidente).toBeNull();
    expect(d.promulgadaCongresso).toBe(true);
  });
});

describe("normaDaTramitacao (Câmara)", () => {
  const t = (dataHora: string, descricaoTramitacao: string, despacho: string) => ({ dataHora, descricaoTramitacao, despacho });
  test("lei ordinária com veto parcial e veto derrubado depois", () => {
    const r = normaDaTramitacao([
      t("2024-06-18T00:00", "Expedição de Documento", "Remessa dos Autógrafos à sanção"),
      t("2024-06-27T00:00", "Transformado em Norma Jurídica com Veto Parcial", "Transformado na Lei Ordinária 14902/2024. DOU 28/04/24. Vetado parcialmente."),
      t("2025-06-30T00:00", "Apresentação de Proposição", "Recebido Ofício que comunica a Rejeição de Veto a Projeto de Lei (PL 914-2024)."),
    ]);
    expect(r.norma).toEqual({ tipo: "lei", rotulo: "Lei", numero: 14902, data: "2024-06-27" });
    expect(r.veto).toBe("parcial");
    expect(r.vetoDerrubado).toBe(true);
  });
  test.each([
    ["Transformado na Lei Complementar 200/2023.", "lei.complementar", 200],
    ["Transformado na Emenda Constitucional 132/2023.", "emenda.constitucional", 132],
    ["Transformado no Decreto Legislativo 5/2024", "decreto.legislativo", 5],
  ])("%s", (desp, tipo, n) => {
    const r = normaDaTramitacao([t("2023-12-20T00:00", "Transformado em Norma Jurídica", desp)]);
    expect([r.norma?.tipo, r.norma?.numero]).toEqual([tipo as never, n]);
  });
  test("sem norma", () => expect(normaDaTramitacao([t("2023-01-01T00:00", "Apresentação", "x")]).norma).toBeNull());
});

describe("statusLeigo: situação da Câmara em palavras do dia a dia", () => {
  test.each([
    ["Transformado em Norma Jurídica", "Virou lei"],
    ["Arquivada", "Arquivada"],
    ["Pronta para Pauta no Plenário (PLEN)", "Em votação na Câmara"],
    ["Aguardando Deliberação", "Em votação na Câmara"],
    ["Aguardando Designação de Relator", "Parada"],
    ["Aguardando Parecer do Relator na Comissão", "Parada"],
    ["Remetida ao Senado Federal", "No Senado"],
    ["Aguardando Sanção", "Esperando o presidente"],
    [null, "Parada"],
  ])("%s -> %s", (s, o) => expect(statusLeigo(s) as string).toBe(o));
});
