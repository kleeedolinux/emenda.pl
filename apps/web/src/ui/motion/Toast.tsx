import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2 } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";
import { spring } from "./tokens";

interface ToastItem { id: number; msg: ReactNode }
let items: ToastItem[] = [];
let seq = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** Confirmação discreta (ex.: "CSV baixado"). Some sozinha; anunciada a leitores de tela. */
export function toast(msg: ReactNode, ms = 2600) {
  const id = ++seq;
  items = [...items.slice(-2), { id, msg }];
  emit();
  setTimeout(() => { items = items.filter((t) => t.id !== id); emit(); }, ms);
}

/** Monte uma vez (AppShell). */
export function Toaster() {
  const list = useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => items, () => items);
  const reduce = useReducedMotion();
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[130] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout={!reduce}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={spring.bouncy}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-line glass px-4 py-2 text-sm font-medium shadow-xl"
          >
            <CheckCircle2 className="size-4 text-accent" aria-hidden />
            {t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
