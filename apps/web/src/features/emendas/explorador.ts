// Estado e dados do explorador /emendas: filtros na URL, carga sob demanda, fotos de parlamentares.
import { TIPOS_EMENDA, UFS, type TipoEmenda } from "@emenda/contracts";
import { useInView } from "motion/react";
import { useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { cam, mapSenadores, sen, type DeputadoLista, type SenadorResumo } from "@/features/legislativo/api";
import { useCamaraTodas, useSenado } from "@/features/legislativo/hooks";
import { indiceParlamentares, type Dim, type Filtros } from "./historias";

const ehTipo = (s: string | null): s is TipoEmenda => !!s && s in TIPOS_EMENDA;

/** Filtros em `?tipo=&ano=&uf=` (links compartilhados reproduzem o recorte). */
export function useFiltros() {
  const [sp, setSp] = useSearchParams();
  const tipo = sp.get("tipo");
  const ano = Number(sp.get("ano")) || undefined;
  const uf = sp.get("uf")?.toUpperCase();
  const f = useMemo<Filtros>(() => ({
    tipo: ehTipo(tipo) ? tipo : undefined,
    ano,
    uf: uf && uf in UFS ? uf : undefined,
  }), [tipo, ano, uf]);
  const set = useCallback((patch: Partial<Record<Dim, string | number | undefined>>) => setSp((p) => {
    const n = new URLSearchParams(p);
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === "") n.delete(k); else n.set(k, String(v)); }
    return n;
  }, { replace: true, preventScrollReset: true }), [setSp]);
  return { f, set, query: filtrosQuery(f) };
}

export function filtrosQuery(f: Filtros): string {
  const p = new URLSearchParams();
  if (f.tipo) p.set("tipo", f.tipo);
  if (f.ano) p.set("ano", String(f.ano));
  if (f.uf) p.set("uf", f.uf);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** `true` depois que o elemento chega perto da tela (uma vez). Usa-se para adiar buscas abaixo da dobra. */
export function useNaVista<T extends Element>(margin = "400px") {
  const ref = useRef<T>(null);
  const visto = useInView(ref, { once: true, margin: `${margin} 0px ${margin} 0px` as `${number}px` });
  return [ref, visto] as const;
}

/** Fotos/partidos: Câmara (57ª legislatura) + Senado em exercício. Mesmas chaves de cache do feed. */
export function useParlamentares(enabled: boolean) {
  const deps = useCamaraTodas<DeputadoLista>(enabled ? cam.deputados({ idLegislatura: 57, itens: 100 }) : null, 86_400_000);
  const sens = useSenado<SenadorResumo[]>(enabled ? sen.listaAtual() : null, mapSenadores);
  return useMemo(() => indiceParlamentares(deps.data ?? [], sens.data ?? []), [deps.data, sens.data]);
}

export const urlAutor = (codigo: string) => `/autor/${encodeURIComponent(codigo)}`;

/** Alterna valor exclusivo (mesmo chip desliga). */
export const alternar = <T,>(atual: T | undefined, v: T) => (atual === v ? undefined : v);
