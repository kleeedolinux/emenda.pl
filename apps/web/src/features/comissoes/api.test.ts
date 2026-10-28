import { describe, expect, test } from "bun:test";
import {
  agrupar, dataSenado, distribuicao, indexProximasCamara, indexProximasSenado, mapAgendaSenado, mapComissaoSenado, mapListaSenado,
  mapMembrosCamara, mapVotacoesSenado, nomeLimpo, ordenarMembros, presidenteDe, tipoCamara, type MembroCamaraRaw,
} from "./api";

const mc = (id: number, nome: string, titulo: string, codTitulo: number, p = "PT", uf = "SP", dataFim: string | null = null): MembroCamaraRaw =>
  ({ id, nome, siglaPartido: p, siglaUf: uf, urlFoto: `f${id}`, titulo, codTitulo, dataInicio: "2026-02-09", dataFim });

describe("mapMembrosCamara", () => {
  const ms = mapMembrosCamara([
    mc(1, "Ana", "Titular", 101), mc(2, "Bia", "Suplente", 102, "PL", "RJ"), mc(3, "Leur Lomanto Júnior", "Presidente", 1, "UNIÃO", "BA"),
    mc(4, "Rodrigo de Castro", "1º Vice-Presidente", 2, "UNIÃO", "MG"), mc(5, "Saiu", "Titular", 101, "PT", "SP", "2026-03-01"),
    mc(1, "Ana", "Titular", 101), // repetido
  ]);
  test("ativos, sem repetição, cargos primeiro", () => {
    expect(ms.map((m) => [m.nome, m.cargo, m.titular])).toEqual([
      ["Leur Lomanto Júnior", "Presidente", true], ["Rodrigo de Castro", "1º Vice-Presidente", true], ["Ana", null, true], ["Bia", null, false],
    ]);
  });
  test("links e fotos", () => expect(ms[0]).toMatchObject({ href: "/deputado/3", foto: "f3", partido: "UNIÃO", uf: "BA", casa: "camara" }));
  test("presidente", () => expect(presidenteDe(ms)?.nome).toBe("Leur Lomanto Júnior"));
});

describe("nomeLimpo", () => {
  test.each([["Senador Renan Calheiros", "Renan Calheiros"], ["Senadora Soraya Thronicke", "Soraya Thronicke"], ["Deputado Domingos Neto", "Domingos Neto"], ["Deputada Ana", "Ana"], ["Zé", "Zé"]])("%s", (a, b) => expect(nomeLimpo(a)).toBe(b));
});

// Formato real de /comissao/{codigo} (Senado), reduzido.
const cmo = {
  ComissoesCongressoNacional: { Colegiados: { Colegiado: [{
    CodigoColegiado: "1664", NomeColegiado: "Comissão Mista de Planos, Orçamentos Públicos e Fiscalização", SiglaColegiado: "CMO",
    Finalidade: "Apreciação das matérias orçamentárias.", TipoColegiado: { TipoColegiado: "Comissão Permanente", SiglaCasa: "CN", CodigoTipo: "41" },
    QuantidadesMembros: { Titulares: "42", Suplentes: "42" },
    Cargos: { Cargo: [
      { TipoCargo: "PRESIDENTE", NomeParlamentar: "Deputado Domingos Neto", CodigoParlamentar: "5234", CodigoDeputadoNaCamara: "143632", Bancada: "(PSD-CE)" },
      { TipoCargo: "2º VICE-PRESIDENTE", NomeParlamentar: "Deputado Marcelo Álvaro Antônio", CodigoParlamentar: "5834", CodigoDeputadoNaCamara: "179000", Bancada: "(PL-MG)" },
    ] },
    MembrosBlocoSF: { PartidoBloco: [{ UnidadePartidaria: "Bloco Parlamentar Democracia", MembrosSF: { Membro: [
      { NomeParlamentar: "Senador Eduardo Braga", CodigoParlamentar: "4994", SiglaUf: "AM", Partido: "MDB", TipoVaga: "Titular", OrigemParlamentar: "Senado" },
      { NomeParlamentar: "VAGO", TipoVaga: "Suplente", OrigemParlamentar: "Senado" },
    ] } }, { UnidadePartidaria: "Bloco X", MembrosSF: { Membro: { NomeParlamentar: "Senadora Tereza Cristina", CodigoParlamentar: "5998", SiglaUf: "MS", Partido: "PP", TipoVaga: "Suplente", OrigemParlamentar: "Senado" } } }] },
    MembrosBlocoCD: { Membro: [
      { UnidadePartidaria: "MDB", MembrosCD: {} },
      { UnidadePartidaria: "PSD", MembrosCD: { Membro: [
        { NomeParlamentar: "Deputado Domingos Neto", CodigoParlamentar: "5234", CodigoDeputadoNaCamara: "143632", SiglaUf: "CE", Partido: "PSD", TipoVaga: "Titular", OrigemParlamentar: "Camara" },
        { NomeParlamentar: "VAGO", TipoVaga: "Titular", OrigemParlamentar: "Camara" },
      ] } },
    ] },
    InformacoesSecretaria: { LocalReuniao: "Anexo II", eMail: "cmo@camara.leg.br" },
  }] } },
};

describe("mapComissaoSenado", () => {
  const c = mapComissaoSenado(cmo)!;
  test("cabeçalho", () => expect(c).toMatchObject({ codigo: 1664, sigla: "CMO", casa: "cn", finalidade: "Apreciação das matérias orçamentárias.", local: "Anexo II" }));
  test("membros das duas Casas, sem vagas, cargos aplicados", () => {
    expect(c.membros.map((m) => [m.nome, m.casa, m.cargo, m.titular, m.href, m.partido, m.uf])).toEqual([
      ["Domingos Neto", "camara", "Presidente", true, "/deputado/143632", "PSD", "CE"],
      ["Eduardo Braga", "senado", null, true, "/senador/4994", "MDB", "AM"],
      ["Tereza Cristina", "senado", null, false, "/senador/5998", "PP", "MS"],
    ]);
  });
  test("cargo sem vaga listada vira membro", () => {
    expect(c.cargos.map((x) => [x.nome, x.cargo, x.partido, x.uf, x.href])).toEqual([
      ["Domingos Neto", "Presidente", "PSD", "CE", "/deputado/143632"], ["Marcelo Álvaro Antônio", "2º Vice-Presidente", "PL", "MG", "/deputado/179000"],
    ]);
  });
  test("foto do senador", () => expect(c.membros[1]!.foto).toBe("https://www.senado.leg.br/senadores/img/fotos-oficiais/senador4994.jpg"));
  test("vazio", () => expect(mapComissaoSenado({})).toBeNull());
});

describe("mapListaSenado", () => {
  test("permanente (aninhado) e mistas", () => {
    const perm = { ListaBasicaComissoes: { colegiado: { colegiados: [{ colegiado: [{ CodigoColegiado: "38", SiglaColegiado: "CAE", NomeColegiado: "Comissão de Assuntos Econômicos", tipocolegiado: { SiglaCasa: "SF", SiglaTipoColegiado: "PERMANENTE" } }] }] } } };
    expect(mapListaSenado(perm, "permanente")).toEqual([{ codigo: 38, sigla: "CAE", nome: "Comissão de Assuntos Econômicos", casa: "senado", tipo: "permanente" }]);
    const mistas = { ComissoesMistasCongresso: { Colegiados: { Colegiado: { CodigoColegiado: "1664", SiglaColegiado: "CMO", NomeColegiado: "Comissão Mista de Planos", Finalidade: "x" } } } };
    expect(mapListaSenado(mistas, "mista")).toEqual([{ codigo: 1664, sigla: "CMO", nome: "Comissão Mista de Planos", casa: "cn", tipo: "mista" }]);
    expect(mapListaSenado({ ListaBasicaComissoes: {} }, "cpi")).toEqual([]);
  });
});

describe("tipoCamara", () => {
  test.each([[2, "permanente"], [3, "especial"], [4, "cpi"], [20, "cpi"], [6, "mista"], [21, "mista"], [9, "mista"], [5, "temporaria"], [11, "temporaria"]] as const)("%i", (c, t) => expect(tipoCamara(c)).toBe(t));
});

describe("agenda", () => {
  const ev = (id: number, data: string, situacao: string, org: number) => ({ id, dataHoraInicio: data, situacao, descricaoTipo: "Reunião Deliberativa", descricao: "x", orgaos: [{ id: org, sigla: "S" }] });
  test("Câmara: próxima por órgão, ignora cancelada e passada", () => {
    const m = indexProximasCamara([ev(1, "2026-11-10T15:00", "Convocada", 2003), ev(2, "2026-11-04T09:30", "Convocada", 2003), ev(3, "2026-11-03T09:00", "Cancelada", 2003), ev(4, "2026-10-01T09:00", "Encerrada", 2009)], "2026-10-28T12:00");
    expect(m.get(2003)?.id).toBe(2);
    expect(m.has(2009)).toBe(false);
  });
  const agenda = { AgendaReuniao: { reunioes: { reuniao: [
    { codigo: "15004", titulo: "9ª Reunião Extraordinária", dataInicio: "2026-11-04T15:00:00.000", situacao: "Agendada", local: "Plenário 6", colegiadoCriador: { codigo: "1956", sigla: "CTFC" },
      partes: { nome: "Deliberativa", isDeliberativa: "true", itens: [{ nome: "PL 4080/2020", relatorio: "Pela aprovação" }, { nome: "PFS 2/2026" }] } },
    { codigo: "15005", titulo: "Cancelada", dataInicio: "2026-11-05T10:00:00.000", situacao: "Cancelada", colegiadoCriador: { codigo: "1956", sigla: "CTFC" }, partes: [] },
  ] } } };
  test("Senado: reuniões mapeadas com itens da pauta", () => {
    const rs = mapAgendaSenado(agenda);
    expect(rs[0]).toMatchObject({ codigo: 15004, colegiado: 1956, sigla: "CTFC", data: "2026-11-04T15:00", itens: ["PL 4080/2020", "PFS 2/2026"] });
    expect(indexProximasSenado(rs, "2026-10-28T00:00").get(1956)?.codigo).toBe(15004);
  });
  test("dataSenado", () => expect(dataSenado("2026-10-28")).toBe("20261028"));
});

describe("mapVotacoesSenado", () => {
  test("placar e matéria", () => {
    const j = { VotacoesComissao: { Votacoes: { Votacao: { CodigoVotacao: "40385", DataHoraInicioReuniao: "2026-04-28T10:26:00", IdentificacaoMateria: "PL 4080/2020", DescricaoVotacao: "Nos termos do relatório", TotalVotosSim: "14", TotalVotosNao: "0", TotalVotosAbstencao: "1" } } } };
    expect(mapVotacoesSenado(j)).toEqual([{ codigo: 40385, data: "2026-04-28T10:26:00", materia: "PL 4080/2020", descricao: "Nos termos do relatório", sim: 14, nao: 0, abstencao: 1 }]);
    expect(mapVotacoesSenado({ VotacoesComissao: {} })).toEqual([]);
  });
});

describe("distribuicao", () => {
  test("por partido e por UF, maior primeiro", () => {
    const ms = mapMembrosCamara([mc(1, "A", "Titular", 101, "PT", "SP"), mc(2, "B", "Titular", 101, "PL", "SP"), mc(3, "C", "Suplente", 102, "PT", "RJ")]);
    expect(distribuicao(ms)).toEqual({ partidos: [{ label: "PT", value: 2 }, { label: "PL", value: 1 }], ufs: [{ label: "SP", value: 2 }, { label: "RJ", value: 1 }] });
    expect(distribuicao(ms, true).partidos).toEqual([{ label: "PL", value: 1 }, { label: "PT", value: 1 }]);
  });
  test("ordenarMembros: cargo, titular, nome", () => {
    const ms = ordenarMembros(mapMembrosCamara([mc(1, "Zé", "Titular", 101), mc(2, "Ana", "Suplente", 102), mc(3, "Bruno", "Titular", 101)]));
    expect(ms.map((m) => m.nome)).toEqual(["Bruno", "Zé", "Ana"]);
  });
});

describe("agrupar", () => {
  test("ordem fixa dos grupos e vazios omitidos", () => {
    const g = agrupar([{ tipo: "mista", sigla: "CMO" }, { tipo: "permanente", sigla: "CFT" }, { tipo: "permanente", sigla: "CCJC" }, { tipo: "cpi", sigla: "CPIX" }]);
    expect(g.map(([t, xs]) => [t, xs.map((x) => x.sigla)])).toEqual([["permanente", ["CCJC", "CFT"]], ["cpi", ["CPIX"]], ["mista", ["CMO"]]]);
  });
});
