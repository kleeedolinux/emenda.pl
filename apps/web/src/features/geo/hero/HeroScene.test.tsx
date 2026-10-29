// Regressão (celular): o canvas das partículas cobre a seção inteira, sem caixa medida no mapa
// (a entrada do mapa é transform e o ResizeObserver não vê: a caixa ficava pequena e cortava as partículas),
// e sem `desynchronized` (canvas de baixa latência quebra a composição com transparência no Android).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { act, render } from "@testing-library/react";
import HeroScene from "./HeroScene";

const ctxOpts: unknown[] = [];
let rafs = 0;
const orig = {
  getContext: HTMLCanvasElement.prototype.getContext,
  raf: globalThis.requestAnimationFrame,
  IO: globalThis.IntersectionObserver,
  RO: globalThis.ResizeObserver,
  Path2D: (globalThis as { Path2D?: unknown }).Path2D,
  matchMedia: window.matchMedia,
  rect: Element.prototype.getBoundingClientRect,
};

beforeAll(() => {
  // Layout de celular: seção 390x900; o mapa (no meio da animação de entrada) ocupa uma caixa menor.
  Element.prototype.getBoundingClientRect = function () {
    const big = this.tagName === "SECTION";
    const [x, y, w, h] = big ? [0, 0, 390, 900] : [120, 400, 150, 140];
    return { left: x, top: y, x, y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} } as DOMRect;
  };
  const ctx = new Proxy({}, { get: (_, k) => (k === "getImageData" ? () => ({ data: [] }) : () => ctx), set: () => true });
  HTMLCanvasElement.prototype.getContext = function (_: string, o?: unknown) { ctxOpts.push(o); return ctx as never; } as never;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { rafs++; void cb; return rafs; }) as never;
  window.requestAnimationFrame = globalThis.requestAnimationFrame;
  class IO { constructor(private cb: IntersectionObserverCallback) {} observe() { this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as never); } disconnect() {} unobserve() {} }
  class RO { observe() {} disconnect() {} unobserve() {} }
  globalThis.IntersectionObserver = IO as never;
  globalThis.ResizeObserver = RO as never;
  (globalThis as { Path2D?: unknown }).Path2D = class {};
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce") ? false : false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never;
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = orig.getContext;
  globalThis.requestAnimationFrame = orig.raf;
  globalThis.IntersectionObserver = orig.IO;
  globalThis.ResizeObserver = orig.RO;
  (globalThis as { Path2D?: unknown }).Path2D = orig.Path2D;
  window.matchMedia = orig.matchMedia;
  Element.prototype.getBoundingClientRect = orig.rect;
});

describe("HeroScene no celular", () => {
  test("canvas cobre a seção (sem caixa medida), contexto sem desynchronized, loop rodando quando visível", async () => {
    const section = document.createElement("section");
    const anchor = document.createElement("div");
    document.body.append(section, anchor);
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<HeroScene section={section} anchor={anchor} pesoPorUf={{ BA: 9, SP: 14 }} />, { container: section }); });
    await act(async () => { window.dispatchEvent(new Event("resize")); await new Promise((ok) => setTimeout(ok, 20)); });
    const canvases = [...section.querySelectorAll("canvas")];
    expect(canvases.length).toBeGreaterThan(0);
    for (const c of canvases) {
      expect(c.className).toContain("inset-0");
      expect(c.className).toContain("size-full");
      expect([c.style.left, c.style.top, c.style.width, c.style.height]).toEqual(["", "", "", ""]);
    }
    expect(ctxOpts.some((o) => !!(o as { desynchronized?: boolean } | undefined)?.desynchronized)).toBe(false);
    expect(rafs).toBeGreaterThan(0);
    r.unmount();
  });
});
