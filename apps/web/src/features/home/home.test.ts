import { describe, expect, test } from "bun:test";
import type { AutorResumo, Brasil, Rankings } from "@emenda/contracts";
import { fatosDoDia, lerLocal, salvarLocal } from "./home";

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe("lugar do visitante (localStorage)", () => {
  test("salva e lê a última cidade visitada", () => {
    const s = mem();
    salvarLocal(s, { tipo: "municipio", id: "2914406", nome: "Iraquara", uf: "BA" });
    expect(lerLocal(s)).toEqual({ tipo: "municipio", id: "2914406", nome: "Iraquara", uf: "BA" });
  });
  test.each([["lixo"], ['{"tipo":"x"}'], [null]])("valor inválido %p -> null", (v) => {
    const s = mem(); if (v) s.setItem("emenda:local", v);
    expect(lerLocal(s)).toBeNull();
  });
  test("sem storage -> null", () => expect(lerLocal(null)).toBeNull());
});

const brasil = {
  totais: { pago: 1_000_00 },
  porTipo: [{ tipo: "pix", pago: 300_00 }, { tipo: "relator", pago: 200_00 }, { tipo: "individual", pago: 500_00 }],
  porUf: [{ uf: "BA", nome: "Bahia", pago: 600_00 }, { uf: "SP", nome: "São Paulo", pago: 400_00 }],
} as unknown as Brasil;
const rankings = {
  janelas: [{ janela: "1m", desde: 202610, ate: 202610, valor: 48_000_000_00, pagamentos: 10,
    tipos: [{ tipo: "pix", valor: 15_000_000_00, pagamentos: 1 }, { tipo: "bancada", valor: 33_000_000_00, pagamentos: 1 }],
    autores: [{ codigo: "6011", nome: "COM. DESENV REGIONAL E TURISMO", chave: "C", valor: 9, pagamentos: 1 }, { codigo: "1", nome: "NIKOLAS FERREIRA", chave: "NIKOLAS FERREIRA", valor: 5_000_000_00, pagamentos: 1 }],
    ufs: [], municipios: [{ ibge: "5300108", nome: "Brasília", uf: "DF", valor: 7_000_000_00, pagamentos: 1 }] }],
} as unknown as Rankings;
const autores = [{ codigo: "1", nome: "NIKOLAS FERREIRA", chave: "NIKOLAS FERREIRA", n: 1, pago: 9, empenhado: 0 }] as AutorResumo[];

describe("fatosDoDia", () => {
  const f = fatosDoDia({ brasil, rankings, autores });
  test("último mês: quanto foi pago e quanto sem dizer para quê", () => {
    expect(f[0]).toMatchObject({ id: "mes", numero: 48_000_000_00, href: "/ultimas" });
    expect(f[0]!.gancho).toBe("foram pagos em outubro de 2026. 31% sem dizer para quê.");
  });
  test("parcela pequena sem dizer para quê não vira gancho (sem '1%')", () => {
    const pouco = { janelas: [{ ...rankings.janelas[0]!, tipos: [{ tipo: "pix", valor: 1_00, pagamentos: 1 }] }] } as unknown as Rankings;
    expect(fatosDoDia({ rankings: pouco })[0]!.gancho).toBe("foram pagos em outubro de 2026.");
  });
  test("pessoa (não grupo) que mais mandou no mês, com nome comum", () => {
    expect(f.find((x) => x.id === "pessoa")).toMatchObject({ titulo: "Nikolas Ferreira", numero: 5_000_000_00, href: "/autor/1" });
  });
  test("cidade que mais recebeu no mês e orçamento secreto", () => {
    expect(f.find((x) => x.id === "cidade")).toMatchObject({ titulo: "Brasília", href: "/municipio/5300108" });
    expect(f.find((x) => x.id === "secreto")).toMatchObject({ numero: 200_00, href: "/orcamento-secreto" });
  });
  test("todo fato tem link e texto para compartilhar sem jargão", () => {
    for (const x of f) { expect(x.href).toMatch(/^\//); expect(x.gancho).not.toMatch(/emenda|RP ?9|favorecid/i); }
  });
  test("sem dados -> nada", () => expect(fatosDoDia({})).toEqual([]));
});
