import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";

export const ease = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease } },
};
export const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };

/** Contêiner que revela filhos (`<Reveal.Item>`) em cascata ao entrar na tela. */
export function Reveal({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "ul" | "section" }) {
  const reduce = useReducedMotion();
  const M = motion[as];
  return (
    <M className={className} variants={stagger} initial={reduce ? false : "hidden"} whileInView="show" viewport={{ once: true, margin: "-40px" }}>
      {children}
    </M>
  );
}
Reveal.Item = function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div className={className} variants={fadeUp}>{children}</motion.div>;
};
