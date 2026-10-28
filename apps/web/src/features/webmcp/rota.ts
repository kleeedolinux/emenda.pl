import type { Rota } from "@/features/apidocs/spec";

const vazio = (v: unknown) => v === undefined || v === null || v === "";

/**
 * Monta a URL /v1 de uma ferramenta MCP. Regra idêntica à do servidor (Rust):
 * - segmento `{nome}` ausente/vazio ou igual a `omit[nome]` → corta ele e todos os seguintes;
 * - senão vira `map[nome][valor] ?? valor`, com encodeURIComponent;
 * - depois, `query` na ordem listada, só os presentes, chave e valor com encodeURIComponent.
 */
export function rotaUrl(rota: Rota, args: Record<string, unknown>): string {
  const saida: string[] = [];
  for (const seg of rota.path.split("/")) {
    const m = /^\{(.+)\}$/.exec(seg);
    if (!m) { saida.push(seg); continue; }
    const nome = m[1]!;
    const v = args[nome];
    if (vazio(v) || (rota.omit && nome in rota.omit && String(rota.omit[nome]) === String(v))) break;
    const s = String(v);
    saida.push(encodeURIComponent(rota.map?.[nome]?.[s] ?? s));
  }
  const q = (rota.query ?? [])
    .filter((k) => !vazio(args[k]))
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(args[k]))}`);
  const path = saida.join("/") || "/";
  return q.length ? `${path}?${q.join("&")}` : path;
}
