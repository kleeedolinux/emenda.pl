import { expect, test } from "bun:test";
import { gastosPath } from "./index";

test("gastosPath é estável (contrato de URL)", () => {
  expect(gastosPath.parlamentar("deputado", 204379)).toBe("/data/v1/gastos/deputado/204379.json");
  expect(gastosPath.parlamentar("senador", "5672")).toBe("/data/v1/gastos/senador/5672.json");
  expect(gastosPath.ranking()).toBe("/data/v1/gastos/ranking.json");
});
