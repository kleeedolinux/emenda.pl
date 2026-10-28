// Analytics próprio e anônimo (sem terceiros). Cookie first-party é gerido pelo Worker.
// Regras: respeita Do Not Track; "recusado" no aviso LGPD = nenhum hit.
import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { fetchJson } from "./data";

export type Consent = "aceito" | "recusado" | null;
const KEY = "emenda:consent";

export function shouldTrack({ consent, dnt }: { consent: Consent; dnt: boolean }): boolean {
  return !dnt && consent !== "recusado";
}

export function hitPayload(path: string): string {
  return JSON.stringify({ path: path.split(/[?#]/)[0] || "/" });
}

const dnt = () =>
  typeof navigator !== "undefined" &&
  (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true);

const listeners = new Set<() => void>();
export function getConsent(): Consent {
  try {
    const v = localStorage.getItem(KEY);
    return v === "aceito" || v === "recusado" ? v : null;
  } catch {
    return null;
  }
}
export function setConsent(c: Exclude<Consent, null>) {
  try { localStorage.setItem(KEY, c); } catch { /* modo privado */ }
  listeners.forEach((l) => l());
}
export function useConsent(): Consent {
  return useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), getConsent, () => null);
}

let last = "";
/** Registra uma visualização de página (deduplica o mesmo caminho em sequência). */
export function sendHit(path: string) {
  if (!shouldTrack({ consent: getConsent(), dnt: dnt() })) return;
  const body = hitPayload(path);
  if (body === last) return;
  last = body;
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/hit", blob)) void fetch("/api/hit", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch { /* nunca quebra a navegação */ }
}

export interface Stats { online: number; hoje: number; semana: number; mes: number; total: number; serie: { dia: string; visitantes: number }[] }

/** Estatísticas públicas de audiência (atualiza a cada 30 s). */
export function useStats() {
  return useQuery<Stats, Error>({
    queryKey: ["stats"],
    queryFn: ({ signal }) => fetchJson<Stats>("/api/stats", signal),
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 0,
  });
}
