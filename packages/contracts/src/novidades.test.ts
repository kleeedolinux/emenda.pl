import { expect, test } from "bun:test";
import { novidadesPath, TIPOS_NOVIDADE, ALTA_RELEVANCIA } from "./index";

test("novidadesPath é estável (contrato de URL)", () => {
  expect(novidadesPath.recentes()).toBe("/data/v1/novidades.json");
  expect(novidadesPath.mes(202609)).toBe("/data/v1/novidades/202609.json");
});

test("tipos de novidade espelham o enum do ETL", () => {
  expect(Object.keys(TIPOS_NOVIDADE).sort()).toEqual(
    ["agenda", "gastos", "lei", "pagamentos", "partido", "pix", "proposicao", "urgencia", "votacao"],
  );
  expect(ALTA_RELEVANCIA).toBe(70);
});
