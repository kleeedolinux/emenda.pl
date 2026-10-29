import * as D from "@radix-ui/react-dialog";
import * as T from "@radix-ui/react-tooltip";
import { Info, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { GLOSSARIO, termo } from "./glossario";

export { GLOSSARIO };

const telaPequena = () => typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 639px)").matches;

/** Ícone de informação com tooltip acessível (hover, foco e toque). Em tela pequena, o toque abre um painel inferior. */
export function Tip({ content, children, label = "Mais informações" }: { content: ReactNode; children?: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  return (
    <T.Provider delayDuration={150}>
      <D.Root open={sheet} onOpenChange={setSheet}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-[100] bg-black/40" />
          <D.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-[101] rounded-t-2xl border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-[15px] leading-snug text-fg shadow-2xl">
            <div className="flex items-start gap-3">
              <D.Title className="min-w-0 flex-1 font-normal">{content}</D.Title>
              <D.Close aria-label="Fechar" className="-m-2 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:text-fg"><X className="size-5" aria-hidden /></D.Close>
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>
      <T.Root open={open && !sheet} onOpenChange={(o) => { if (!o || !telaPequena()) setOpen(o); }}>
        <T.Trigger asChild>
          <button
            type="button"
            aria-label={children ? undefined : label}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (telaPequena()) { setOpen(false); setSheet(true); } else setOpen((o) => !o); }}
            className={
              children
                ? "cursor-help underline decoration-dotted decoration-muted/70 underline-offset-4 hover:decoration-accent"
                : "relative inline-flex size-5 shrink-0 cursor-help before:absolute before:-inset-3 before:content-[''] items-center justify-center rounded-full align-middle text-muted transition hover:text-accent"
            }
          >
            {children ?? <Info className="size-3.5" aria-hidden />}
          </button>
        </T.Trigger>
        <T.Portal>
          <T.Content
            side="top"
            sideOffset={6}
            collisionPadding={12}
            className="z-[100] max-w-xs rounded-xl border border-line bg-surface px-3 py-2 text-[13px] leading-snug text-fg shadow-xl data-[state=delayed-open]:animate-in"
          >
            {content}
            <T.Arrow className="fill-surface" />
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}

/** Termo do glossário com definição em tooltip. `k` é a chave (caixa/acento indiferentes). */
export function Term({ k, children }: { k: string; children?: ReactNode }) {
  const def = termo(k);
  if (!def) return <>{children ?? k}</>;
  return <Tip content={def}>{children ?? k}</Tip>;
}

/** Atalho: tooltip a partir de chave do glossário, ou texto livre. */
export const tipOf = (k: string) => termo(k) ?? k;
