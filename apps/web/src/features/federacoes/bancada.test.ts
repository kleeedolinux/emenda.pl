import { describe, expect, test } from "bun:test";
import type { AutorResumo } from "@emenda/contracts";
import { indexAutores, type DeputadoLista, type SenadorResumo, type VotacaoLista } from "@/features/legislativo/api";
import { bancadaFederacao, votacaoPrincipal } from "./bancada";
import { federacaoPorId } from "./dados";

const dep = (id: number, nome: string, p: string): DeputadoLista => ({ id, nome, siglaPartido: p, siglaUf: "SP", urlFoto: "", idLegislatura: 57, email: null });
const sen = (codigo: string, nome: string, p: string): SenadorResumo => ({ codigo, nome, nomeCompleto: nome, sexo: "", foto: "", pagina: "", email: "", partido: p, uf: "BA", bloco: "", mandatos: [] });
const autor = (nome: string, pago: number) => ({ chave: nome.toUpperCase(), nome, pago, codigo: nome }) as unknown as AutorResumo;

describe("bancadaFederacao", () => {
  const fe = federacaoPorId("brasil-da-esperanca")!;
  const r = bancadaFederacao(fe,
    [dep(1, "ANA", "PT"), dep(2, "BIA", "PCdoB"), dep(3, "CAIO", "PL"), dep(1, "ANA", "PT"), dep(4, "DUDA", "PV")],
    [sen("10", "EVA", "PT"), sen("11", "FABIO", "MDB")],
    indexAutores([autor("ANA", 500), autor("EVA", 1000), autor("DUDA", 0)]));
  test("conta por partido, sem repetir deputado", () => {
    expect(r.deputados.map((d) => d.id)).toEqual([1, 2, 4]);
    expect(r.senadores.map((s) => s.codigo)).toEqual(["10"]);
    expect(r.porPartido).toEqual([
      { partido: "PT", deputados: 1, senadores: 1, pago: 1500 },
      { partido: "PCdoB", deputados: 1, senadores: 0, pago: 0 },
      { partido: "PV", deputados: 1, senadores: 0, pago: 0 },
    ]);
  });
  test("emendas pagas somam quem foi encontrado em autores", () => {
    expect(r.pago).toBe(1500);
    expect(r.encontrados).toBe(3);
  });
  test("sem índice de autores", () => expect(bancadaFederacao(fe, [dep(1, "ANA", "PT")], [], null).pago).toBeNull());
});

const vl = (id: string, data: string, orgao: string, descricao: string): VotacaoLista => ({ id, data, dataHoraRegistro: `${data}T10:00`, siglaOrgao: orgao, descricao, aprovacao: 1 });

describe("votacaoPrincipal", () => {
  test("nominal do Plenário com mais votos; comissões e simbólicas ficam de fora", () => {
    const vs = [
      vl("a", "2024-01-01", "PLEN", "Aprovado o requerimento. Sim: 300; Não: 100; Total: 400."),
      vl("b", "2024-02-01", "PLEN", "Aprovada a Redação Final."),
      vl("c", "2024-03-01", "PLEN", "Aprovado o Projeto. Sim: 320; Não: 120; Abstenção: 3; Total: 443."),
      vl("d", "2024-03-02", "CCJC", "Aprovado o Parecer. Sim: 40; Não: 20; Total: 60."),
    ];
    expect(votacaoPrincipal(vs)?.id).toBe("c");
  });
  test("sem nominal no Plenário", () => expect(votacaoPrincipal([vl("d", "2024-03-02", "CCJC", "Sim: 1; Não: 0; Total: 1.")])).toBeNull());
});
