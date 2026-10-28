import { useQuery } from "@tanstack/react-query";
import { API_ORIGEM } from "./docs";
import type { Spec } from "./spec";

const FONTES = ["/v1/openapi.json", `${API_ORIGEM}/v1/openapi.json`];

async function carregar(): Promise<Spec> {
  for (const url of FONTES) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (!r.ok) continue;
      const j = (await r.json()) as Spec;
      if (j && typeof j.paths === "object") return j;
    } catch { /* tenta a próxima */ }
  }
  throw new Error("A especificação da API (/v1/openapi.json) não respondeu.");
}

export const useSpec = () => useQuery({ queryKey: ["openapi"], queryFn: carregar });
