import { expect, test } from "bun:test";
import { cruzarMaisVotados } from "./cruzarMaisVotados";

test("cruza eleitos do TSE com parlamentares atuais pelo nome + UF e mantém a ordem de votos", () => {
  const tse = [
    { sq: "1", nome: "NIKOLAS FERREIRA", partido: "PL", uf: "MG", votos: 1492047 },
    { sq: "2", nome: "GUILHERME BOULOS", partido: "PSOL", uf: "SP", votos: 1001472 },
    { sq: "3", nome: "SEM MANDATO", partido: "X", uf: "SP", votos: 10 },
  ];
  const atuais = [
    { casa: "deputado" as const, id: "220593", nome: "Nikolas Ferreira", uf: "MG", partido: "PL", foto: "f1" },
    { casa: "deputado" as const, id: "220639", nome: "Guilherme Boulos", uf: "SP", partido: "PSOL", foto: "f2" },
  ];
  const r = cruzarMaisVotados(tse, atuais, 10);
  expect(r.map((x) => x.id)).toEqual(["220593", "220639", null]);
  expect(r[0]!.votos).toBe(1492047);
  expect(r[0]!.foto).toBe("f1");
  expect(cruzarMaisVotados(tse, atuais, 1)).toHaveLength(1);
});
