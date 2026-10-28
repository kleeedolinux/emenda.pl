import { useState } from "react";
import { Check, ImageDown, Link2, Share2 } from "lucide-react";
import { toast } from "@/ui";
import { absoluteUrl, buildMessage, fileSlug, ogImagePath, shareTargets, type ShareData } from "./links";
import { NetIcon } from "./icons";

const btn = "press inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring";

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Botões de rede + copiar link + compartilhamento nativo + baixar imagem do card. */
export function ShareBar(d: ShareData & { className?: string }) {
  const url = absoluteUrl(d.url);
  const [copied, setCopied] = useState(false);
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    const ok = await copyText(url);
    toast(ok ? "Link copiado" : "Não foi possível copiar o link");
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1800); }
  };
  const native = async () => {
    try { await navigator.share({ title: d.title, text: buildMessage(d), url }); } catch { /* cancelado */ }
  };

  return (
    <div className={d.className}>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Compartilhar em">
        {shareTargets(d).map((t) => (
          <li key={t.id}>
            <a
              href={t.href} target="_blank" rel="noopener noreferrer"
              className="press flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface p-3 text-xs font-semibold transition hover:bg-surface-2"
            >
              <span className="flex size-10 items-center justify-center rounded-full text-white" style={{ background: t.color }}><NetIcon id={t.id} /></span>
              {t.label}
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={copy}>
          {copied ? <Check className="size-4 text-accent" aria-hidden /> : <Link2 className="size-4" aria-hidden />} Copiar link
        </button>
        {canNative && <button type="button" className={btn} onClick={native}><Share2 className="size-4" aria-hidden /> Mais opções</button>}
        <a className={btn} href={ogImagePath(d)} download={`${fileSlug(d)}-card.png`}><ImageDown className="size-4" aria-hidden /> Baixar imagem</a>
      </div>
    </div>
  );
}
