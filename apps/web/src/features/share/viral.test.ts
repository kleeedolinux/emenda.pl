import { describe, expect, test } from "bun:test";
import { basico, chaveNome, enriquecer, fonteDe, fotoPorNome, naUf, retratoDe } from "./viral";
import { buildMessage, type ShareData } from "./links";

const autor = (nome: string, pago: number) => ({ codigo: "1", nome, chave: chaveNome(nome), n: 1, pago, empenhado: pago });

const municipio = {
  ibge: "2914505", nome: "Irará", uf: "BA",
  totais: { n: 9, pago: 200_000_000, rapPago: 60_000_000 },
  porTipo: [{ tipo: "pix", pago: 104_000_000, rapPago: 0 }, { tipo: "individual", pago: 96_000_000, rapPago: 60_000_000 }],
  autores: [autor("BANCADA DA BAHIA", 900_000_000), autor("PAULO MAGALHAES", 120_000_000), autor("OTTO ALENCAR", 80_000_000),
    autor("RELATOR GERAL", 7), autor("JOAO DA SILVA", 10_000_000)],
};

describe("viral share", () => {
  test("chaveNome e foto por nome", () => {
    expect(chaveNome("Paulo Magalhães Jr.")).toBe("PAULO MAGALHAES JR");
    expect(fotoPorNome("Paulo Magalhães")).toBe("/og-img/nome/PAULO-MAGALHAES");
  });

  test.each<[string, string]>([["BA", "na Bahia"], ["SP", "em São Paulo"], ["RJ", "no Rio de Janeiro"]])("naUf(%p)", (uf, out) =>
    expect(naUf(uf)).toBe(out));

  test.each<[ShareData, string | null]>([
    [{ kind: "municipio", title: "Irará", url: "/municipio/2914505", ogId: "2914505" }, "/data/v1/municipio/2914505.json"],
    [{ kind: "uf", title: "Bahia", url: "/uf/BA", ogId: "BA" }, "/data/v1/uf/BA.json"],
    [{ kind: "pagina", title: "Pix", url: "/pix" }, "/data/v1/pix.json"],
    [{ kind: "municipio", title: "x", url: "/municipio/1", ogId: "../x" }, null],
    [{ kind: "deputado", title: "x", url: "/deputado/1", ogId: "1" }, null],
  ])("fonteDe %#", (d, out) => expect(fonteDe(d)).toBe(out));

  test("retratos por tipo", () => {
    expect(retratoDe({ kind: "deputado", title: "A", url: "/deputado/7", ogId: "7" })).toBe("/og-img/deputado/7");
    expect(retratoDe({ kind: "senador", title: "A", url: "/senador/5", ogId: "5" })).toBe("/og-img/senador/5");
    expect(retratoDe({ kind: "voto", title: "A", url: "/votacao/1?dep=9", ogId: "1-2/9" })).toBe("/og-img/deputado/9");
    expect(retratoDe({ kind: "autor", title: "José Aníbal", url: "/autor/1", ogId: "1" })).toBe("/og-img/nome/JOSE-ANIBAL");
    expect(retratoDe({ kind: "autor", title: "Bancada da Bahia", url: "/autor/2" })).toBeUndefined();
    expect(retratoDe({ kind: "municipio", title: "x", url: "/municipio/1" })).toBeUndefined();
  });

  test("basico: retrato e gancho padrão", () => {
    expect(basico({ kind: "deputado", title: "A", url: "/deputado/7", ogId: "7" })).toMatchObject({ retrato: "/og-img/deputado/7", gancho: "Para onde foi esse dinheiro?" });
    expect(basico({ kind: "pagina", title: "A", url: "/sobre" }).gancho).toBeUndefined();
    expect(basico({ kind: "deputado", title: "A", url: "/d", gancho: "X" }).gancho).toBe("X");
  });

  test("município: rostos, número, gancho e mensagem curiosa", () => {
    const d = enriquecer({ kind: "municipio", title: "Irará", subtitle: "Bahia", url: "/municipio/2914505", ogId: "2914505" }, municipio);
    expect(d.rostos?.map((r) => r.nome)).toEqual(["Paulo Magalhaes", "Otto Alencar", "Joao da Silva"]);
    expect(d.rostos?.[0]).toMatchObject({ foto: "/og-img/nome/PAULO-MAGALHAES" });
    expect(d.metric).toMatchObject({ value: 260_000_000, format: "brl", label: "chegaram em Irará (BA)" });
    expect(d.gancho).toBe("40% sem dizer para quê. Quem mandou?");
    expect(buildMessage(d)).toMatch(/^💸 R\$\s?2,6\smi chegaram em Irará \(BA\), mandados por 3 políticos\. 40% sem dizer para quê\. Quem mandou\? 👇$/);
  });

  test("com dados, a mensagem viral substitui o texto da página", () => {
    const d = enriquecer({ kind: "uf", title: "Bahia", url: "/uf/BA", ogId: "BA", text: "Olha" }, { ...municipio, uf: "BA", nome: "Bahia" });
    expect(d.text).toMatch(/^💸 /);
    expect(d.rostos?.length).toBe(3);
  });

  test("uf usa preposição", () => {
    const d = enriquecer({ kind: "uf", title: "Bahia", url: "/uf/BA", ogId: "BA" }, { ...municipio, uf: "BA", nome: "Bahia" });
    expect(buildMessage(d)).toMatch(/chegaram na Bahia, mandados por 3 políticos/);
  });

  test("dados inválidos não quebram", () => {
    const base: ShareData = { kind: "municipio", title: "x", url: "/municipio/1", ogId: "1" };
    expect(enriquecer(base, null)).toEqual(base);
    expect(enriquecer(base, { autores: "x" })).toMatchObject({ kind: "municipio" });
    // Sem total, o texto da página fica.
    expect(enriquecer({ ...base, text: "Olha" }, { autores: [] }).text).toBe("Olha");
  });
});
