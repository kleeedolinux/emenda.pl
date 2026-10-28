import clsx from "clsx";
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionStyle } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { spring } from "./tokens";

/** Props de microinteração para botões/links `motion.*`: hover sobe, press afunda. */
export const pressable = {
  whileHover: { y: -1.5 },
  whileTap: { scale: 0.97, y: 0 },
  transition: spring.snappy,
} as const;
/** Cartões: elevação suave no hover. */
export const liftable = {
  whileHover: { y: -3 },
  whileTap: { scale: 0.99 },
  transition: spring.lift,
} as const;

const finePointer = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: fine)").matches;

/** Atração magnética leve ao ponteiro (desligada em toque e reduced-motion). */
export function Magnetic({ children, strength = 0.25, className }: { children: ReactNode; strength?: number; className?: string }) {
  const reduce = useReducedMotion();
  const x = useSpring(0, spring.lift), y = useSpring(0, spring.lift);
  const on = !reduce;
  return (
    <motion.span
      className={clsx("inline-block", className)}
      style={on ? { x, y } : undefined}
      onPointerMove={(e) => {
        if (!on || !finePointer()) return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * strength);
        y.set((e.clientY - r.top - r.height / 2) * strength);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
    >
      {children}
    </motion.span>
  );
}

/** Desloca o conteúdo conforme a rolagem (`speed` px por viewport). */
export function Parallax({ children, speed = 40, className, style }: { children: ReactNode; speed?: number; className?: string; style?: MotionStyle }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [speed, -speed]);
  return <motion.div ref={ref} className={className} style={reduce ? style : { ...style, y }}>{children}</motion.div>;
}

/** Barra de progresso de leitura (cores da bandeira), fixa no topo. */
export function ScrollProgress({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  // Listener passivo próprio: só lê medidas quando há rolagem (sem medição por quadro).
  const progress = useMotionValue(0);
  useEffect(() => {
    if (reduce) return;
    const on = () => { const max = document.documentElement.scrollHeight - innerHeight; progress.set(max > 0 ? scrollY / max : 0); };
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, [reduce, progress]);
  const scaleX = useSpring(progress, { stiffness: 200, damping: 30, restDelta: 0.001 });
  const opacity = useTransform(progress, [0, 0.02], [0, 1]);
  if (reduce) return null;
  return <motion.div aria-hidden className={clsx("pointer-events-none fixed inset-x-0 top-0 z-[110] h-[3px] origin-left bandeira", className)} style={{ scaleX, opacity }} />;
}

/** Inclinação 3D sutil ao ponteiro (cartões de destaque). */
export function Tilt({ children, className, max = 6 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const rx = useMotionValue(0), ry = useMotionValue(0);
  const srx = useSpring(rx, spring.soft), sry = useSpring(ry, spring.soft);
  return (
    <motion.div
      className={className}
      style={reduce ? undefined : { rotateX: srx, rotateY: sry, transformPerspective: 900 }}
      onPointerMove={(e) => {
        if (reduce || !finePointer()) return;
        const r = e.currentTarget.getBoundingClientRect();
        ry.set(((e.clientX - r.left) / r.width - 0.5) * max * 2);
        rx.set(-((e.clientY - r.top) / r.height - 0.5) * max * 2);
      }}
      onPointerLeave={() => { rx.set(0); ry.set(0); }}
    >
      {children}
    </motion.div>
  );
}
