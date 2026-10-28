// Botão leve (entra nos chunks das páginas). O diálogo, canvas e GIF vêm sob demanda.
import { lazy, Suspense, useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import type { ShareData } from "./links";

const load = () => import("./ShareDialog");
const ShareDialog = lazy(load);

export interface ShareButtonProps extends ShareData {
  /** Só ícone (linhas de tabela). */
  compact?: boolean;
  /** Também mostra o botão flutuante no celular. */
  fab?: boolean;
  label?: string;
  className?: string;
}

export function ShareButton({ compact, fab, label = "Compartilhar", className, ...rest }: ShareButtonProps) {
  const key = JSON.stringify(rest);
  const data = useMemo<ShareData>(() => rest, [key]); // estável entre renders com os mesmos dados
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const show = () => { setMounted(true); setOpen(true); };
  const pre = { onPointerEnter: () => void load(), onFocus: () => void load() };

  return (
    <>
      <button
        type="button" onClick={show} {...pre}
        aria-label={compact ? `${label}: ${data.title}` : undefined}
        title={compact ? label : undefined}
        className={className ?? (compact
          ? "press inline-flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg"
          : "press sheen inline-flex items-center gap-1.5 rounded-xl bg-verde px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgb(0_156_59/0.6)] transition hover:bg-verde-700")}
      >
        <Share2 className="size-4" aria-hidden />{!compact && label}
      </button>
      {fab && (
        <button
          type="button" onClick={show} {...pre} aria-label={`${label}: ${data.title}`}
          className="press fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[45] flex size-14 items-center justify-center rounded-full bg-verde text-white shadow-[0_12px_32px_-8px_rgb(0_156_59/0.7)] lg:hidden"
        >
          <Share2 className="size-6" aria-hidden />
        </button>
      )}
      {mounted && <Suspense fallback={null}><ShareDialog data={data} open={open} onOpenChange={setOpen} /></Suspense>}
    </>
  );
}
