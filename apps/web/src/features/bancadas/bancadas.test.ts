import { describe, expect, test } from "bun:test";
import type { AutorResumo, GastosRanking } from "@emenda/contracts";
import {
  bancadasPorUf, buscarFrentes, coesao, composicao, dataRegistro, ordenarFrentes, resolverBancada, somaEmendas, somaGastos, votoGrupo,
  type MembroFrente,
} from "./bancadas";
import { BANCADAS_TEMATICAS } from "./catalogo";
import { indexAutores } from "@/features/legislativo/api";
import type { VotoCamara } from "@/features/legislativo/votacao";

const m = (id: number, nome: string, siglaPartido: string, siglaUf: string): MembroFrente =>
  ({ id, nome, siglaPartido, siglaUf, urlFoto: "", titulo: "Membro" });
const v = (id: number, tipoVoto: string, partido = "X"): VotoCamara =>
  ({ tipoVoto, dataRegistroVoto: "", deputado_: { id, nome: `D${id}`, siglaPartido: partido, siglaUf: "SP", urlFoto: "" } });

describe("coesao (índice de Rice)", () => {
  test.each([
    [10, 0, 1],
    [0, 10, 1],
    [5, 5, 0],
    [8, 2, 0.6],
    [0, 0, null],
  ] as const)("sim=%d não=%d -> %p", (sim, nao, esperado) => {
    const r = coesao(sim, nao);
    if (esperado === null) expect(r).toBeNull();
    else expect(r).toBeCloseTo(esperado, 10);
  });
});

describe("votoGrupo", () => {
  const votos = [v(1, "Sim"), v(2, "Não"), v(3, "Sim"), v(4, "Abstenção"), v(5, "Sim"), v(9, "Não")];
  test("conta só membros, ausentes = membros sem voto", () => {
    expect(votoGrupo(votos, new Set([1, 2, 3, 4, 7]))).toEqual({ sim: 2, nao: 1, outros: 1, ausentes: 1, votantes: 4, pctSim: 2 / 3, coesao: 1 / 3 });
  });
  test("sem filtro = plenário inteiro, sem ausentes", () => {
    const r = votoGrupo(votos);
    expect([r.sim, r.nao, r.outros, r.ausentes, r.votantes]).toEqual([3, 2, 1, 0, 6]);
    expect(r.pctSim).toBeCloseTo(0.6);
  });
  test("ninguém votou -> pct e coesão nulos", () => {
    expect(votoGrupo([], new Set([1]))).toEqual({ sim: 0, nao: 0, outros: 0, ausentes: 1, votantes: 0, pctSim: null, coesao: null });
  });
});

describe("composicao", () => {
  test("conta por chave, maior primeiro, empate por nome", () => {
    const ms = [m(1, "A", "PL", "SP"), m(2, "B", "PT", "RJ"), m(3, "C", "PL", "SP"), m(4, "D", "MDB", "SP")];
    expect(composicao(ms, (x) => x.siglaPartido)).toEqual([{ label: "PL", value: 2 }, { label: "MDB", value: 1 }, { label: "PT", value: 1 }]);
    expect(composicao(ms, (x) => x.siglaUf)).toEqual([{ label: "SP", value: 3 }, { label: "RJ", value: 1 }]);
  });
  test("chave vazia vira S/PART", () => {
    expect(composicao([m(1, "A", "", "SP")], (x) => x.siglaPartido)).toEqual([{ label: "S/PART", value: 1 }]);
  });
});

describe("dataRegistro", () => {
  test.each([
    ["27/04/2023 - Recebidos o REQ 1346/2023\r\n23/05/2023 - Despacho", "2023-04-27"],
    ["sem data", null],
    [null, null],
  ] as const)("%p -> %p", (s, iso) => expect(dataRegistro(s)).toBe(iso));
});

describe("buscarFrentes", () => {
  const fs = [
    { id: 54477, titulo: "Frente Parlamentar Evangélica do Congresso Nacional", idLegislatura: 57 },
    { id: 54323, titulo: "Frente Parlamentar da Agropecuária - FPA", idLegislatura: 57 },
    { id: 54406, titulo: "Frente Parlamentar Mista Ambientalista", idLegislatura: 57 },
  ];
  test.each([
    ["evangelica", [54477]],
    ["ruralista", [54323]], // apelido popular do catálogo
    ["bancada da bala", []],
    ["  ", [54477, 54323, 54406]],
    ["AMBIENTAL", [54406]],
  ] as const)("%p", (q, ids) => expect(buscarFrentes(fs, q).map((f) => f.id)).toEqual([...ids]));
});

describe("ordenarFrentes", () => {
  const fs = [{ id: 1, titulo: "B" }, { id: 2, titulo: "A" }, { id: 3, titulo: "C" }];
  test("por nome", () => expect(ordenarFrentes(fs, "nome", new Map()).map((f) => f.id)).toEqual([2, 1, 3]));
  test("por tamanho: desconhecidos no fim", () => {
    expect(ordenarFrentes(fs, "tamanho", new Map([[1, 10], [3, 50]])).map((f) => f.id)).toEqual([3, 1, 2]);
  });
});

describe("resolverBancada", () => {
  test.each([
    ["54477", 54477],
    ["evangelica", 54477],
    ["ruralista", 54323],
    ["999", 999],
    ["xyz", null],
    ["", null],
  ] as const)("%p -> %p", (p, id) => expect(resolverBancada(p)).toBe(id));
});

describe("catálogo", () => {
  test("ids e slugs únicos, fonte no estatuto da Câmara", () => {
    const ids = BANCADAS_TEMATICAS.map((b) => b.id);
    const slugs = BANCADAS_TEMATICAS.map((b) => b.slug);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const b of BANCADAS_TEMATICAS) {
      expect(b.resumo.length).toBeGreaterThan(40);
      expect(b.fonte).toMatch(/art|Requerimento|Justificativa/i);
    }
  });
});

describe("somaEmendas / somaGastos", () => {
  const autores: AutorResumo[] = [
    { codigo: "1", nome: "FULANO DE TAL", chave: "FULANO DE TAL", n: 2, pago: 1000, empenhado: 0 },
    { codigo: "2", nome: "BELTRANA", chave: "BELTRANA", n: 1, pago: 500, empenhado: 0 },
  ];
  const ms = [m(10, "Fulano de Tal", "PL", "SP"), m(11, "Beltrana", "PT", "RJ"), m(12, "Ninguém", "PP", "MG")];
  test("cruza por chave de nome", () => {
    expect(somaEmendas(ms, indexAutores(autores))).toEqual({ pago: 1500, encontrados: 2, total: 3 });
  });
  test("cruza gastos pelo id da Câmara", () => {
    const r = { parlamentares: [
      { casa: "camara", id: "10", mandato: 300 }, { casa: "camara", id: "12", mandato: 700 }, { casa: "senado", id: "11", mandato: 9999 },
    ] } as unknown as GastosRanking;
    expect(somaGastos(ms, r)).toEqual({ valor: 1000, encontrados: 2, total: 3 });
  });
});

describe("bancadasPorUf", () => {
  test("soma deputados e senadores por UF, ordem alfabética", () => {
    expect(bancadasPorUf([{ siglaUf: "SP" }, { siglaUf: "SP" }, { siglaUf: "AC" }], [{ uf: "SP" }, { uf: "RJ" }])).toEqual([
      { uf: "AC", deputados: 1, senadores: 0, total: 1 },
      { uf: "RJ", deputados: 0, senadores: 1, total: 1 },
      { uf: "SP", deputados: 2, senadores: 1, total: 3 },
    ]);
  });
});
