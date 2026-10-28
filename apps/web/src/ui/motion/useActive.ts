import { useEffect, useState, type RefObject } from "react";

/** `true` enquanto o elemento está visível e a aba está ativa: pausa loops caros fora da tela. */
export function useActive(ref: RefObject<Element | null>, rootMargin = "80px"): boolean {
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  useEffect(() => {
    const on = () => setTab(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible && tab;
}
