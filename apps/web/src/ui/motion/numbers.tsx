import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";
import { duration as D, easing } from "./tokens";

/**
 * Número que conta até `value` ao aparecer na tela; em mudanças posteriores
 * anima a partir do valor atual (sem voltar a zero). Leitores de tela leem só o valor final.
 */
export function CountUp({ value, format = (n) => formatNumber(Math.round(n)), duration = D.cinematic, className }: { value: number; format?: (n: number) => string; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? value : 0);
  const cur = useRef(v);
  useEffect(() => {
    if (reduce) { cur.current = value; setV(value); return; }
    if (!inView) return;
    const c = animate(cur.current, value, { duration, ease: easing.expo, onUpdate: (n) => { cur.current = n; setV(n); } });
    return () => c.stop();
  }, [inView, value, reduce, duration]);
  return (
    <span ref={ref} className={`tabular ${className ?? ""}`} aria-label={format(value)} role="text">
      <span aria-hidden>{format(v)}</span>
    </span>
  );
}

const DIGITS = "0123456789";

/**
 * Rolagem de dígitos (odômetro) para dinheiro que muda ao vivo. Só transform (GPU).
 * Use `aria-live="off"` no contêiner quando o valor muda com frequência.
 */
export function NumberRoll({ text, className }: { text: string; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={`tabular ${className ?? ""}`}>{text}</span>;
  const chars = [...text];
  return (
    <span className={`tabular inline-flex items-start leading-[1.15em] ${className ?? ""}`} aria-label={text} role="text">
      {chars.map((ch, i) => {
        const key = chars.length - i; // alinhado pela direita: casas estáveis
        const d = DIGITS.indexOf(ch);
        if (d < 0) return <span key={`c${key}`} aria-hidden className="inline-block h-[1.15em] whitespace-pre">{ch}</span>;
        return (
          <span key={`d${key}`} aria-hidden className="relative inline-block h-[1.15em] overflow-hidden leading-[1.15em]" style={{ width: "1ch" }}>
            <span
              className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ transform: `translateY(${-d * 10}%)` }}
            >
              {[...DIGITS].map((x) => <span key={x} className="block h-[1.15em] shrink-0 text-center">{x}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}
