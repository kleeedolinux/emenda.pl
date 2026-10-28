import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { forwardRef, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Link } from "react-router";
import { duration, easing } from "./tokens";

// ---------- Elemento compartilhado (View Transitions API) ----------
/** Nome do título que "voa" de um cartão/linha para o PageHeader da página de destino. */
export const SHARED_TITLE = "page-title";
let lastShared = -Infinity;
const now = () => (typeof performance !== "undefined" ? performance.now() : 0);
/** `true` logo após uma navegação com elemento compartilhado: telas de destino pulam a entrada própria. */
export const inSharedTransition = () => now() - lastShared < 900;

const vtSupported = () => typeof document !== "undefined" && "startViewTransition" in document;
const prefersReduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Marca `el` como origem do título compartilhado (limpa marcas anteriores). */
function markShared(el: HTMLElement | null) {
  if (!el) return;
  document.querySelectorAll<HTMLElement>("[data-shared-title]").forEach((n) => (n.style.viewTransitionName = ""));
  const src = el.querySelector<HTMLElement>("[data-shared-source]") ?? el;
  src.style.viewTransitionName = SHARED_TITLE;
  lastShared = now();
}

/**
 * Link interno com transição de elemento compartilhado: o elemento com `data-shared-source`
 * (ou o próprio link) se transforma no título da página de destino. Sem suporte: link comum.
 */
export const TransitionLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof Link>>(function TransitionLink({ onClick, ...p }, ref) {
  const on = vtSupported() && !prefersReduced();
  return (
    <Link
      ref={ref}
      viewTransition={on}
      onClick={(e) => { onClick?.(e); if (on && !e.defaultPrevented) markShared(e.currentTarget); }}
      {...p}
    />
  );
});

/** Props para o título de destino (PageHeader). */
export const sharedTitleProps = { "data-shared-title": "", style: { viewTransitionName: SHARED_TITLE } } as const;

// ---------- Transição de página com "wipe" da marca ----------
/**
 * Envolve o conteúdo da rota: a cada `routeKey` novo, faixas verde/amarelo/azul varrem a tela
 * e o conteúdo sobe suavemente. Só transform/opacity. Pulado em reduced-motion e no 1º render.
 */
export function RouteTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const first = useRef(true);
  const [wipe, setWipe] = useState<string | null>(null);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduce || inSharedTransition()) return;
    setWipe(routeKey);
    const t = setTimeout(() => setWipe(null), 900);
    return () => clearTimeout(t);
  }, [routeKey, reduce]);
  const skip = reduce || first.current || inSharedTransition();
  return (
    <>
      <motion.div
        key={routeKey}
        initial={skip ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.slow, ease: easing.expo, delay: skip ? 0 : 0.16 }}
      >
        {children}
      </motion.div>
      <AnimatePresence>{wipe && <BrandWipe key={wipe} />}</AnimatePresence>
    </>
  );
}

const STRIPES = ["var(--color-verde)", "var(--color-amarelo)", "var(--color-azul)"] as const;
function BrandWipe() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[45] overflow-hidden">
      {STRIPES.map((c, i) => (
        <motion.div
          key={c}
          className="absolute inset-y-[-10%] left-0 w-[34vw] min-w-48 -skew-x-12 will-change-transform"
          style={{ background: c, opacity: 0.9 - i * 0.12 }}
          initial={{ x: "-120%" }}
          animate={{ x: "320%" }}
          transition={{ duration: 0.62, ease: easing.inOut, delay: i * 0.06 }}
        />
      ))}
    </div>
  );
}
