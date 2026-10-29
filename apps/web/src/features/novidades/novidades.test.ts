import { describe, expect, test } from "bun:test";
import type { Novidade } from "@emenda/contracts";
import {
  tempoRelativo, agruparPorDia, corpo, filtrar, mesclar, proximoArquivo, formatarNumero, novosDesde, textoParaCopiar, linkInterno, parseTipos, serializeTipos, shareDe,
} from "./novidades";
import { leigo, ROTULO_NOVIDADE } from "./novidades";

const n = (id: string, data: string, tipo: Novidade["tipo"] = "lei", relevancia = 50): Novidade => ({
  id, tipo, data, titulo: id, texto: `texto ${id}`, entidades: [], fonte: ["https://x"], relevancia,
});

const AGORA = new Date("2026-10-28T12:00:00-03:00").getTime();

describe("novidades", () => {
  test.each([
    ["2026-10-28T11:59:40-03:00", "agora"],
    ["2026-10-28T11:30:00-03:00", "há 30 min"],
    ["2026-10-28T09:00:00-03:00", "há 3 h"],
    ["2026-10-27T10:00:00-03:00", "ontem"],
    ["2026-10-25T12:00:00-03:00", "há 3 dias"],
    ["2026-09-01T12:00:00-03:00", "1 de set."],
    ["2025-09-01T12:00:00-03:00", "1 de set. de 2025"],
    ["2026-10-29T06:00:00-03:00", "agora"],
  ] as const)("tempoRelativo(%p) = %p", (iso, s) => expect(tempoRelativo(iso, AGORA)).toBe(s));

  test("filtra por tipos e relevância alta (≥ 70)", () => {
    const itens = [n("a", "2026-10-28", "lei", 95), n("b", "2026-10-28", "votacao", 50), n("c", "2026-10-28", "pix", 70)];
    expect(filtrar(itens, { tipos: new Set(), alta: false }).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(filtrar(itens, { tipos: new Set(["lei", "pix"]), alta: false }).map((x) => x.id)).toEqual(["a", "c"]);
    expect(filtrar(itens, { tipos: new Set(), alta: true }).map((x) => x.id)).toEqual(["a", "c"]);
  });

  test("mescla sem duplicar, mais novo primeiro (fusos diferentes)", () => {
    const a = [n("x", "2026-10-28T00:41:06Z"), n("y", "2026-10-20T00:00:00-03:00")];
    const b = [n("x", "2026-10-28T00:41:06Z"), n("z", "2026-10-27T22:00:00-03:00")];
    expect(mesclar(a, b).map((i) => i.id)).toEqual(["z", "x", "y"]);
  });

  test("próximo arquivo mensal no scroll infinito", () => {
    const meses = [{ mes: 202610, n: 2 }, { mes: 202609, n: 3 }, { mes: 202608, n: 1 }];
    const rolante = [n("1", "2026-10-02"), n("2", "2026-10-01"), n("3", "2026-09-30")];
    // outubro completo no rolante; setembro parcial -> carrega setembro
    expect(proximoArquivo(meses, rolante, [])).toBe(202609);
    expect(proximoArquivo(meses, rolante, [202609])).toBe(202608);
    expect(proximoArquivo(meses, rolante, [202609, 202608])).toBeNull();
  });

  test("formata números (centavos e contagens)", () => {
    expect(formatarNumero({ rotulo: "total", valor: 1_234_567_890, formato: "brl" })).toMatch(/^R\$\s?12,3\s?mi/);
    expect(formatarNumero({ rotulo: "sim", valor: 320, formato: "n" })).toBe("320");
  });

  test("novos desde a última visita", () => {
    const itens = [n("a", "2026-10-28T10:00:00Z"), n("b", "2026-10-27T10:00:00Z")];
    expect(novosDesde(itens, "2026-10-27T12:00:00Z")).toBe(1);
    expect(novosDesde(itens, null)).toBe(0);
  });

  test("texto para copiar inclui link permanente e cabe no tweet", () => {
    const t = textoParaCopiar(n("lei-1", "2026-10-28"), "https://emenda.online");
    expect(t).toBe("texto lei-1 https://emenda.online/novidades#lei-1");
  });

  test("links internos vs externos", () => {
    expect(linkInterno("/deputado/1")).toBe(true);
    expect(linkInterno("https://legis.senado.leg.br/norma/1")).toBe(false);
    expect(linkInterno("//evil.example")).toBe(false);
  });

  test("tipos na URL (?tipo=lei,votacao) ignoram valores inválidos", () => {
    expect([...parseTipos("lei,votacao,xyz")]).toEqual(["lei", "votacao"]);
    expect(serializeTipos(new Set(["votacao", "lei"]))).toBe("lei,votacao");
    expect(parseTipos(null).size).toBe(0);
  });

  test("dados de compartilhamento usam o texto pronto", () => {
    const s = shareDe({ ...n("v-1", "2026-10-28", "votacao"), numeros: [{ rotulo: "sim", valor: 320, formato: "n" }, { rotulo: "não", valor: 110, formato: "n" }] });
    expect(s.text).toBe("texto v-1");
    expect(s.url).toBe("/novidades#v-1");
    expect(s.votes).toEqual({ sim: 320, nao: 110, outros: 0 });
    const p = shareDe({ ...n("p-1", "2026-10-28", "pagamentos"), numeros: [{ rotulo: "total", valor: 100, formato: "brl" }] });
    expect(p.metric).toEqual({ value: 100, format: "brl", label: "total" });
  });

  test("agrupa por dia de Brasília com rótulos Hoje/Ontem", () => {
    const itens = [n("a", "2026-10-28T01:00:00Z"), n("b", "2026-10-28T02:59:00Z"), n("c", "2026-10-28T03:00:00Z"), n("d", "2026-10-20T15:00:00Z")];
    // 28/10 01:00Z e 02:59Z ainda são 27/10 em Brasília
    expect(agruparPorDia(mesclar(itens), AGORA).map((g) => [g.rotulo, g.itens.map((i) => i.id).join("")])).toEqual([
      ["Hoje", "c"], ["Ontem", "ba"], ["20 de outubro", "d"],
    ]);
  });

  test.each([
    ["Câmara aprovou PL 1/2026 por 3 × 1", "🗳️ Câmara aprovou PL 1/2026 por 3 × 1: altera a lei X.", "Altera a lei X."],
    ["Dep. A (SP) trocou de partido: PT → PSB", "🔁 Dep. A (SP) trocou de partido: PT → PSB, segundo os dados abertos da Câmara.", "Segundo os dados abertos da Câmara."],
    ["R$ 1 mi pagos", "💸 R$ 1 mi pagos.", ""],
    ["Título diferente", "📜 Outro texto qualquer.", "Outro texto qualquer."],
  ] as const)("corpo sem repetir o título (%p)", (titulo, texto, esperado) =>
    expect(corpo({ ...n("x", "2026-10-28"), titulo, texto })).toBe(esperado));
});

describe("leigo: texto das novidades sem jargão", () => {
  const casos: Array<[string, string]> = [
    ["R$ 337,8 mi pagos em emendas parlamentares em outubro/2026 até agora", "R$ 337,8 mi mandados por deputados e senadores em outubro de 2026 até agora"],
    ["R$ 2,1 mi pagos em Emendas Pix (transferências especiais) em outubro/2026 até agora", "R$ 2,1 mi mandados sem dizer para quê em outubro de 2026 até agora"],
    ["Sen. Hamilton Mourão (REPUBLICANOS-RS) teve o maior gasto da cota parlamentar (CEAPS) em setembro/2026: R$ 64,6 mil", "Senador Hamilton Mourão (REPUBLICANOS-RS) teve o maior gasto do gabinete em setembro de 2026: R$ 64,6 mil"],
    ["Dep. Gabriel Mota (UNIÃO-RR) teve o maior gasto da cota parlamentar em setembro/2026: R$ 87,5 mil", "Deputado Gabriel Mota (UNIÃO-RR) teve o maior gasto do gabinete em setembro de 2026: R$ 87,5 mil"],
    ["Câmara aprovou PL 5239/2025 em votação simbólica", "Câmara aprovou PL 5239/2025 sem registrar o voto de cada um"],
    ["Câmara aprovou urgência para o PL 5902/2023", "Câmara acelerou a votação do PL 5902/2023"],
    ["Lei Complementar nº 238/2026 sancionada em 21/10", "Lei Complementar nº 238/2026 assinada pelo presidente em 21/10"],
    ["Nova PEC 18/2026", "Nova proposta de mudar a Constituição (PEC 18/2026)"],
  ];
  for (const [ent, sai] of casos) test(ent, () => expect(leigo(ent)).toBe(sai));
  test("rótulos das categorias em palavras do dia a dia", () => {
    expect(ROTULO_NOVIDADE.pix).toBe("Sem dizer para quê");
    expect(ROTULO_NOVIDADE.gastos).toBe("Gastos do gabinete");
    expect(Object.values(ROTULO_NOVIDADE).join(" ")).not.toMatch(/emenda|cota|urgência/i);
  });
});
