// Fontes da busca universal. Principal: v1/busca.json (índice pronto, cache de borda, 1 requisição no 1º foco).
// Reserva (índice ainda não publicado): índice estático de municípios + listas da Câmara/Senado + autores.json.
import { buscaPath, chaveNome, dataPath, UFS, type AutorResumo, type IndiceBusca, type SiglaUf, type Uf } from "@emenda/contracts";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { cam, dedupeDeputados, mapSenadores, sen, type DeputadoLista, type Partido, type SenadorResumo } from "@/features/legislativo/api";
import { useCamaraTodas, useSenado } from "@/features/legislativo/hooks";
import { tipoAutor } from "@/features/linguagem/linguagem";
import { fetchJson, HttpError, useApi, useMunicipiosIbge } from "@/lib/data";
import { itensDoIndice, itensEstados } from "./itens";
import type { ItemBusca, TipoBusca } from "./ranker";

const DIA = 86_400_000;

export function useIndiceBusca(ativo: boolean): { itens: ItemBusca[]; carregando: TipoBusca[] } {
  const pronto = useQuery<IndiceBusca, Error>({
    queryKey: ["json", buscaPath()],
    queryFn: ({ signal }) => fetchJson<IndiceBusca>(buscaPath(), signal),
    enabled: ativo,
    staleTime: DIA,
    gcTime: DIA,
    retry: (n, e) => !(e instanceof HttpError && e.status === 404) && n < 1,
  });
  const reserva = useIndiceReserva(ativo && pronto.isError);
  const itens = useMemo(() => (pronto.data ? itensDoIndice(pronto.data) : reserva.itens), [pronto.data, reserva.itens]);
  const carregando: TipoBusca[] = ativo && pronto.isPending ? ["cidade", "deputado", "senador", "partido"] : reserva.carregando;
  return { itens, carregando };
}

function useIndiceReserva(ativo: boolean): { itens: ItemBusca[]; carregando: TipoBusca[] } {
  const munis = useMunicipiosIbge(ativo);
  const deps = useCamaraTodas<DeputadoLista>(ativo ? cam.deputados({ idLegislatura: 57, itens: 100 }) : null, DIA);
  const sens = useSenado<SenadorResumo[]>(ativo ? sen.listaAtual() : null, mapSenadores);
  const parts = useCamaraTodas<Partido>(ativo ? cam.partidos() : null, DIA);
  const autores = useApi<AutorResumo[]>(ativo ? dataPath.autores() : null);

  const itens = useMemo(() => {
    const pago = new Map((autores.data ?? []).map((a) => [chaveNome(a.chave || a.nome), a.pago]));
    const out: ItemBusca[] = itensEstados();
    for (const m of munis.data ?? [])
      out.push({ id: `m:${m.id}`, tipo: "cidade", titulo: m.nome, extra: `${m.uf} ${UFS[m.uf as SiglaUf] ?? ""}`, sub: `Cidade · ${m.uf}`, href: `/municipio/${m.id}`, selo: m.uf, uf: m.uf, peso: 0 });
    const vistos = new Set<string>();
    for (const d of dedupeDeputados(deps.data ?? [])) {
      const c = chaveNome(d.nome);
      vistos.add(c);
      out.push({ id: `d:${d.id}`, tipo: "deputado", titulo: d.nome, extra: `${d.siglaPartido} ${d.siglaUf}`, sub: `Deputado(a) · ${d.siglaPartido}-${d.siglaUf}`, href: `/deputado/${d.id}`, img: d.urlFoto, selo: d.siglaPartido, uf: d.siglaUf, valor: pago.get(c), peso: 20 });
    }
    for (const s of sens.data ?? []) {
      const c = chaveNome(s.nome);
      vistos.add(c);
      out.push({ id: `s:${s.codigo}`, tipo: "senador", titulo: s.nome, extra: `${s.partido} ${s.uf}`, sub: `Senador(a) · ${s.partido}-${s.uf}`, href: `/senador/${s.codigo}`, img: s.foto, selo: s.partido, uf: s.uf, valor: pago.get(c) ?? pago.get(chaveNome(s.nomeCompleto)), peso: 25 });
    }
    for (const p of parts.data ?? [])
      out.push({ id: `p:${p.sigla}`, tipo: "partido", titulo: p.sigla, extra: p.nome, sub: p.nome, href: `/partido/${encodeURIComponent(p.sigla)}`, selo: p.sigla, peso: 30 });
    for (const a of autores.data ?? []) {
      if (a.pago <= 0 || vistos.has(chaveNome(a.chave || a.nome))) continue;
      const k = tipoAutor(a.nome);
      out.push({ id: `a:${a.codigo}`, tipo: "autor", titulo: a.nome, sub: k === "bancada" ? "Grupo de políticos do estado" : k === "comissao" ? "Comissão do Congresso" : k === "relator" ? "Orçamento secreto" : "Político (ex-parlamentar ou outro cargo)", href: `/autor/${encodeURIComponent(a.codigo)}`, valor: a.pago, peso: 5 });
    }
    return out;
  }, [munis.data, deps.data, sens.data, parts.data, autores.data]);

  const carregando: TipoBusca[] = [
    ...(ativo && munis.isPending ? (["cidade"] as const) : []),
    ...(ativo && deps.isPending ? (["deputado"] as const) : []),
    ...(ativo && sens.isPending ? (["senador"] as const) : []),
    ...(ativo && parts.isPending ? (["partido"] as const) : []),
  ];
  return { itens, carregando };
}

/** R$ por cidade só na reserva (o índice pronto já traz): lê os JSON das UFs visíveis. */
export function useValorCidades(itens: readonly ItemBusca[]): Map<string, number> {
  const ufs = [...new Set(itens.filter((x) => x.tipo === "cidade" && x.valor === undefined && x.uf).map((x) => x.uf!))].slice(0, 4);
  const qs = useQueries({
    queries: ufs.map((uf) => ({
      queryKey: ["json", dataPath.uf(uf)],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchJson<Uf>(dataPath.uf(uf), signal),
      staleTime: DIA,
      retry: 0,
    })),
  });
  const chave = qs.map((q) => q.dataUpdatedAt).join(",");
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const q of qs) for (const x of q.data?.municipios ?? []) m.set(`m:${x.ibge}`, x.pago);
    return m;
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
}
