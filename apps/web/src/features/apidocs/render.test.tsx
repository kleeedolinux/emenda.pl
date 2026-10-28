import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { FIXTURE } from "./fixture";
import { agruparPorTag } from "./docs";
import { Operacao } from "./Operacao";
import { Changelog, Limites, Mcp, Rss, WebMcp } from "./Secoes";

describe("seções da página /api (SSR)", () => {
  test("renderizam a spec sem erro", () => {
    const html = renderToString(
      <>
        <Limites spec={FIXTURE} />
        {agruparPorTag(FIXTURE).flatMap((g) => g.ops).map((o) => <Operacao key={o.id} item={o} />)}
        <Mcp spec={FIXTURE} />
        <WebMcp />
        <Rss spec={FIXTURE} />
        <Changelog spec={FIXTURE} />
      </>,
    );
    for (const s of ["/v1/municipios/{ibge}/emendas", "lista · CSV", "cache 12 h", "gastos_parlamentar", "claude mcp add --transport http emenda", "api.emenda.online/rss/deputado/204379.atom", "0.11.0", "dados_desta_pagina", "máx. 500"]) {
      expect(html).toContain(s);
    }
  });
});
