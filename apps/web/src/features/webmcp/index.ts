// WebMCP: expõe as ferramentas da API ao agente do navegador (navigator.modelContext).
// Sem navigator.modelContext: não faz nada (nem rede). Nunca lança.
import type { Spec } from "@/features/apidocs/spec";
import { construirFerramentas, dadosDestaPagina, registrar, type Fetcher, type ModelContext } from "./ferramentas";

async function iniciar(mc: ModelContext) {
  const f: Fetcher = (u, init) => fetch(u, init);
  const pagina = () => ({ pathname: location.pathname, title: document.title, href: location.href });
  let tools = [dadosDestaPagina(f, pagina)];
  try {
    const res = await fetch("/v1/openapi.json", { headers: { accept: "application/json" } });
    if (res.ok) tools = [...construirFerramentas((await res.json()) as Spec, f), ...tools];
  } catch { /* só a ferramenta da página */ }
  registrar(mc, tools);
}

try {
  const mc = typeof navigator !== "undefined" ? (navigator as Navigator & { modelContext?: ModelContext }).modelContext : undefined;
  if (mc) {
    const go = () => { iniciar(mc).catch(() => {}); };
    if (typeof requestIdleCallback === "function") requestIdleCallback(go, { timeout: 3000 });
    else setTimeout(go, 0);
  }
} catch { /* ambiente sem WebMCP */ }
