import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const KEY = "emenda:theme";

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}
const system = (): Theme =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const listeners = new Set<() => void>();
function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#070d0b" : "#009c3b");
  listeners.forEach((l) => l());
}

if (typeof document !== "undefined") {
  apply(stored() ?? system());
  matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => !stored() && apply(system()));
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => (document.documentElement.dataset.theme as Theme) ?? "light",
    () => "light" as Theme,
  );
  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, next); } catch { /* modo privado */ }
    apply(next);
  }, [theme]);
  return { theme, toggle };
}
