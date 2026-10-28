import { describe, expect, test } from "bun:test";
import type { ShareData } from "./links";
import { qrMatrix } from "./qr";
import { drawScene, SIZES, type Format } from "./scene";
import { frameSchedule } from "./timeline";

/** Contexto 2D falso: registra fillText e mede 0,55·tamanho por caractere. */
function fakeCtx() {
  const texts: Array<{ s: string; x: number; y: number; font: string }> = [];
  let font = "10px sans";
  const grad = { addColorStop() {} };
  const target: Record<string, unknown> = {
    get font() { return font; }, set font(v: string) { font = v; },
    measureText: (s: string) => ({ width: [...s].length * Number(/(\d+)px/.exec(font)?.[1] ?? 10) * 0.55 }),
    fillText: (s: string, x: number, y: number) => texts.push({ s, x, y, font }),
    createLinearGradient: () => grad, createRadialGradient: () => grad,
  };
  const ctx = new Proxy(target, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => {}), set: (t, k, v) => { (t as Record<string | symbol, unknown>)[k] = v; return true; } });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

const base = { url: "/x", title: "Uma proposição com título bem longo para forçar a quebra em várias linhas na arte" };
const cases: ShareData[] = [
  { ...base, kind: "municipio", metric: { value: 98_765_432_10, format: "brl", label: "pagos" }, bars: [{ label: "A", value: 3 }, { label: "B", value: 1 }] },
  { ...base, kind: "votacao", votes: { sim: 382, nao: 118, outros: 13 } },
  { ...base, kind: "voto", voto: "Não", pessoa: "Fulana (PSB-SP)", votes: { sim: 1, nao: 2, outros: 0 } },
  { ...base, kind: "proposicao", subtitle: "Ementa ".repeat(40) },
];

describe("drawScene", () => {
  for (const format of ["square", "story"] as Format[]) {
    for (const d of cases) {
      test(`${format} · ${d.kind}: todos os quadros desenham sem erro e dentro da área`, () => {
        const [W, H] = SIZES[format];
        const a = { logo: null, qr: qrMatrix("https://emenda.online/x") };
        for (const t of frameSchedule(4000, 15).times) {
          const { ctx, texts } = fakeCtx();
          drawScene(ctx, W, H, d, t, a);
          for (const x of texts) {
            expect(x.y).toBeLessThanOrEqual(H / (W / 1080));
            expect(x.x).toBeGreaterThanOrEqual(-600); // textos centralizados na vinheta usam x relativo
          }
        }
      });
    }
  }

  test("imagem estática mostra título, marca e valor final", () => {
    const { ctx, texts } = fakeCtx();
    drawScene(ctx, 1080, 1080, cases[0]!, 0.74, { logo: null, qr: qrMatrix("x") });
    const all = texts.map((x) => x.s).join(" | ");
    expect(all).toContain("emenda");
    expect(all).toContain(".online");
    expect(all).toMatch(/R\$\s?98,8\smi/);
    expect(all).toContain("MUNICÍPIO");
  });
});
