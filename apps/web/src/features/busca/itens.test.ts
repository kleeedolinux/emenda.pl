import { describe, expect, test } from "bun:test";
import type { IndiceBusca } from "@emenda/contracts";
import { itensDoIndice, itensLeis } from "./itens";
import { PAUTAS } from "@/features/legislativo/pautas";
import { rankear } from "./ranker";

const idx: IndiceBusca = {
  v: 1, geradoEm: "x",
  cidades: [[3550308, "São Paulo", "SP", 14_230_000_000], [2914406, "Iraquara", "BA", 260_350_000]],
  deputados: [[209787, "Nikolas Ferreira", "PL", "MG", 100]],
  senadores: [["3795", "Otto Alencar", "PSD", "BA", 900]],
  partidos: [["PL", "Partido Liberal"]],
  autores: [["8100", "RELATOR GERAL", 70]],
  prefeitos: [[2914406, "NINO COUTINHO", "PSD"]],
};

describe("itensDoIndice", () => {
  const itens = itensDoIndice(idx);
  test("cidade com UF, valor e link", () => {
    const c = itens.find((x) => x.id === "m:2914406")!;
    expect(c).toMatchObject({ tipo: "cidade", titulo: "Iraquara", uf: "BA", valor: 260_350_000, href: "/municipio/2914406" });
  });
  test("deputado com foto oficial, partido e UF", () => {
    const d = itens.find((x) => x.tipo === "deputado")!;
    expect(d).toMatchObject({ href: "/deputado/209787", uf: "MG", selo: "PL", img: "https://www.camara.leg.br/internet/deputado/bandep/209787.jpg" });
  });
  test("27 estados com bandeira", () => {
    const e = itens.filter((x) => x.tipo === "estado");
    expect(e.length).toBe(27);
    expect(e.every((x) => x.img && x.uf)).toBe(true);
  });
  test("'sao paulo' acha a cidade e o estado; autor do orçamento secreto rotulado", () => {
    expect(rankear(itens, "sao paulo").map((x) => x.id)).toEqual(["uf:SP", "m:3550308"]);
    expect(itens.find((x) => x.id === "a:8100")?.sub).toBe("Orçamento secreto");
  });
});

describe("prefeitos e leis", () => {
  const itens = [...itensDoIndice(idx), ...itensLeis(PAUTAS)];
  test("nome do prefeito acha a cidade", () => {
    const r = rankear(itens, "nino coutinho")[0]!;
    expect(r).toMatchObject({ tipo: "prefeito", href: "/municipio/2914406", uf: "BA" });
    expect(r.sub).toContain("Iraquara");
  });
  test.each(["2630", "PL 2630", "fake news"])("%s -> PL 2630/2020 primeiro", (q) => {
    expect(rankear(itens, q)[0]).toMatchObject({ tipo: "lei", titulo: "PL 2630/2020" });
  });
  test("PEC 45 -> reforma tributária", () => expect(rankear(itens, "PEC 45")[0]?.sub).toContain("Reforma tributária"));
  test("reforma tributaria (sem acento) acha a PEC 45", () => expect(rankear(itens, "reforma tributaria").map((x) => x.titulo)).toContain("PEC 45/2019"));
});
