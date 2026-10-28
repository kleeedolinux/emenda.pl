import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { duration, easing, staggerStep } from "./tokens";

/** Compat: curva padrão (use `easing.out`). */
export const ease = easing.out;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: duration.base + 0.1, ease: easing.out } },
};
export const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: staggerStep.base, delayChildren: 0.04 } } };

type As = "div" | "ul" | "ol" | "section" | "dl";

/** Contêiner que revela filhos (`<Reveal.Item>`) em cascata ao entrar na tela. */
export function Reveal({ children, className, as = "div", step = staggerStep.base }: { children: ReactNode; className?: string; as?: As; step?: number }) {
  const reduce = useReducedMotion();
  const M = motion[as];
  const v: Variants = step === staggerStep.base ? stagger : { hidden: {}, show: { transition: { staggerChildren: step, delayChildren: 0.04 } } };
  return (
    <M className={className} variants={v} initial={reduce ? false : "hidden"} whileInView="show" viewport={{ once: true, margin: "-40px" }}>
      {children}
    </M>
  );
}
Reveal.Item = function RevealItem({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" }) {
  const M = motion[as];
  return <M className={className} variants={fadeUp}>{children}</M>;
};
/** Alias semântico de `Reveal` para listas. */
export const Stagger = Reveal;

/**
 * Título com revelação palavra a palavra (máscara + subida). Leitores de tela recebem o texto inteiro.
 * `children` pode conter strings e elementos; strings são quebradas em palavras.
 */
export function RevealText({ children, className, delay = 0, step = 0.07, as = "h1" }: { children: ReactNode; className?: string; delay?: number; step?: number; as?: "h1" | "h2" | "p" }) {
  const reduce = useReducedMotion();
  const H = as;
  const parts: ReactNode[] = [];
  let i = 0;
  const word = (w: ReactNode, key: string) => {
    const d = delay + i++ * step;
    parts.push(
      <span key={key} className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom">
        <motion.span
          className="inline-block will-change-transform"
          initial={reduce ? false : { y: "105%", opacity: 0, rotate: 2 }}
          animate={{ y: "0%", opacity: 1, rotate: 0 }}
          transition={{ duration: duration.slower, ease: easing.expo, delay: d }}
        >
          {w}
        </motion.span>
      </span>,
      " ",
    );
  };
  const walk = (n: ReactNode, k: string) => {
    if (typeof n === "string") n.split(/\s+/).filter(Boolean).forEach((w, j) => word(w, `${k}-${j}`));
    else if (Array.isArray(n)) n.forEach((c, j) => walk(c, `${k}.${j}`));
    else if (n !== null && n !== undefined && n !== false) word(n, k);
  };
  walk(children, "w");
  return <H className={className}>{parts}</H>;
}
