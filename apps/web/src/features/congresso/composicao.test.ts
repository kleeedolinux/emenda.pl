import { describe, expect, test } from "bun:test";
import {
  assentos, contar, deputadoMembro, faixaEtaria, faixasTempo, filtrarMembros, genero, idade, novatos, senadorMembro, type Membro,
} from "./composicao";

const m = (id: string, partido: string, uf = "SP", sexo: Membro["sexo"] = "M", casa: Membro["casa"] = "camara"): Membro =>
  ({ casa, id, nome: `N${id}`, partido, uf, foto: "", sexo, href: casa === "camara" ? `/deputado/${id}` : `/senador/${id}` });

describe("membros", () => {
  test("deputado e senador viram a mesma forma", () => {
    expect(deputadoMembro({ id: 1, nome: "A", siglaPartido: "PT", siglaUf: "BA", urlFoto: "f", idLegislatura: 57, email: null }, "F"))
      .toEqual({ casa: "camara", id: "1", nome: "A", partido: "PT", uf: "BA", foto: "f", sexo: "F", href: "/deputado/1" });
    expect(senadorMembro({ codigo: "9", nome: "B", nomeCompleto: "B", sexo: "M", foto: "g", pagina: "", email: "", partido: "", uf: "RJ", bloco: "", mandatos: [] }))
      .toEqual({ casa: "senado", id: "9", nome: "B", partido: "S/PART", uf: "RJ", foto: "g", sexo: "M", href: "/senador/9" });
  });

  test("filtra por casa, partido e UF", () => {
    const ms = [m("1", "PT"), m("2", "PL", "RJ"), m("3", "PT", "SP", "F", "senado")];
    expect(filtrarMembros(ms, { casa: "camara", partido: "", uf: "", leg: 57 }).map((x) => x.id)).toEqual(["1", "2"]);
    expect(filtrarMembros(ms, { casa: "ambas", partido: "PT", uf: "SP", leg: 57 }).map((x) => x.id)).toEqual(["1", "3"]);
  });
});

describe("hemiciclo", () => {
  const ms = [m("1", "PL"), m("2", "PT"), m("3", "PL"), m("4", "PCdoB")];
  test("por partido: maior bancada primeiro", () => {
    expect(assentos(ms, "partido").map((s) => s.group)).toEqual(["PL", "PL", "PCdoB", "PT"]);
  });
  test("por federação: partidos federados juntos", () => {
    const s = assentos(ms, "federacao");
    expect(s.map((x) => x.group)).toEqual(["Federação Brasil da Esperança", "Federação Brasil da Esperança", "PL", "PL"]);
    expect(s[0]!.label).toBe("N4 (PCdoB-SP)");
  });
});

describe("contagens", () => {
  test("contar ordena por valor e nome", () => {
    expect(contar([m("1", "B"), m("2", "A"), m("3", "B")], (x) => x.partido)).toEqual([{ label: "B", value: 2 }, { label: "A", value: 1 }]);
  });
  test("gênero", () => {
    expect(genero([m("1", "A", "SP", "F"), m("2", "A"), m("3", "A"), m("4", "A", "SP", "")])).toEqual({ mulheres: 1, homens: 2, semInfo: 1, pctMulheres: 1 / 3 });
  });
  test("novatos: quem não estava na legislatura anterior", () => {
    expect(novatos(["1", "2", "3"], new Set(["2"]))).toEqual({ novatos: 2, veteranos: 1 });
  });
  test.each([
    [0, "Até 4 anos"], [4 * 365, "Até 4 anos"], [5 * 365, "4 a 8 anos"], [10 * 365, "8 a 16 anos"], [20 * 365, "Mais de 16 anos"],
  ])("faixa de tempo %i dias", (d, rot) => {
    expect(faixasTempo([d]).find((f) => f.value === 1)?.label as string).toBe(rot);
  });
  test("idade e faixa etária", () => {
    expect(idade("1980-10-29", "2026-10-28")).toBe(45);
    expect(idade("1980-10-28", "2026-10-28")).toBe(46);
    expect(idade(null, "2026-10-28")).toBeNull();
    expect(faixaEtaria(29)).toBe("Até 30");
    expect(faixaEtaria(45)).toBe("41 a 50");
    expect(faixaEtaria(71)).toBe("Mais de 70");
  });
});
