// Diálogo de compartilhamento (chunk sob demanda). Canvas/GIF/vídeo carregam só ao abrir as abas de mídia.
import * as D from "@radix-ui/react-dialog";
import * as T from "@radix-ui/react-tabs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Download, Film, Image as ImageIcon, Link2, Loader2, Share2, Smartphone, X } from "lucide-react";
import { toast } from "@/ui";
import { buildMessage, fileSlug, ogImagePath, type ShareData } from "./links";
import { ShareBar } from "./ShareBar";
import type { Format } from "./scene";

type Studio = typeof import("./studio");
let studioP: Promise<Studio> | null = null;
const loadStudio = () => (studioP ??= import("./studio"));

const btn = "press inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50";
const primary = `${btn} sheen bg-verde text-white hover:bg-verde-700`;
const ghost = `${btn} border border-line bg-surface hover:bg-surface-2`;
const tab = "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-muted transition data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-sm sm:text-sm";

export default function ShareDialog({ data, open, onOpenChange }: { data: ShareData; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [msg, setMsg] = useState(() => buildMessage(data));
  useEffect(() => setMsg(buildMessage(data)), [data]);
  const d = useMemo<ShareData>(() => ({ ...data, text: msg }), [data, msg]);
  const [cur, setCur] = useState("link");

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm" />
        <D.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-[95] max-h-[92dvh] overflow-y-auto rounded-t-3xl border border-line bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(40rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6"
        >
          <header className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <D.Title className="text-lg font-bold">Compartilhar</D.Title>
              <p className="truncate text-sm text-muted">{data.title}</p>
            </div>
            <D.Close className="rounded-md p-1 text-muted hover:text-fg" aria-label="Fechar"><X className="size-5" /></D.Close>
          </header>
          <T.Root value={cur} onValueChange={setCur}>
            <T.List aria-label="Formato" className="mb-4 flex gap-1 rounded-xl bg-surface-2 p-1">
              <T.Trigger value="link" className={tab}><Link2 className="size-4" aria-hidden />Link</T.Trigger>
              <T.Trigger value="imagem" className={tab}><ImageIcon className="size-4" aria-hidden />Imagem</T.Trigger>
              <T.Trigger value="story" className={tab}><Smartphone className="size-4" aria-hidden />Story</T.Trigger>
              <T.Trigger value="reel" className={tab}><Film className="size-4" aria-hidden />GIF/Vídeo</T.Trigger>
            </T.List>
            <T.Content value="link" className="outline-none">
              <img src={ogImagePath(d)} alt="" width={1200} height={630} loading="lazy" className="mb-3 aspect-[1200/630] w-full rounded-2xl border border-line bg-surface-2 object-cover" />
              <label className="mb-3 block text-sm">
                <span className="mb-1 block font-medium">Mensagem</span>
                <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} className="w-full resize-y rounded-xl border border-line bg-surface p-3 text-sm" />
              </label>
              <ShareBar {...d} />
            </T.Content>
            <T.Content value="imagem" className="outline-none">{cur === "imagem" && <Still d={d} format="square" />}</T.Content>
            <T.Content value="story" className="outline-none">{cur === "story" && <Still d={d} format="story" />}</T.Content>
            <T.Content value="reel" className="outline-none">{cur === "reel" && <Reel d={d} />}</T.Content>
          </T.Root>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function useStudio(d: ShareData) {
  const [s, setS] = useState<{ studio: Studio; assets: Awaited<ReturnType<Studio["loadAssets"]>> } | null>(null);
  useEffect(() => {
    let live = true;
    loadStudio().then(async (studio) => { const assets = await studio.loadAssets(d); if (live) setS({ studio, assets }); })
      .catch(() => toast("Não foi possível preparar a imagem"));
    return () => { live = false; };
  }, [d.url]);
  return s;
}

async function deliver(studio: Studio, blob: Blob, name: string, d: ShareData, mode: "share" | "download") {
  if (mode === "download") { studio.download(blob, name); return; }
  const r = await studio.shareFile(blob, name, d);
  if (r === "downloaded") toast("Arquivo baixado — anexe na rede social");
}

function Still({ d, format }: { d: ShareData; format: Format }) {
  const s = useStudio(d);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!s || !ref.current) return;
    const [w, h] = s.studio.sizeFor(format);
    ref.current.width = w; ref.current.height = h;
    s.studio.paint(ref.current, d, s.studio.STILL_T, s.assets);
  }, [s, d, format]);

  const go = (mode: "share" | "download") => {
    const c = ref.current;
    if (!s || !c) return;
    c.toBlob((b) => b && deliver(s.studio, b, `${fileSlug(d)}-${format}.png`, d, mode), "image/png");
  };

  return (
    <div>
      <Preview format={format} ready={!!s}><canvas ref={ref} className="h-full w-full" aria-label={`Prévia ${format === "story" ? "story 1080×1920" : "quadrado 1080×1080"}`} /></Preview>
      <p className="mt-2 text-center text-xs text-muted">{format === "story" ? "1080×1920 · Instagram/WhatsApp Status" : "1080×1080 · feed e grupos"}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className={primary} disabled={!s} onClick={() => go("share")}><Share2 className="size-4" aria-hidden />Compartilhar</button>
        <button type="button" className={ghost} disabled={!s} onClick={() => go("download")}><Download className="size-4" aria-hidden />Baixar PNG</button>
      </div>
    </div>
  );
}

function Preview({ format, ready, children }: { format: Format; ready: boolean; children: React.ReactNode }) {
  return (
    <div className={`relative mx-auto overflow-hidden rounded-2xl border border-line bg-[#000c26] ${format === "story" ? "aspect-[9/16] h-[min(56dvh,34rem)]" : "aspect-square w-full max-w-[min(100%,26rem)]"}`}>
      {children}
      {!ready && <Loader2 className="absolute inset-0 m-auto size-6 animate-spin text-white/70" aria-label="Carregando" />}
    </div>
  );
}

type Job = { kind: "gif" | "video"; p: number; note?: string } | null;

function Reel({ d }: { d: ShareData }) {
  const s = useStudio(d);
  const [format, setFormat] = useState<Format>("square");
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  const [job, setJob] = useState<Job>(null);
  const [out, setOut] = useState<{ blob: Blob; url: string } | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => { abort.current?.abort(); }, []);
  useEffect(() => () => { if (out) URL.revokeObjectURL(out.url); }, [out]);
  useEffect(() => { setOut(null); }, [format, d]);

  // Prévia ao vivo em 540px.
  useEffect(() => {
    const c = ref.current;
    if (!s || !c) return;
    const [w, h] = s.studio.sizeFor(format, 540);
    c.width = w; c.height = h;
    if (reduce) { s.studio.paint(c, d, s.studio.STILL_T, s.assets); return; }
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => { s.studio.paint(c, d, ((now - t0) % 4000) / 4000, s.assets); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [s, d, format, reduce, out]);

  const run = async (kind: "gif" | "video") => {
    if (!s) return;
    abort.current?.abort();
    const ac = (abort.current = new AbortController());
    setOut(null); setJob({ kind, p: 0 });
    try {
      const prog = (p: number, note?: string) => setJob({ kind, p, note });
      const blob = kind === "gif" ? await s.studio.renderGif(d, format, prog, ac.signal) : await s.studio.recordVideo(d, format, prog, ac.signal);
      setOut({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast((e as Error).message || "Falha ao gerar a animação");
    } finally {
      if (abort.current === ac) setJob(null);
    }
  };

  const video = s ? s.studio.videoMime() : null;
  const name = out && s ? `${fileSlug(d)}-${format}.${s.studio.extOf(out.blob)}` : "";
  const mb = out ? (out.blob.size / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "";

  return (
    <div>
      <div className="mb-3 flex justify-center gap-1" role="radiogroup" aria-label="Proporção">
        {(["square", "story"] as const).map((f) => (
          <button key={f} type="button" role="radio" aria-checked={format === f} onClick={() => setFormat(f)}
            className={`rounded-lg px-3 py-1 text-xs font-semibold ${format === f ? "bg-verde text-white" : "border border-line text-muted"}`}>
            {f === "square" ? "Quadrado" : "Story 9:16"}
          </button>
        ))}
      </div>
      <Preview format={format} ready={!!s}>
        {out?.blob.type === "image/gif"
          ? <img src={out.url} alt="GIF gerado" className="h-full w-full" />
          : <canvas ref={ref} className="h-full w-full" aria-label="Prévia animada" />}
      </Preview>
      {job && (
        <div className="mt-3" role="status">
          <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-verde transition-[width]" style={{ width: `${Math.round(job.p * 100)}%` }} /></div>
          <p className="mt-1 text-center text-xs text-muted">{job.kind === "gif" ? "Gerando GIF" : "Gravando vídeo"}… {Math.round(job.p * 100)}%{job.note ? ` · ${job.note}` : ""}</p>
        </div>
      )}
      {out ? (
        <>
          <p className="mt-2 text-center text-xs text-muted">{out.blob.type === "image/gif" ? "GIF" : out.blob.type === "video/mp4" ? "MP4" : "WebM"} · {mb} MB</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className={primary} onClick={() => s && deliver(s.studio, out.blob, name, d, "share")}><Share2 className="size-4" aria-hidden />Compartilhar</button>
            <button type="button" className={ghost} onClick={() => s && deliver(s.studio, out.blob, name, d, "download")}><Download className="size-4" aria-hidden />Baixar</button>
          </div>
          <button type="button" className="mt-2 w-full text-center text-xs text-muted underline" onClick={() => setOut(null)}>Voltar à prévia</button>
        </>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className={primary} disabled={!s || !!job} onClick={() => run("gif")}>Gerar GIF</button>
          <button type="button" className={ghost} disabled={!s || !!job || !video} onClick={() => run("video")} title={video ? undefined : "Navegador sem suporte a gravação"}>
            Gravar {video?.startsWith("video/mp4") ? "MP4" : "vídeo"}
          </button>
        </div>
      )}
      <p className="mt-2 text-center text-xs text-muted">Animação de 4 s em loop · GIF até 3 MB (WhatsApp)</p>
    </div>
  );
}
