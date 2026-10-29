// Pré-carga do `bun test`: DOM (happy-dom) + stubs determinísticos para testes de componentes.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";

const nativeFetch = globalThis.fetch;
GlobalRegistrator.register({
  url: "http://localhost/", width: 1280, height: 800,
  // Sem rede: happy-dom não baixa scripts/CSS/imagens/iframes.
  settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true, handleDisabledFileLoadingAsSuccess: true, navigation: { disableChildFrameNavigation: true, disableChildPageNavigation: true } },
});
// Testes de rede/puros continuam usando o fetch do Bun (mockável por teste).
globalThis.fetch = nativeFetch;
(window as { fetch: typeof fetch }).fetch = nativeFetch;
// sendBeacon do happy-dom faz rede de verdade: em teste, só aceita.
Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: () => true });

/** `prefers-reduced-motion` controlável por teste: `setReducedMotion(true)` (notifica ouvintes, como o motion). */
let reduced = false;
const mqListeners = new Set<() => void>();
export const setReducedMotion = (v: boolean) => { reduced = v; mqListeners.forEach((l) => l()); };
window.matchMedia = ((query: string) => {
  const live = query.includes("prefers-reduced-motion");
  return {
    get matches() { return live ? reduced : false; },
    media: query,
    onchange: null,
    addEventListener: (_: string, l: () => void) => { if (live) mqListeners.add(l); },
    removeEventListener: (_: string, l: () => void) => { mqListeners.delete(l); },
    addListener: (l: () => void) => { if (live) mqListeners.add(l); },
    removeListener: (l: () => void) => { mqListeners.delete(l); },
    dispatchEvent: () => false,
  };
}) as unknown as typeof window.matchMedia;

/** Tudo "visível" de imediato: `whileInView`/`useInView` disparam sem rolagem. */
class IO {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    this.cb([{ isIntersecting: true, intersectionRatio: 1, target: el, boundingClientRect: el.getBoundingClientRect(), intersectionRect: el.getBoundingClientRect(), rootBounds: null, time: 0 } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
  root = null; rootMargin = ""; thresholds = [0];
}
globalThis.IntersectionObserver = IO as unknown as typeof IntersectionObserver;
window.IntersectionObserver = globalThis.IntersectionObserver;

// Sem WAAPI: o motion usa o laço JS (o `finished` rejeitado do happy-dom no cancel vira erro solto).
for (let p: object | null = window.HTMLElement.prototype; p; p = Object.getPrototypeOf(p)) {
  if (Object.prototype.hasOwnProperty.call(p, "animate")) delete (p as { animate?: unknown }).animate;
}

class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= RO as unknown as typeof ResizeObserver;

afterEach(() => {
  if (reduced) setReducedMotion(false);
  try { localStorage.clear(); } catch { /* sem storage */ }
});
