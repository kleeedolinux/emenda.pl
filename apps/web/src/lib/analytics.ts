// Analytics próprio e anônimo (sem terceiros). Cookie first-party `ep_vid` é gerido pelo Worker.
// Base legal: legítimo interesse (LGPD art. 7º, IX; art. 10). Ativo por padrão, com opt-out.
// Desliga com "Desativar" (persistido) ou Do Not Track / Global Privacy Control.
import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { fetchJson } from "./data";

/** Estado do aviso: lido ("ciente"), opt-out ("desativado") ou ainda não visto. */
export type Aviso = "ciente" | "desativado" | null;
const KEY = "emenda:consent";

/** Lê o valor persistido; aceita os valores do modelo antigo (aceito/recusado). */
export function parseAviso(raw: string | null): Aviso {
  if (raw === "ciente" || raw === "aceito") return "ciente";
  if (raw === "desativado" || raw === "recusado") return "desativado";
  return null;
}

export function shouldTrack({ aviso, dnt }: { aviso: Aviso; dnt: boolean }): boolean {
  return !dnt && aviso !== "desativado";
}

export function hitPayload(path: string): string {
  return JSON.stringify({ path: path.split(/[?#]/)[0] || "/" });
}

/** Batida de presença (só mantém o contador "online"; não conta visita). */
export function pingPayload(path: string): string {
  return JSON.stringify({ path: path.split(/[?#]/)[0] || "/", ping: true });
}

export const dntAtivo = () =>
  typeof navigator !== "undefined" &&
  (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true);

const listeners = new Set<() => void>();
export function getAviso(): Aviso {
  try {
    return parseAviso(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}
/** Persiste a escolha. "desativado" para todos os hits a partir de agora (o cookie HttpOnly expira sozinho). */
export function setAviso(a: Exclude<Aviso, null>) {
  try { localStorage.setItem(KEY, a); } catch { /* modo privado */ }
  listeners.forEach((l) => l());
}
export function useAviso(): Aviso {
  return useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), getAviso, () => null);
}

let last = "";
/** Registra uma visualização de página (deduplica o mesmo caminho em sequência). */
export function sendHit(path: string) {
  if (!shouldTrack({ aviso: getAviso(), dnt: dntAtivo() })) return;
  const body = hitPayload(path);
  if (body === last) return;
  last = body;
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/hit", blob)) void fetch("/api/hit", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch { /* nunca quebra a navegação */ }
}

/** Mantém a presença enquanto a aba está visível (a janela "online" é de 5 min). */
export function sendPing(path: string) {
  if (!shouldTrack({ aviso: getAviso(), dnt: dntAtivo() })) return;
  try {
    void fetch("/api/hit", { method: "POST", body: pingPayload(path), keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
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
