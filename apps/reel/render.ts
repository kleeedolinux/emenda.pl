// Frame-by-frame renderer: headless Chrome (DevTools Protocol) -> PNG frames -> ffmpeg.
// Zero npm deps. Usage:
//   bun apps/reel/render.ts --w 1920 --h 1080 --out media/emenda-online-reel-16x9.mp4 [--fps 30] [--audio file.wav]
//   bun apps/reel/render.ts --w 1920 --h 1080 --still 29.5 --out media/reel-poster.png
// CHROME env = chrome/chromium binary (default: Playwright's cached headless shell).
import { spawn } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname, extname } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce<string[][]>((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1] ?? ""]] : a), []),
);
const W = +(args.w ?? 1920), H = +(args.h ?? 1080), FPS = +(args.fps ?? 30), DUR = +(args.dur ?? 30);
const OUT = resolve(args.out ?? "out.mp4");
const ROOT = resolve(dirname(new URL(import.meta.url).pathname));

function findChrome(): string {
  if (process.env.CHROME) return process.env.CHROME;
  const base = join(homedir(), ".cache/ms-playwright");
  for (const d of existsSync(base) ? readdirSync(base).sort().reverse() : []) {
    for (const p of [join(base, d, "chrome-headless-shell-linux64/chrome-headless-shell"), join(base, d, "chrome-linux64/chrome")])
      if (existsSync(p)) return p;
  }
  for (const p of ["/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/chromium-browser"]) if (existsSync(p)) return p;
  throw new Error("Chrome not found; set CHROME=/path/to/chrome");
}

// static server for apps/reel (fetch + fonts need http)
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname);
    const f = Bun.file(join(ROOT, p));
    return new Response(f, { headers: { "content-type": MIME[extname(p)] ?? "application/octet-stream" } });
  },
});

const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(findChrome(), [
  "--headless", `--remote-debugging-port=${port}`, "--no-sandbox", "--hide-scrollbars", "--mute-audio",
  "--force-device-scale-factor=1", "--font-render-hinting=none", `--window-size=${W},${H}`, "about:blank",
], { stdio: "ignore" });

async function wsUrl(): Promise<string> {
  for (let i = 0; i < 100; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const pg = l.find((t: any) => t.type === "page");
      if (pg) return pg.webSocketDebuggerUrl;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error("chrome did not start");
}
const ws = new WebSocket(await wsUrl());
await new Promise((ok) => (ws.onopen = ok));
let id = 0;
const pending = new Map<number, (v: any) => void>();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data as string);
  if (d.id && pending.has(d.id)) { pending.get(d.id)!(d); pending.delete(d.id); }
};
const cdp = (method: string, params: any = {}) =>
  new Promise<any>((ok, bad) => {
    const i = ++id;
    pending.set(i, (d) => (d.error ? bad(new Error(method + ": " + d.error.message)) : ok(d.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evalJs = async (expr: string) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;

await cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const logo = args.logo ? `&logo=${encodeURIComponent(args.logo)}` : "";
await cdp("Page.navigate", { url: `http://127.0.0.1:${server.port}/src/reel.html?w=${W}&h=${H}${logo}` });
for (let i = 0; i < 200 && !(await evalJs("window.reelReady === true")); i++) await Bun.sleep(100);
if (!(await evalJs("window.reelReady === true"))) throw new Error("page not ready");

const shot = async (t: number) => {
  await evalJs(`window.seek(${t})`);
  const r = await cdp("Page.captureScreenshot", { format: args.still ? "png" : "jpeg", quality: args.still ? undefined : 95, clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  return Buffer.from(r.data, "base64");
};

if (args.still) {
  await Bun.write(OUT, await shot(+args.still));
  console.log("wrote", OUT);
} else {
  const N = Math.round(DUR * FPS);
  const ff = ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-"];
  if (args.audio) ff.push("-i", resolve(args.audio));
  ff.push("-vf", "scale=in_range=full:out_range=tv,format=yuv420p", "-color_range", "tv", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", String(FPS));
  if (args.audio) ff.push("-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-shortest");
  ff.push("-t", String(DUR), "-movflags", "+faststart", OUT);
  const enc = spawn("ffmpeg", ff, { stdio: ["pipe", "ignore", "inherit"] });
  const t0 = performance.now();
  for (let f = 0; f < N; f++) {
    const buf = await shot(f / FPS);
    if (!enc.stdin.write(buf)) await new Promise((ok) => enc.stdin.once("drain", ok));
    if (f % 90 === 0) console.log(`frame ${f}/${N} ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  }
  enc.stdin.end();
  await new Promise((ok) => enc.on("close", ok));
  console.log("wrote", OUT);
}
ws.close();
chrome.kill();
server.stop();
process.exit(0);
