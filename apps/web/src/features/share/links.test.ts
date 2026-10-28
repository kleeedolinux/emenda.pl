import { describe, expect, test } from "bun:test";
import { absoluteUrl, agendaEventoUrl, buildMessage, formatMetric, ogImagePath, quandoLabel, shareTargets, xIntent, type ShareData } from "./links";
import { graphemeCount, tweetWeight } from "./text";
import { votoShare } from "./voto";

const ORIGIN = "https://emenda.online";
const mun: ShareData = {
  kind: "municipio", title: "Campinas", subtitle: "São Paulo", url: "/municipio/3509502", ogId: "3509502",
  metric: { value: 123_456_789_00, format: "brl", label: "pagos em emendas" },
};
const vot: ShareData = {
  kind: "votacao", title: "PEC 45/2019 — Reforma Tributária", url: "/votacao/2196833-395", ogId: "2196833-395",
  votes: { sim: 382, nao: 118, outros: 3 },
};
const voto: ShareData = { ...vot, kind: "voto", url: "/votacao/2196833-395?dep=204554", voto: "Sim", pessoa: "Tabata Amaral" };

const params = (u: string) => new URL(u).searchParams;

describe("absoluteUrl", () => {
  test.each([
    ["/uf/SP", "https://emenda.online/uf/SP"],
    ["uf/SP", "https://emenda.online/uf/SP"],
    ["https://outro.site/x", "https://outro.site/x"],
    ["/votacao/1-2?dep=3", "https://emenda.online/votacao/1-2?dep=3"],
  ])("%p", (p, out) => expect(absoluteUrl(p, ORIGIN)).toBe(out));
});

describe("formatMetric", () => {
  test("BRL compacto em pt-BR", () => expect(formatMetric({ value: 123_456_789_00, format: "brl", label: "" })).toMatch(/^R\$\s?123,5\smi$/));
  test("inteiro com separador", () => expect(formatMetric({ value: 12345, format: "int", label: "" })).toBe("12.345"));
});

describe("buildMessage", () => {
  test.each<[string, ShareData, RegExp[]]>([
    ["município", mun, [/Campinas/, /R\$\s?123,5\smi/, /emendas/]],
    ["votação", vot, [/382 Sim/, /118 Não/, /Reforma Tributária/]],
    ["voto", voto, [/Tabata Amaral votou Sim/, /Reforma Tributária/]],
    ["deputado", { kind: "deputado", title: "Fulano", url: "/deputado/1", metric: { value: 5_000_000_00, format: "brl", label: "pagos" } }, [/Fulano/, /R\$/]],
    ["proposição", { kind: "proposicao", title: "PL 1/2024", subtitle: "Altera a lei", url: "/proposicao/1" }, [/PL 1\/2024/, /Altera a lei/]],
    ["pix", { kind: "pix", title: "Emenda Pix 123", url: "/pix", metric: { value: 100_00, format: "brl", label: "" } }, [/Pix/, /R\$/]],
  ])("%s", (_n, d, res) => {
    const m = buildMessage(d);
    for (const r of res) expect(m).toMatch(r);
    expect(m).not.toContain("http");
  });

  test("texto explícito tem prioridade", () => expect(buildMessage({ ...mun, text: "Olha isso" })).toBe("Olha isso"));
  test("sem métrica não mostra valor vazio", () => expect(buildMessage({ kind: "uf", title: "Bahia", url: "/uf/BA" })).not.toMatch(/undefined|NaN|R\$\s*$/));
});

describe("xIntent", () => {
  test("cabe em 280 com URL pesando 23 e hashtag", () => {
    const long: ShareData = { ...vot, title: "Votação ".repeat(80) };
    const u = xIntent(long, ORIGIN);
    const p = params(u);
    expect(u.startsWith("https://x.com/intent/post?")).toBe(true);
    expect(p.get("url")).toBe("https://emenda.online/votacao/2196833-395");
    expect(p.get("hashtags")).toBe("emendaonline");
    expect(tweetWeight(p.get("text")!) + 1 + 23 + " #emendaonline".length).toBeLessThanOrEqual(280);
  });
});

describe("shareTargets", () => {
  const t = Object.fromEntries(shareTargets(mun, ORIGIN).map((x) => [x.id, x.href]));
  test("WhatsApp com mensagem + link", () => {
    const text = params(t.whatsapp!).get("text")!;
    expect(t.whatsapp!.startsWith("https://wa.me/?text=")).toBe(true);
    expect(text).toContain("Campinas");
    expect(text.endsWith("https://emenda.online/municipio/3509502")).toBe(true);
  });
  test("Telegram", () => {
    expect(params(t.telegram!).get("url")).toBe("https://emenda.online/municipio/3509502");
    expect(params(t.telegram!).get("text")).toContain("Campinas");
  });
  test("Facebook/LinkedIn só com URL", () => {
    expect(params(t.facebook!).get("u")).toBe("https://emenda.online/municipio/3509502");
    expect(params(t.linkedin!).get("url")).toBe("https://emenda.online/municipio/3509502");
  });
  test("Bluesky ≤ 300 grafemas", () => {
    const long = shareTargets({ ...mun, text: "á".repeat(600) }, ORIGIN).find((x) => x.id === "bluesky")!;
    const text = params(long.href).get("text")!;
    expect(graphemeCount(text)).toBeLessThanOrEqual(300);
    expect(text.endsWith("https://emenda.online/municipio/3509502")).toBe(true);
  });
  test("ordem estável", () => expect(shareTargets(mun, ORIGIN).map((x) => x.id)).toEqual(["whatsapp", "x", "telegram", "facebook", "linkedin", "bluesky"]));
});

describe("ogImagePath", () => {
  test.each<[ShareData, string]>([
    [mun, "/og/municipio/3509502.png"],
    [vot, "/og/votacao/2196833-395.png"],
    [{ ...voto, ogId: "2196833-395/204554" }, "/og/voto/2196833-395/204554.png"],
    [{ kind: "agenda", title: "x", url: "/agenda?dia=2026-10-28", ogId: "2026-10-28" }, "/og/agenda/2026-10-28.png"],
    [{ kind: "resultado", title: "x", url: "/votacao/1-2", ogId: "1-2" }, "/og/votacao/1-2.png"],
    [{ kind: "voto", title: "x", url: "/x", ogId: "../etc" }, "/og/default.png"],
    [{ kind: "pix", title: "x", url: "/pix" }, "/og/default.png"],
    [{ kind: "deputado", title: "x", url: "/deputado/1" }, "/og/default.png"], // sem ogId
    [{ kind: "uf", title: "x", url: "/uf/SP", ogId: "SP", image: "/custom.png" }, "/custom.png"],
  ])("%#", (d, out) => expect(ogImagePath(d)).toBe(out));
});

describe("votoShare", () => {
  test("monta link ?dep e rótulo do deputado", () => {
    const d = votoShare({ votacaoId: "2196833-395", titulo: "PEC 45/2019", deputado: { id: 204554, nome: "Tabata Amaral", siglaPartido: "PSB", siglaUf: "SP" }, voto: "Sim", placar: { sim: 382, nao: 118, outros: 3 } });
    expect(d).toMatchObject({ kind: "voto", url: "/votacao/2196833-395?dep=204554", ogId: "2196833-395/204554", pessoa: "Tabata Amaral (PSB-SP)", voto: "Sim" });
    expect(buildMessage(d)).toMatch(/Tabata Amaral \(PSB-SP\) votou Sim em “PEC 45\/2019”/);
  });
});

describe("agenda e resultado", () => {
  test.each([
    ["2026-10-28", "2026-10-28", "Hoje"],
    ["2026-10-29", "2026-10-28", "Amanhã"],
    ["2026-10-27", "2026-10-28", "Ontem"],
    ["2026-10-30", "2026-10-28", "Na sexta-feira (30/10)"],
    ["2026-11-01", "2026-10-28", "No domingo (01/11)"],
  ])("quandoLabel(%p, hoje=%p) = %p", (dia, hoje, out) => expect(quandoLabel(dia, hoje)).toBe(out));

  test("um item: artigo certo e apelido", () => {
    expect(buildMessage({ kind: "agenda", title: "PL 2630/2020 (Fake News)", url: "/agenda", quando: "Hoje", casa: "Plenário da Câmara" }))
      .toBe("🗳️ Hoje o Plenário da Câmara vota o PL 2630/2020 (Fake News). Acompanhe:");
    expect(buildMessage({ kind: "agenda", title: "PEC 45/2019", url: "/agenda", quando: "Amanhã", casa: "Plenário do Senado" }))
      .toBe("🗳️ Amanhã o Plenário do Senado vota a PEC 45/2019. Acompanhe:");
  });
  test("vários itens", () => {
    const m = buildMessage({ kind: "agenda", title: "Pauta da semana", url: "/agenda", quando: "Nesta semana", casa: "Congresso",
      items: [{ hora: "13:55", sigla: "PL 1/2026", titulo: "" }, { hora: "", sigla: "PEC 2/2026", titulo: "" }, { hora: "", sigla: "MPV 3/2026", titulo: "" }, { hora: "", sigla: "PLP 4/2026", titulo: "" }] });
    expect(m).toBe("🗳️ Nesta semana o Congresso vota: PL 1/2026, PEC 2/2026, MPV 3/2026 e mais 1. Acompanhe:");
  });
  test("resultado", () => {
    expect(buildMessage({ kind: "resultado", title: "PEC 45/2019", url: "/votacao/1-2", resultado: "aprovada", votes: { sim: 375, nao: 113, outros: 4 } }))
      .toBe("✅ Resultado: PEC 45/2019 aprovada 375×113. Veja como cada deputado votou:");
    expect(buildMessage({ kind: "resultado", title: "PL 1/2026", url: "/votacao/1-2", resultado: "rejeitada" }))
      .toBe("❌ Resultado: PL 1/2026 rejeitada. Veja como cada deputado votou:");
  });
  test("agendaEventoUrl", () => expect(agendaEventoUrl("2026-10-28", "camara-123")).toBe("/agenda?dia=2026-10-28&evento=camara-123"));
});
