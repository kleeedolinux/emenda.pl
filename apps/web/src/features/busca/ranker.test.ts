import { describe, expect, test } from "bun:test";
import { detectarLei, filtrosDaUrl, filtrosParaUrl, hrefLei, lerRecentes, normalizar, rankear, salvarRecente, type ItemBusca } from "./ranker";
import { destacar, agrupar } from "./ranker";

const it = (id: string, tipo: ItemBusca["tipo"], titulo: string, peso = 0, extra = ""): ItemBusca => ({ id, tipo, titulo, href: `/${id}`, peso, extra });

const ITENS: ItemBusca[] = [
  it("m1", "cidade", "São Paulo", 50, "SP"),
  it("m2", "cidade", "São Paulo do Potengi", 1, "RN"),
  it("m3", "cidade", "Iraquara", 1, "BA"),
  it("m4", "cidade", "Paulo Afonso", 5, "BA"),
  it("u1", "estado", "São Paulo", 60, "SP"),
  it("d1", "deputado", "Tabata Amaral", 10, "PSB SP"),
  it("d2", "deputado", "Nikolas Ferreira", 10, "PL MG"),
  it("s1", "senador", "Otto Alencar", 10, "PSD BA"),
  it("p1", "partido", "PL", 0, "Partido Liberal"),
];

describe("normalizar", () => {
  test("sem acento, minúsculas, pontuação vira espaço", () => {
    expect(normalizar("  São-Paulo D'Oeste!! ")).toBe("sao paulo d oeste");
  });
});

describe("rankear", () => {
  test("ignora acento e caixa", () => {
    expect(rankear(ITENS, "iraquára").map((x) => x.id)).toEqual(["m3"]);
  });
  test("exato vem antes de prefixo; peso desempata", () => {
    const r = rankear(ITENS, "sao paulo").map((x) => x.id);
    expect(r.slice(0, 2)).toEqual(["u1", "m1"]);
    expect(r).toContain("m2");
  });
  test("filtra por modo", () => {
    expect(rankear(ITENS, "sao paulo", { tipos: ["cidade"] }).map((x) => x.id)).toEqual(["m1", "m2"]);
  });
  test("prefixo de palavra no meio do nome", () => {
    expect(rankear(ITENS, "amaral").map((x) => x.id)).toEqual(["d1"]);
  });
  test("tolera um erro de digitação em palavras longas", () => {
    expect(rankear(ITENS, "nicolas").map((x) => x.id)).toEqual(["d2"]);
    expect(rankear(ITENS, "iraqura").map((x) => x.id)).toEqual(["m3"]);
  });
  test("campo extra (UF/partido) ajuda mas não domina", () => {
    expect(rankear(ITENS, "paulo ba").map((x) => x.id)).toEqual(["m4"]);
  });
  test("consulta vazia -> nada; limite respeitado", () => {
    expect(rankear(ITENS, "  ")).toEqual([]);
    expect(rankear(ITENS, "a", { limite: 2 }).length).toBeLessThanOrEqual(2);
  });
  test("sigla curta casa exato", () => {
    expect(rankear(ITENS, "pl", { tipos: ["partido"] }).map((x) => x.id)).toEqual(["p1"]);
  });
});

describe("filtro encadeado por estado", () => {
  const deps: ItemBusca[] = [
    { ...it("d10", "deputado", "Nikolas Ferreira", 10, "PL MG"), uf: "MG" },
    { ...it("d11", "deputado", "Nicoletti", 10, "UNIÃO RR"), uf: "RR" },
    { ...it("d12", "deputado", "Nely Aquino", 10, "PODE MG"), uf: "MG" },
    { ...it("c1", "cidade", "Belo Horizonte", 0, "MG"), uf: "MG" },
    { ...it("c2", "cidade", "Belo Jardim", 0, "PE"), uf: "PE" },
    { ...it("p9", "partido", "PL", 0, "Partido Liberal") },
  ];
  test("Estado=MG + Deputado 'ni' -> só deputados de MG", () => {
    expect(rankear(deps, "ni", { tipos: ["deputado"], uf: "MG" }).map((x) => x.id)).toEqual(["d10"]);
  });
  test("Estado=MG + Cidade 'belo' -> só cidades de MG", () => {
    expect(rankear(deps, "belo", { tipos: ["cidade"], uf: "MG" }).map((x) => x.id)).toEqual(["c1"]);
  });
  test("partido não tem estado: continua aparecendo", () => {
    expect(rankear(deps, "pl", { tipos: ["partido"], uf: "MG" }).map((x) => x.id)).toEqual(["p9"]);
  });
  test("'sao paulo' casa São Paulo sem acento", () => {
    expect(rankear([{ ...it("x", "cidade", "São Paulo", 0, "SP"), uf: "SP" }], "sao paulo", { uf: "SP" }).map((x) => x.id)).toEqual(["x"]);
  });
});

describe("filtros na URL", () => {
  test("ida e volta", () => {
    const f = { q: "nikolas", modo: "deputado" as const, uf: "MG" };
    const s = filtrosParaUrl(f);
    expect(s).toBe("q=nikolas&modo=deputado&uf=MG");
    expect(filtrosDaUrl(new URLSearchParams(s))).toEqual(f);
  });
  test("valores inválidos caem no padrão", () => {
    expect(filtrosDaUrl(new URLSearchParams("modo=xyz&uf=ZZ"))).toEqual({ q: "", modo: "tudo", uf: null });
    expect(filtrosParaUrl({ q: "", modo: "tudo", uf: null })).toBe("");
  });
});

describe("detectarLei", () => {
  test.each([
    ["PL 2630/2020", { sigla: "PL", numero: 2630, ano: 2020 }],
    ["pl 2630 2020", { sigla: "PL", numero: 2630, ano: 2020 }],
    ["PEC nº 45/2019", { sigla: "PEC", numero: 45, ano: 2019 }],
    ["mp 1.185/23", { sigla: "MPV", numero: 1185, ano: 2023 }],
    ["PLP 68", { sigla: "PLP", numero: 68, ano: null }],
  ])("%p", (q, r) => expect(detectarLei(q)).toEqual(r));
  test.each(["São Paulo", "PL", "plano"])("não é lei: %p", (q) => expect(detectarLei(q)).toBeNull());
  test("href", () => {
    expect(hrefLei({ sigla: "PL", numero: 2630, ano: 2020 })).toBe("/proposicoes?tipo=PL&numero=2630&ano=2020");
    expect(hrefLei({ sigla: "PLP", numero: 68, ano: null })).toBe("/proposicoes?tipo=PLP&numero=68");
  });
});

describe("recentes", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  test("mais recente primeiro, sem duplicar, no máximo 6", () => {
    const s = mem();
    for (let i = 0; i < 8; i++) salvarRecente(s, it(`m${i}`, "cidade", `C${i}`));
    salvarRecente(s, it("m3", "cidade", "C3"));
    const r = lerRecentes(s);
    expect(r.length).toBe(6);
    expect(r[0]!.id).toBe("m3");
    expect(new Set(r.map((x) => x.id)).size).toBe(6);
  });
  test("armazenamento quebrado não lança", () => {
    const ruim = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(lerRecentes(ruim)).toEqual([]);
    expect(() => salvarRecente(ruim, it("a", "cidade", "A"))).not.toThrow();
    expect(lerRecentes({ getItem: () => "{lixo", setItem: () => {} })).toEqual([]);
  });
});

describe("destacar (texto que casou em negrito)", () => {
  test.each([
    ["São Paulo", "sao pa", [["São", true], [" ", false], ["Pa", true], ["ulo", false]]],
    ["Nikolas Ferreira", "ferr", [["Nikolas ", false], ["Ferr", true], ["eira", false]]],
    ["Iraquara", "xyz", [["Iraquara", false]]],
  ] as const)("%s / %s", (t, q, r) => expect(destacar(t, q)).toEqual(r.map(([texto, casou]) => ({ texto, casou }))));
});

describe("agrupar (modo Tudo)", () => {
  test("ordem Cidades, Pessoas, Leis, Partidos; mantém a ordem dentro do grupo", () => {
    const it = (id: string, tipo: string) => ({ id, tipo, titulo: id, href: "/" }) as ItemBusca;
    const g = agrupar([it("p", "partido"), it("d", "deputado"), it("c", "cidade"), it("l", "lei"), it("s", "senador"), it("e", "estado")]);
    expect(g.map((x) => [x.grupo, x.itens.map((i) => i.id)])).toEqual([["Cidades e estados", ["c", "e"]], ["Pessoas", ["d", "s"]], ["Leis", ["l"]], ["Partidos", ["p"]]]);
  });
});
