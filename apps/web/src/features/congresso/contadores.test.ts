import { describe, expect, test } from "bun:test";
import { custoCotaAno, estimativaArrecadacao, rotuloTributo, type Arrecadacao } from "./contadores";

const A: Arrecadacao = {
  fonte: "x", ate: "2026-09",
  meses: [
    ...Array.from({ length: 3 }, (_, i) => ({ mes: `2025-${String(10 + i)}`, valor: 1200 })),
    ...Array.from({ length: 9 }, (_, i) => ({ mes: `2026-0${i + 1}`, valor: 1200 })),
  ],
  anos: [{ ano: 2025, valor: 3600, meses: 3 }, { ano: 2026, valor: 10800, meses: 9 }], tributos: [], ufs: [],
};
const MES = 30.4375 * 86400;

describe("arrecadação estimada", () => {
  test("base oficial do ano + ritmo médio dos últimos 12 meses desde o fim do último mês publicado", () => {
    const agora = new Date("2026-10-01T03:00:00Z").getTime() + 1000 * 1000; // 1000 s após 1/10 (Brasília)
    const e = estimativaArrecadacao(A, agora)!;
    expect(e.ano).toBe(2026);
    expect(e.oficial).toBe(10800);
    expect(e.porSegundo).toBeCloseTo(1200 / MES, 10);
    expect(e.valor).toBeCloseTo(10800 + (1200 / MES) * 1000, 6);
    expect(e.ate).toBe("2026-09");
  });
  test("virada de ano sem mês publicado: base zero desde 1º de janeiro", () => {
    const agora = new Date("2027-01-01T03:00:00Z").getTime() + 10_000;
    const e = estimativaArrecadacao({ ...A, ate: "2026-12", meses: A.meses }, agora)!;
    expect(e.ano).toBe(2027);
    expect(e.oficial).toBe(0);
    expect(e.valor).toBeCloseTo((1200 / MES) * 10, 6);
  });
  test("sem dados", () => {
    expect(estimativaArrecadacao({ ...A, meses: [] }, Date.now())).toBeNull();
  });
});

test("cota do ano: total e ritmo por segundo até o fim do mês com dados", () => {
  const c = custoCotaAno(
    [{ casa: "camara", id: "1", nome: "", partido: null, uf: null, emExercicio: true, mandato: 0, porAno: { "2026": 1000 } },
     { casa: "senado", id: "1", nome: "", partido: null, uf: null, emExercicio: false, mandato: 0, porAno: { "2026": 500, "2025": 7 } }],
    2026, "2026-01",
  );
  expect(c.total).toBe(1500);
  expect(c.porSegundo).toBeCloseTo(1500 / (31 * 86400), 10);
});

test.each([
  ["IRRF - RENDIMENTOS DO TRABALHO", "IR retido na fonte (trabalho)"],
  ["RECEITA PREVIDENCIÁRIA", "Contribuição previdenciária (INSS)"],
  ["COFINS - DEMAIS", "Cofins (demais)"],
  ["IMPOSTO TERRITORIAL RURAL", "Imposto territorial rural"],
])("rótulo %s", (a, b) => expect(rotuloTributo(a)).toBe(b));
