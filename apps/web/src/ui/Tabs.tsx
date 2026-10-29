import * as R from "@radix-ui/react-tabs";
import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { formatNumber } from "@/lib/format";

export interface TabDef { id: string; label: ReactNode; content: ReactNode; count?: number }

/** Abas sincronizadas com `?tab=` (substitui histórico, preserva outros parâmetros). */
export function Tabs({ tabs, param = "tab" }: { tabs: TabDef[]; param?: string }) {
  const [sp, setSp] = useSearchParams();
  const lid = useId();
  const first = tabs[0]?.id ?? "";
  const cur = tabs.some((t) => t.id === sp.get(param)) ? sp.get(param)! : first;
  const set = (v: string) =>
    setSp((p) => {
      const n = new URLSearchParams(p);
      if (v === first) n.delete(param); else n.set(param, v);
      return n;
    }, { replace: true, preventScrollReset: true });
  return (
    <R.Root value={cur} onValueChange={set}>
      <R.List aria-label="Seções" className="relative mb-5 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {tabs.map((t) => (
          <R.Trigger
            key={t.id}
            value={t.id}
            className="relative shrink-0 whitespace-nowrap px-3.5 py-2.5 text-sm font-semibold text-muted transition hover:text-fg data-[state=active]:text-fg"
          >
            {t.label}
            {t.count !== undefined && (
              <span data-num className="ml-1.5 inline-block rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] tabular text-muted">{formatNumber(t.count)}</span>
            )}
            {cur === t.id && <motion.span layoutId={`tab-${lid}`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-verde" />}
          </R.Trigger>
        ))}
      </R.List>
      {tabs.map((t) => (
        <R.Content key={t.id} value={t.id} className="focus-visible:outline-none">
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            {t.content}
          </motion.div>
        </R.Content>
      ))}
    </R.Root>
  );
}
