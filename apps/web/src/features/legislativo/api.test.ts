import { describe, expect, test } from "bun:test";
import {
  qs, lastPage, arr, dedupeDeputados, mapSenadores, indexAutores, encontrarAutor, despesasPorTipo, totalDespesas,
  parseFiltrosProposicoes, filtrosToSearch, filtrosToApi, mapSenadorDetalhe, cam, sen, fontes, emendasPorAno,
  centavos, filtrarDeputados,
} from "./api";

describe("qs", () => {
  test("remove vazios, repete arrays, codifica", () =>
    expect(qs("/deputados", { a: 1, b: "", c: undefined, d: ["X", "Y"], e: "á b", f: null, g: [] })).toBe("/deputados?a=1&d=X&d=Y&e=%C3%A1%20b"));
  test("sem params", () => expect(qs("/x", {})).toBe("/x"));
});

describe("lastPage", () => {
  test.each([
    [[{ rel: "last", href: "https://x/deputados?idLegislatura=57&pagina=9&itens=100" }], 9],
    [[{ rel: "self", href: "https://x" }], 1],
    [undefined, 1],
  ])("%#", (l, n) => expect(lastPage(l)).toBe(n));
});

test("arr: objeto único/ausente vira lista", () => {
  expect(arr(undefined)).toEqual([]);
  expect(arr({ a: 1 })).toEqual([{ a: 1 }]);
  expect(arr([1, 2])).toEqual([1, 2]);
});

test("dedupeDeputados mantém o último registro de cada id, ordena por nome", () => {
  const r = dedupeDeputados([
    { id: 2, nome: "Bia", siglaPartido: "PL", siglaUf: "DF", urlFoto: "", idLegislatura: 57, email: null },
    { id: 1, nome: "Ádail", siglaPartido: "REPUBLICANOS", siglaUf: "AM", urlFoto: "", idLegislatura: 57, email: null },
    { id: 1, nome: "Ádail", siglaPartido: "MDB", siglaUf: "AM", urlFoto: "", idLegislatura: 57, email: null },
  ]);
  expect(r.map((d) => [d.id, d.siglaPartido])).toEqual([[1, "MDB"], [2, "PL"]]);
});

test("filtrarDeputados por q (sem acento), uf, partido, sexo", () => {
  const ds = [
    { id: 1, nome: "Ádail Filho", siglaPartido: "MDB", siglaUf: "AM", urlFoto: "", idLegislatura: 57, email: null },
    { id: 2, nome: "Bia Kicis", siglaPartido: "PL", siglaUf: "DF", urlFoto: "", idLegislatura: 57, email: null },
  ];
  expect(filtrarDeputados(ds, { q: "adail" }).map((d) => d.id)).toEqual([1]);
  expect(filtrarDeputados(ds, { uf: "DF" }).map((d) => d.id)).toEqual([2]);
  expect(filtrarDeputados(ds, { partido: "MDB" }).map((d) => d.id)).toEqual([1]);
  expect(filtrarDeputados(ds, { sexo: "F", sexoPorId: new Map([[2, "F"]]) }).map((d) => d.id)).toEqual([2]);
});

describe("cruzamento com autores de emendas", () => {
  const idx = indexAutores([
    { codigo: "10", nome: "ABILIO BRUNINI", chave: "ABILIO BRUNINI", n: 3, pago: 100, empenhado: 200 },
    { codigo: "11", nome: "JOSE DA SILVA", chave: "JOSE DA SILVA", n: 1, pago: 5, empenhado: 5 },
  ]);
  test.each<[string[], string | null]>([
    [["Abílio Brunini"], "10"],
    [["Fulano", "ABILIO JACQUES BRUNINI MOUMER", "abilio brunini"], "10"],
    [["Dep. José da Silva"], "11"],
    [["Ninguém"], null],
    [[""], null],
  ])("%o -> %s", (names, cod) => expect(encontrarAutor(idx, names)?.codigo ?? null).toBe(cod));
});

describe("despesas CEAP", () => {
  const d = [
    { tipoDespesa: "COMBUSTÍVEIS", valorLiquido: 100.5, ano: 2024, mes: 1 },
    { tipoDespesa: "PASSAGEM AÉREA", valorLiquido: 1000, ano: 2024, mes: 2 },
    { tipoDespesa: "COMBUSTÍVEIS", valorLiquido: 0.1, ano: 2024, mes: 3 },
  ];
  test("agrupa em centavos e ordena desc", () =>
    expect(despesasPorTipo(d)).toEqual([{ label: "PASSAGEM AÉREA", value: 100000 }, { label: "COMBUSTÍVEIS", value: 10060 }]));
  test("total", () => expect(totalDespesas(d)).toBe(110060));
  test("centavos arredonda float", () => expect(centavos(0.1 + 0.2)).toBe(30));
});

describe("filtros de proposições (URL <-> API)", () => {
  test("padrão: desde 2022, ordenado por id desc", () => {
    const f = parseFiltrosProposicoes(new URLSearchParams(""));
    expect(f).toMatchObject({ tipos: [], ano: "", desde: "2022-01-01", ordem: "DESC", ordenarPor: "id", pagina: 1 });
    expect(filtrosToApi(f, 50, 2023)).toBe("/proposicoes?ano=2022&ano=2023&ordem=DESC&ordenarPor=id&pagina=1&itens=50");
  });
  test("ida e volta com tipos, ano, palavras-chave, autor, tema", () => {
    const sp = new URLSearchParams("tipo=PL,PEC&ano=2023&q=saúde&autor=Tabata&tema=40&numero=12&pagina=3&ordenarPor=ano&ordem=ASC");
    const f = parseFiltrosProposicoes(sp);
    expect(f.tipos).toEqual(["PL", "PEC"]);
    expect(filtrosToSearch(f).toString()).toBe(new URLSearchParams("tipo=PL,PEC&ano=2023&q=saúde&autor=Tabata&tema=40&numero=12&ordenarPor=ano&ordem=ASC&pagina=3").toString());
    expect(filtrosToApi(f, 20)).toBe(
      "/proposicoes?siglaTipo=PL%2CPEC&numero=12&keywords=sa%C3%BAde&autor=Tabata&codTema=40&ano=2023&ordem=ASC&ordenarPor=ano&pagina=3&itens=20",
    );
  });
  test("ordenarPor inválido cai no padrão", () => expect(parseFiltrosProposicoes(new URLSearchParams("ordenarPor=xx")).ordenarPor).toBe("id"));
});

test("mapSenadores lê lista atual e por legislatura (com mandatos/exercícios)", () => {
  const p = {
    IdentificacaoParlamentar: {
      CodigoParlamentar: "70", NomeParlamentar: "Renan Calheiros", NomeCompletoParlamentar: "José Renan", SexoParlamentar: "Masculino",
      UrlFotoParlamentar: "http://www.senado.leg.br/senadores/img/fotos-oficiais/senador70.jpg", UrlPaginaParlamentar: "http://x", EmailParlamentar: "a@b",
      SiglaPartidoParlamentar: "MDB", UfParlamentar: "AL", Bloco: { NomeBloco: "Bloco X" },
    },
    Mandato: { CodigoMandato: "1", UfParlamentar: "AL", DescricaoParticipacao: "Titular",
      PrimeiraLegislaturaDoMandato: { NumeroLegislatura: "56", DataInicio: "2019-02-01", DataFim: "2023-01-31" },
      SegundaLegislaturaDoMandato: { NumeroLegislatura: "57", DataInicio: "2023-02-01", DataFim: "2027-01-31" } },
  };
  const atual = mapSenadores({ ListaParlamentarEmExercicio: { Parlamentares: { Parlamentar: p } } });
  expect(atual[0]).toMatchObject({ codigo: "70", nome: "Renan Calheiros", sexo: "M", partido: "MDB", uf: "AL", bloco: "Bloco X",
    foto: "https://www.senado.leg.br/senadores/img/fotos-oficiais/senador70.jpg", mandatos: [expect.objectContaining({ CodigoMandato: "1" })] });
  const leg = mapSenadores({ ListaParlamentarLegislatura: { Parlamentares: { Parlamentar: [{ ...p, Mandato: undefined, Mandatos: { Mandato: [p.Mandato] } }] } } });
  expect(leg[0]!.mandatos.length).toBe(1);
});

test("mapSenadorDetalhe", () => {
  const d = mapSenadorDetalhe({ DetalheParlamentar: { Parlamentar: {
    IdentificacaoParlamentar: { CodigoParlamentar: "5672", NomeParlamentar: "Alan Rick", NomeCompletoParlamentar: "Alan Rick Miranda", SexoParlamentar: "Masculino",
      UrlFotoParlamentar: "http://www.senado.leg.br/f.jpg", SiglaPartidoParlamentar: "REPUBLICANOS", UfParlamentar: "AC", EmailParlamentar: "x@y" },
    DadosBasicosParlamentar: { DataNascimento: "1976-10-23", Naturalidade: "Rio Branco", UfNaturalidade: "AC", EnderecoParlamentar: "Anexo 2" },
    Telefones: { Telefone: { NumeroTelefone: "33036333" } },
  } } });
  expect(d).toMatchObject({ codigo: "5672", nascimento: "1976-10-23", naturalidade: "Rio Branco/AC", telefones: ["(61) 3303-6333"], foto: "https://www.senado.leg.br/f.jpg" });
});

test("emendasPorAno soma pago por ano dentro da janela", () => {
  const e = [{ ano: 2022, pago: 10 }, { ano: 2023, pago: 5 }, { ano: 2024, pago: 7 }];
  expect(emendasPorAno(e as never, { inicio: "2023-02-01", fim: "2027-01-31" }).map((x) => x.ano)).toEqual([2023, 2024]);
});

test("paths e fontes apontam para o upstream real", () => {
  expect(cam.deputado(10)).toBe("/deputados/10");
  expect(sen.processoBusca("PL", 914, 2024)).toBe("/processo?sigla=PL&numero=914&ano=2024");
  const f = fontes.proposicao(2196833);
  expect(f.map((x) => x.href)).toEqual([
    "https://dadosabertos.camara.leg.br/api/v2/proposicoes/2196833",
    "https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2196833",
  ]);
  expect(fontes.materiaSenado(158930)[0]!.href).toBe("https://www25.senado.leg.br/web/atividade/materias/-/materia/158930");
  expect(fontes.camaraApi("/deputados?a=1")).toBe("https://dadosabertos.camara.leg.br/api/v2/deputados?a=1");
  expect(fontes.senadoApi("/senador/70")).toBe("https://legis.senado.leg.br/dadosabertos/senador/70");
});

describe("proposições: a Câmara recusa intervalos de datas > 3 meses", () => {
  const span = (path: string) => {
    const u = new URLSearchParams(path.split("?")[1] ?? "");
    const ini = u.get("dataApresentacaoInicio");
    const fim = u.get("dataApresentacaoFim");
    if (!ini && !fim) return 0;
    const a = Date.parse(ini ?? "1900-01-01");
    const b = fim ? Date.parse(fim) : Date.now();
    return (b - a) / 86_400_000;
  };
  const casos: Array<[string, string]> = [
    ["autor por mandato", cam.proposicoesAutor(204554, 1, "2019-02-01", "2023-01-31")],
    ["autor sem período", cam.proposicoesAutor(204554)],
    ["contagem do autor", cam.proposicoesAutor(204554, 1, "2023-02-01", "2027-01-31", 1)],
    ["busca padrão", filtrosToApi(parseFiltrosProposicoes(new URLSearchParams()), 50, 2026)],
    ["busca desde", filtrosToApi(parseFiltrosProposicoes(new URLSearchParams("desde=2024-05-10")), 50, 2026)],
  ];
  test.each(casos)("%s não emite intervalo > 92 dias", (_, p) => expect(span(p)).toBeLessThanOrEqual(92));
  test("mandato vira lista de anos", () =>
    expect(cam.proposicoesAutor(204554, 2, "2019-02-01", "2023-01-31", 50, 2026)).toBe(
      "/proposicoes?idDeputadoAutor=204554&ano=2019&ano=2020&ano=2021&ano=2022&ano=2023&ordem=DESC&ordenarPor=id&pagina=2&itens=50"));
  test("anos não passam do ano corrente", () =>
    expect(cam.proposicoesAutor(1, 1, "2023-02-01", "2027-01-31", 1, 2025)).toBe(
      "/proposicoes?idDeputadoAutor=1&ano=2023&ano=2024&ano=2025&ordem=DESC&ordenarPor=id&pagina=1&itens=1"));
  test("busca padrão usa anos desde DESDE_PADRAO", () =>
    expect(filtrosToApi(parseFiltrosProposicoes(new URLSearchParams()), 50, 2024)).toBe(
      "/proposicoes?ano=2022&ano=2023&ano=2024&ordem=DESC&ordenarPor=id&pagina=1&itens=50"));
});
