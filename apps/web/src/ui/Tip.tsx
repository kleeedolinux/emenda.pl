import * as T from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import { useState, type ReactNode } from "react";
import { GLOSSARIO, termo } from "./glossario";

export { GLOSSARIO };

/** Ícone de informação com tooltip acessível (hover, foco e toque). */
export function Tip({ content, children, label = "Mais informações" }: { content: ReactNode; children?: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <T.Provider delayDuration={150}>
      <T.Root open={open} onOpenChange={setOpen}>
        <T.Trigger asChild>
          <button
            type="button"
            aria-label={children ? undefined : label}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
            className={
              children
                ? "cursor-help underline decoration-dotted decoration-muted/70 underline-offset-4 hover:decoration-accent"
                : "inline-flex size-5 shrink-0 cursor-help items-center justify-center rounded-full align-middle text-muted transition hover:text-accent"
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
