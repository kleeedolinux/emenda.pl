import { describe, expect, test } from "bun:test";
import type { PixItem } from "@emenda/contracts";
import { filtrarPix, opcoesPix, partePix } from "./pix";

const it = (uf: string | null, autor: string, localidade: string, pago: number): PixItem => ({
  codigo: autor + localidade, numero: "1", autor: { codigo: autor, nome: `DEP ${autor}` }, localidade, ibge: null, uf, funcao: "Encargos especiais", empenhado: pago, pago, rapPago: 0,
});
const xs = [it("SP", "1", "CAMPINAS - SP", 10), it("RJ", "2", "NITERÓI - RJ", 20), it(null, "1", "NACIONAL", 5)];

describe("pix", () => {
  test("filtra por UF, autor e texto (sem acento)", () => {
    expect(filtrarPix(xs, { uf: "SP" }).length).toBe(1);
    expect(filtrarPix(xs, { autor: "1" }).length).toBe(2);
    expect(filtrarPix(xs, { q: "niteroi" }).map((x) => x.pago)).toEqual([20]);
    expect(filtrarPix(xs, { q: "dep 2" }).length).toBe(1);
  });
  test("opções", () => expect(opcoesPix(xs)).toEqual({ ufs: ["RJ", "SP"], autores: [{ codigo: "1", nome: "DEP 1" }, { codigo: "2", nome: "DEP 2" }] }));
  test("parte do Pix no total pago", () => {
    expect(partePix(25, 100)).toBe(0.25);
    expect(partePix(1, 0)).toBe(0);
  });
});
