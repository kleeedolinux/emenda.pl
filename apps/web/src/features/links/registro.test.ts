import { describe, expect, test } from "bun:test";
import { autolink, chaveMunicipio, escolher, registrarMatcher, MATCHERS, type LinkCtx, type Matcher } from "./registro";

type Row = [texto: string, tipo: string, href: string];
const links = (t: string, ctx: LinkCtx = {}): Row[] =>
  autolink(t, ctx).flatMap((s) => (s.entidade ? [[s.texto, s.entidade.tipo, s.entidade.href] as Row] : []));

const P = (tipo: string, n: number, ano: number) => `/proposicoes?tipo=${tipo}&numero=${n}&ano=${ano}`;
const PLANALTO = "https://www.planalto.gov.br/ccivil_03";

describe("autolink: textos reais da Câmara (tramitação / ementas)", () => {
  test.each<[string, Row[], LinkCtx?]>([
    [
      "Apresentação do PL n. 4159/2025 (Projeto de Lei), pelo Deputado Luiz Couto (PT/PB -Fdr PT-PCdoB-PV), que \"Inscreve o nome de Padre Inácio de Sousa Rolim\".",
      [["PL n. 4159/2025", "proposicao", P("PL", 4159, 2025)], ["PT", "partido", "/partido/PT"], ["PB", "uf", "/uf/PB"], ["Fdr PT-PCdoB-PV", "federacao", "/federacao/brasil-da-esperanca"]],
    ],
    [
      "Às Comissões de Cultura e Constituição e Justiça e de Cidadania (Art. 54 RICD)Proposição Sujeita à Apreciação Conclusiva",
      [["Constituição e Justiça e de Cidadania", "comissao", "/comissao/camara-2003"]],
    ],
    [
      "Designada Relatora, Dep. Benedita da Silva (PT-RJ).",
      [["Benedita da Silva", "deputado", "/deputado/74161"], ["PT", "partido", "/partido/PT"], ["RJ", "uf", "/uf/RJ"]],
      { nomes: [{ nome: "Benedita da Silva", href: "/deputado/74161" }] },
    ],
    [
      "Aprovados os dispositivos do Substitutivo do Senado Federal ao Projeto de Lei Complementar nº 68, de 2024, com parecer pela aprovação. Sim: 324; Não: 123.",
      [["Projeto de Lei Complementar nº 68, de 2024", "proposicao", P("PLP", 68, 2024)]],
    ],
    [
      "Transformado na Lei Complementar 214/2025. DOU 16/01/2025 PÁG 01 COL 01 - Ed. Extra B. Vetado parcialmente. (MSC-PE 88/25).",
      [["Lei Complementar 214/2025", "lei", `${PLANALTO}/leis/lcp/lcp214.htm`]],
    ],
    [
      "Inadmitido o DTQ 18 (PL): Destaque para Votação em Separado da expressão, apresentado ao PLP 68/2024 (161, I).",
      [["PL", "partido", "/partido/PL"], ["PLP 68/2024", "proposicao", P("PLP", 68, 2024)]],
    ],
    [
      "Encaminharam a Votação da Matéria: Dep. Luiz Carlos Hauly (PODE-PR), Dep. Adriana Ventura (NOVO-SP), Dep. Chico Alencar (PSOL-RJ).",
      [["PODE", "partido", "/partido/PODE"], ["PR", "uf", "/uf/PR"], ["NOVO", "partido", "/partido/NOVO"], ["SP", "uf", "/uf/SP"], ["PSOL", "partido", "/partido/PSOL"], ["RJ", "uf", "/uf/RJ"]],
    ],
    ["Recebimento pela CCJC.", [["CCJC", "comissao", "/comissao/camara-2003"]]],
    ["Apresentação do PRL n. 1 CCULT (Parecer do Relator).", [["CCULT", "comissao", "/comissao/camara-536996"]]],
    ["Recebimento pela CE.", [["CE", "comissao", "/comissao/camara-2009"]]],
    ["Dep. Fulano (PSD-CE)", [["PSD", "partido", "/partido/PSD"], ["CE", "uf", "/uf/CE"]]],
    ["Parecer da Comissão de Finanças e Tributação (Mérito e Art. 54, RICD)", [["Comissão de Finanças e Tributação", "comissao", "/comissao/camara-2010"]]],
    ["Ofício nº 650/2024/PS-GSE, que encaminha a Mensagem nº 58/2024-SGM-P", []],
    ["Recebido Ofício nº 179/2025 do Congresso Nacional), que comunica a Rejeição de Veto a Projeto de Lei (PLP 68-2024).", []],
    ["A matéria vai à sanção (PLP 68-D/2024).", [["PLP 68-D/2024", "proposicao", P("PLP", 68, 2024)]]],
  ])("%s", (...[t, exp, ctx]) => expect(links(t, ctx)).toEqual(exp));
});

describe("autolink: proposições", () => {
  test.each<[string, Row[]]>([
    ["PL 2630/2020", [["PL 2630/2020", "proposicao", P("PL", 2630, 2020)]]],
    ["PEC 45/2019", [["PEC 45/2019", "proposicao", P("PEC", 45, 2019)]]],
    ["MPV 1.185/2023", [["MPV 1.185/2023", "proposicao", P("MPV", 1185, 2023)]]],
    ["a MP 1303/2025", [["MP 1303/2025", "proposicao", P("MPV", 1303, 2025)]]],
    ["PL nº 914, de 2024", [["PL nº 914, de 2024", "proposicao", P("PL", 914, 2024)]]],
    ["Medida Provisória nº 1.303, de 2025", [["Medida Provisória nº 1.303, de 2025", "proposicao", P("MPV", 1303, 2025)]]],
    ["Proposta de Emenda à Constituição nº 66, de 2023", [["Proposta de Emenda à Constituição nº 66, de 2023", "proposicao", P("PEC", 66, 2023)]]],
    ["o PL foi aprovado", []],
    ["PLANO PL", []],
  ])("%s", (t, exp) => expect(links(t)).toEqual(exp));
  test("entidade guarda a chave para resolução preguiçosa", () => {
    const s = autolink("PL 2630/2020").find((x) => x.entidade)!;
    expect(s.entidade!.dados).toEqual({ siglaTipo: "PL", numero: 2630, ano: 2020 });
  });
});

describe("autolink: leis e Constituição", () => {
  test.each<[string, Row[]]>([
    ["Altera a Lei nº 14.208, de 28 de setembro de 2021.", [["Lei nº 14.208, de 28 de setembro de 2021", "lei", `${PLANALTO}/_ato2019-2022/2021/lei/l14208.htm`]]],
    ["Lei 14.701/2023", [["Lei 14.701/2023", "lei", `${PLANALTO}/_ato2023-2026/2023/lei/l14701.htm`]]],
    ["Lei nº 8.666, de 1993", [["Lei nº 8.666, de 1993", "lei", "https://www.lexml.gov.br/urn/urn:lex:br:federal:lei:1993;8666"]]],
    ["Lei Ordinária 14902/2024", [["Lei Ordinária 14902/2024", "lei", `${PLANALTO}/_ato2023-2026/2024/lei/l14902.htm`]]],
    ["Emenda Constitucional nº 86", [["Emenda Constitucional nº 86", "lei", `${PLANALTO}/constituicao/emendas/emc/emc86.htm`]]],
    ["Decreto-Lei nº 2.848, de 7 de dezembro de 1940", [["Decreto-Lei nº 2.848, de 7 de dezembro de 1940", "lei", "https://www.lexml.gov.br/urn/urn:lex:br:federal:decreto.lei:1940;2848"]]],
    ["nos termos do art. 166-A da Constituição Federal", [["art. 166-A da Constituição Federal", "constituicao", `${PLANALTO}/constituicao/constituicao.htm#art166a`]]],
    ["o art. 5º da Constituição", [["art. 5º da Constituição", "constituicao", `${PLANALTO}/constituicao/constituicao.htm#art5`]]],
    ["arts. 165 a 169 da CF", [["arts. 165 a 169 da CF", "constituicao", `${PLANALTO}/constituicao/constituicao.htm#art165`]]],
    ["Art. 54 RICD", []],
  ])("%s", (t, exp) => expect(links(t)).toEqual(exp));
  test("lei sem ano vai para a busca do LexML", () => {
    expect(links("Lei 8.112")[0]).toEqual(["Lei 8.112", "lei", "https://www.lexml.gov.br/busca/search?keyword=lei%208112"]);
  });
});

describe("autolink: comissões e Casa", () => {
  test.each<[string, LinkCtx, Row[]]>([
    ["pela CMO", {}, [["CMO", "comissao", "/comissao/senado-1664"]]],
    ["na Comissão Mista de Orçamento", {}, [["Comissão Mista de Orçamento", "comissao", "/comissao/senado-1664"]]],
    ["na CAE", {}, [["CAE", "comissao", "/comissao/senado-38"]]],
    ["na CCJ", { casa: "senado" }, [["CCJ", "comissao", "/comissao/senado-34"]]],
    ["na CCJ", { casa: "camara" }, [["CCJ", "comissao", "/comissao/camara-2003"]]],
    ["na CE", { casa: "senado" }, [["CE", "comissao", "/comissao/senado-47"]]],
    ["Comissão de Constituição e Justiça", { casa: "senado" }, [["Comissão de Constituição e Justiça", "comissao", "/comissao/senado-34"]]],
    ["Comissão de Constituição e Justiça", { casa: "camara" }, [["Comissão de Constituição e Justiça", "comissao", "/comissao/camara-2003"]]],
    ["Comissão de Constituição e Justiça e de Cidadania", {}, [["Comissão de Constituição e Justiça e de Cidadania", "comissao", "/comissao/camara-2003"]]],
    ["CI nº 12", {}, []],
    ["na CI", { casa: "senado" }, [["CI", "comissao", "/comissao/senado-59"]]],
    ["CEP 70160-900", {}, []],
  ])("%s (%o)", (t, ctx, exp) => expect(links(t, ctx)).toEqual(exp));
});

describe("autolink: geografia", () => {
  const municipios = new Map([[chaveMunicipio("Iraquara", "BA"), 2914307], [chaveMunicipio("São José dos Campos", "SP"), 3549904], [chaveMunicipio("Embu-Guaçu", "SP"), 3515103]]);
  test.each<[string, LinkCtx, Row[]]>([
    ["obra em Iraquara/BA", { municipios }, [["Iraquara/BA", "municipio", "/municipio/2914307"]]],
    ["Prefeitura de Iraquara/BA", { municipios }, [["Iraquara/BA", "municipio", "/municipio/2914307"]]],
    ["São José dos Campos/SP e Embu-Guaçu/SP", { municipios }, [["São José dos Campos/SP", "municipio", "/municipio/3549904"], ["Embu-Guaçu/SP", "municipio", "/municipio/3515103"]]],
    ["Iraquara/BA", {}, []],
    ["Cidade Inventada/BA", { municipios }, []],
    ["no Estado de São Paulo", {}, [["Estado de São Paulo", "uf", "/uf/SP"]]],
    ["na Bahia e no Rio Grande do Sul", {}, [["Bahia", "uf", "/uf/BA"], ["Rio Grande do Sul", "uf", "/uf/RS"]]],
    ["São Paulo", {}, []],
    ["Mato Grosso do Sul", {}, [["Mato Grosso do Sul", "uf", "/uf/MS"]]],
    ["emendas do (SP)", {}, [["SP", "uf", "/uf/SP"]]],
  ])("%s", (t, ctx, exp) => expect(links(t, ctx)).toEqual(exp));
});

describe("autolink: partidos e federações", () => {
  test.each<[string, Row[]]>([
    ["O PT e o PSOL votaram", [["PT", "partido", "/partido/PT"], ["PSOL", "partido", "/partido/PSOL"]]],
    ["UNIÃO e PP", [["UNIÃO", "partido", "/partido/UNI%C3%83O"], ["PP", "partido", "/partido/PP"]]],
    ["a Federação Brasil da Esperança", [["Federação Brasil da Esperança", "federacao", "/federacao/brasil-da-esperanca"]]],
    ["Fdr PSOL-REDE", [["Fdr PSOL-REDE", "federacao", "/federacao/psol-rede"]]],
    ["PTB, SPT, PTx", []],
  ])("%s", (t, exp) => expect(links(t)).toEqual(exp));
});

describe("segmentos", () => {
  test("reconstroem o texto original", () => {
    const t = "Às Comissões de Cultura e Constituição e Justiça e de Cidadania (PL 1/2024; Lei 14.701/2023) - Dep. X (PT-SP).";
    expect(autolink(t).map((s) => s.texto).join("")).toBe(t);
  });
  test("texto vazio", () => expect(autolink("")).toEqual([]));
});

describe("escolher (precedência)", () => {
  const m = (inicio: number, fim: number, prioridade: number, tipo = "x") => ({ inicio, fim, prioridade, entidade: { tipo, href: "/", titulo: tipo } });
  test.each([
    ["mais à esquerda vence", [m(5, 9, 1, "b"), m(0, 6, 1, "a")], ["a"]],
    ["mesmo início: mais longo vence", [m(0, 3, 9, "curto"), m(0, 8, 1, "longo")], ["longo"]],
    ["mesmo trecho: maior prioridade", [m(0, 4, 1, "baixa"), m(0, 4, 5, "alta")], ["alta"]],
    ["sem sobreposição: todos", [m(0, 2, 1, "a"), m(3, 5, 1, "b")], ["a", "b"]],
  ] as const)("%s", (_, ms, exp) => expect(escolher([...ms]).map((x) => x.entidade.tipo)).toEqual([...exp]));
});

describe("registro extensível", () => {
  test("outro módulo registra um tipo", () => {
    const frente: Matcher = {
      tipo: "frente", prioridade: 10,
      encontrar: (t) => [...t.matchAll(/Frente Parlamentar Evangélica/g)].map((x) => ({ inicio: x.index!, fim: x.index! + x[0].length, entidade: { tipo: "frente", href: "/bancada/fpe", titulo: x[0] } })),
    };
    const antes = MATCHERS.length;
    const desfaz = registrarMatcher(frente);
    expect(links("a Frente Parlamentar Evangélica e o PT")).toEqual([["Frente Parlamentar Evangélica", "frente", "/bancada/fpe"], ["PT", "partido", "/partido/PT"]]);
    desfaz();
    expect(MATCHERS.length).toBe(antes);
  });
});
