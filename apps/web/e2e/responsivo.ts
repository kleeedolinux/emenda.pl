// Auditoria de responsividade: todas as rotas × larguras × motores (Chromium + WebKit) × estados.
// Uso: bun run audit:responsivo           (sobe o vite em :5299 com dados de produção)
//   BASE=http://localhost:5197            usa servidor já rodando
//   ENGINES=chromium|webkit  WIDTHS=360,1280  ROTAS=/deputado,/uf  CONC=6  SHOTS=1
// Sai com código 1 se houver qualquer achado. Relatório JSON em ~/.cache/emenda.pl/responsivo/.
import { chromium, webkit, type Browser, type Page } from "playwright-core";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { auditar, type Achado } from "./checks";
import { LARGURAS, LARGURAS_TEMA_ESCURO, MAX_CELULAR, ROTAS } from "./rotas";

const env = process.env;
const ENGINES = (env.ENGINES ?? "chromium,webkit").split(",");
const WIDTHS = env.WIDTHS ? env.WIDTHS.split(",").map(Number) : LARGURAS;
const FILTRO = env.ROTAS?.split(",");
const rotas = ROTAS.filter((r) => !FILTRO || FILTRO.some((f) => r.path.startsWith(f)));
const CONC = Number(env.CONC ?? 4);
const OUT = join(homedir(), ".cache/emenda.pl/responsivo");
const SHOTS = env.SHOTS === "1";
mkdirSync(OUT, { recursive: true });

// Sobreposições (busca, menu, dica) e estado "carregando" só nestas larguras: o layout delas não depende da rota.
const LARGURAS_OVERLAY = [320, 390, 768, 1280];
const LARGURAS_CARREGANDO = [360, 1280];
const ROTAS_OVERLAY = new Set(["/", "/deputado/204554", "/municipio/3550308", "/emendas"]);

async function servidor(): Promise<{ base: string; parar: () => void }> {
  if (env.BASE) return { base: env.BASE, parar: () => {} };
  const porta = 5299;
  const proc = Bun.spawn(["bunx", "vite", "--port", String(porta), "--strictPort"], {
    cwd: join(import.meta.dir, ".."),
    env: { ...env, EMENDA_PROXY: env.EMENDA_PROXY ?? "https://emenda.online" },
    stdout: "ignore",
    stderr: "inherit",
  });
  const base = `http://localhost:${porta}`;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(base)).ok) return { base, parar: () => proc.kill() }; } catch {}
    await Bun.sleep(500);
  }
  proc.kill();
  throw new Error("vite não subiu em " + base);
}

function chromiumPath(): string | undefined {
  if (env.CHROMIUM_PATH) return env.CHROMIUM_PATH;
  const dir = join(homedir(), ".cache/ms-playwright");
  if (!existsSync(dir)) return undefined;
  const c = readdirSync(dir).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()
    .map((d) => join(dir, d, "chrome-linux64/chrome")).find(existsSync);
  return c;
}

interface Tarefa { engine: string; largura: number; tema: "claro" | "escuro"; rotas: typeof rotas }
interface Linha { engine: string; largura: number; tema: string; rota: string; estado: string; check: string; msg: string }

async function rolarTudo(p: Page) {
  const h = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 700) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(50); }
  await p.waitForTimeout(700);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(250);
}

async function checar(p: Page, celular: boolean): Promise<Achado[]> {
  try { return await p.evaluate(auditar, { celular }); }
  catch (e) { return [{ check: "AUDIT-ERROR", msg: String(e).slice(0, 160) }]; }
}

// Diálogo/popover aberto: dentro da tela e sem rolagem horizontal interna.
async function checarFlutuante(p: Page, nome: string): Promise<Achado[]> {
  return p.evaluate((nome) => {
    const out: { check: string; msg: string }[] = [];
    const vw = document.documentElement.clientWidth, vh = innerHeight;
    for (const el of document.querySelectorAll<HTMLElement>("[role=dialog], [role=tooltip], [data-radix-popper-content-wrapper]")) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) out.push({ check: "OVERLAY", msg: `${nome}: fora da tela [${Math.round(r.left)},${Math.round(r.right)}x${Math.round(r.top)},${Math.round(r.bottom)}] vw=${vw} vh=${vh}` });
      if (el.scrollWidth > el.clientWidth + 1) out.push({ check: "OVERLAY", msg: `${nome}: rolagem horizontal interna sw=${el.scrollWidth} cw=${el.clientWidth}` });
    }
    return out;
  }, nome);
}

async function overlays(p: Page, celular: boolean): Promise<[string, Achado[]][]> {
  const res: [string, Achado[]][] = [];
  const abrir = async (nome: string, acao: () => Promise<unknown>) => {
    try {
      await acao();
      await p.waitForTimeout(500);
      res.push([nome, [...(await checarFlutuante(p, nome)), ...(await checar(p, celular))]]);
    } catch {}
    await p.keyboard.press("Escape").catch(() => {});
    await p.waitForTimeout(250);
  };
  await abrir("busca", () => p.getByRole("button", { name: /^Buscar/ }).first().click({ timeout: 2000 }));
  await abrir("menu", async () => {
    const b = p.getByRole("button", { name: "Abrir menu" });
    if (await b.isVisible()) await b.click({ timeout: 2000 });
  });
  await abrir("dica", async () => {
    const t = p.locator("main [data-state=closed][aria-describedby], main button[data-state=closed]").first();
    if (await t.count()) { await t.scrollIntoViewIfNeeded(); await t.hover({ timeout: 2000 }); await t.focus(); }
  });
  return res;
}

async function expandir(p: Page): Promise<number> {
  return p.evaluate(() => {
    let n = 0;
    for (const b of document.querySelectorAll<HTMLElement>("main button, main summary")) {
      const t = (b.textContent ?? "").trim();
      if (/^(ver|mostrar) (mais|tudo|todos|todas)|^\+ ?\d+ /i.test(t) && b.getAttribute("aria-expanded") !== "true") { b.click(); n++; }
    }
    return n;
  });
}

async function rodar(b: Browser, base: string, t: Tarefa): Promise<Linha[]> {
  const celular = t.largura <= MAX_CELULAR;
  const ctx = await b.newContext({
    viewport: { width: t.largura, height: celular ? 800 : 900 },
    deviceScaleFactor: 1,
    isMobile: celular,
    hasTouch: celular,
    reducedMotion: "no-preference",
  });
  await ctx.addInitScript(`try{localStorage.setItem("emenda:consent","ciente");localStorage.setItem("emenda:theme","${t.tema === "escuro" ? "dark" : "light"}")}catch{}`);
  const p = await ctx.newPage();
  const linhas: Linha[] = [];
  const reg = (rota: string, estado: string, achados: Achado[]) => {
    for (const a of achados) linhas.push({ engine: t.engine, largura: t.largura, tema: t.tema, rota, estado, ...a });
  };
  for (const r of t.rotas) {
    const t0 = Date.now();
    try {
      if (t.tema === "claro" && LARGURAS_CARREGANDO.includes(t.largura)) {
        await p.route("**/api/**", async (rt) => { await Bun.sleep(4000); await rt.continue().catch(() => {}); });
        await p.route("**/data/**", async (rt) => { await Bun.sleep(4000); await rt.continue().catch(() => {}); });
        await p.goto(base + r.path, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        await p.waitForTimeout(700);
        reg(r.path, "carregando", await checar(p, celular));
        await p.unrouteAll({ behavior: "ignoreErrors" });
      }
      // "networkidle" puro nunca chega em páginas com pulso de presença: teto de 8s depois do load.
      await p.goto(base + r.path, { waitUntil: "load", timeout: 40000 }).catch(() => {});
      await p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(600);
      await rolarTudo(p).catch(() => p.waitForTimeout(1500));
      const antes = await checar(p, celular);
      reg(r.path, "base", antes);
      if ((await expandir(p).catch(() => 0)) > 0) {
        await p.waitForTimeout(600);
        await rolarTudo(p).catch(() => {});
        const vistos = new Set(antes.map((a) => a.check + a.msg));
        reg(r.path, "expandido", (await checar(p, celular)).filter((a) => !vistos.has(a.check + a.msg)));
      }
      if (t.tema === "claro" && ROTAS_OVERLAY.has(r.path) && LARGURAS_OVERLAY.includes(t.largura))
        for (const [nome, ach] of await overlays(p, celular)) {
          const vistos = new Set(antes.map((a) => a.check + a.msg));
          reg(r.path, nome, ach.filter((a) => !vistos.has(a.check + a.msg)));
        }
      if (SHOTS && linhas.some((l) => l.rota === r.path)) {
        const nome = `${t.engine}-${t.largura}-${t.tema}-${r.path.replace(/[^a-z0-9]+/gi, "_")}.png`;
        await p.screenshot({ path: join(OUT, nome), fullPage: true }).catch(() => {});
      }
    } catch (e) {
      reg(r.path, "base", [{ check: "AUDIT-ERROR", msg: String(e).slice(0, 160) }]);
    }
    if (env.VERBOSE) console.error(`  ${t.engine} ${t.largura} ${r.path} ${Date.now() - t0}ms`);
  }
  await ctx.close();
  return linhas;
}

async function pool<T, R>(itens: T[], n: number, f: (t: T) => Promise<R>): Promise<R[]> {
  const res: R[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) { const t = itens[i++]!; res.push(await f(t)); }
  }));
  return res;
}

const { base, parar } = await servidor();
const inicio = Date.now();
const metade = Math.ceil(rotas.length / 2);
const blocos = rotas.length > 12 ? [rotas.slice(0, metade), rotas.slice(metade)] : [rotas];
const todas: Linha[] = [];
try {
  await Promise.all(ENGINES.map(async (engine) => {
    const b = engine === "webkit" ? await webkit.launch() : await chromium.launch({ executablePath: chromiumPath() });
    const tarefas: Tarefa[] = [];
    for (const largura of WIDTHS) {
      for (const rs of blocos) tarefas.push({ engine, largura, tema: "claro", rotas: rs });
      if (LARGURAS_TEMA_ESCURO.includes(largura)) for (const rs of blocos) tarefas.push({ engine, largura, tema: "escuro", rotas: rs });
    }
    let feitas = 0;
    for (const ls of await pool(tarefas, CONC, async (t) => {
      const ls = await rodar(b, base, t);
      console.error(`[${engine}] ${++feitas}/${tarefas.length} ${t.largura}px ${t.tema}: ${ls.length}`);
      return ls;
    })) todas.push(...ls);
    await b.close();
  }));
} finally {
  parar();
}

// Agrupa achados idênticos entre larguras/motores para leitura.
const grupos = new Map<string, { check: string; rota: string; estado: string; msg: string; onde: Set<string> }>();
for (const l of todas) {
  const msg = l.msg.replace(/\[[-\d,x]+\]|\b(vw|sw|cw|w|h|scrollX)=\d+|\d+(px|x\d+)/g, "#");
  const k = `${l.check}|${l.rota}|${l.estado}|${msg}`;
  const g = grupos.get(k) ?? { check: l.check, rota: l.rota, estado: l.estado, msg: l.msg, onde: new Set<string>() };
  g.onde.add(`${l.engine[0]}${l.largura}${l.tema === "escuro" ? "d" : ""}`);
  grupos.set(k, g);
}
const porCheck = new Map<string, number>();
for (const l of todas) porCheck.set(l.check, (porCheck.get(l.check) ?? 0) + 1);
for (const g of [...grupos.values()].sort((a, b) => a.check.localeCompare(b.check) || a.rota.localeCompare(b.rota)))
  console.log(`${g.check} ${g.rota} (${g.estado}) [${[...g.onde].join(" ")}] ${g.msg}`);
console.log("\nPor checagem:");
for (const [c, n] of [...porCheck].sort()) console.log(`  ${c}: ${n}`);
const arq = join(OUT, `relatorio-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(arq, JSON.stringify({ base, engines: ENGINES, larguras: WIDTHS, rotas: rotas.map((r) => r.path), achados: todas }, null, 1));
console.log(`\n${todas.length} achados (${grupos.size} distintos) em ${rotas.length} rotas × ${WIDTHS.length} larguras × ${ENGINES.join("+")} — ${Math.round((Date.now() - inicio) / 1000)}s\n${arq}`);
process.exit(todas.length ? 1 : 0);
