// Como o parlamentar votou nas pautas de grande repercussão (curadoria em legislativo/pautas.ts).
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router";
import { Badge, Card, EmptyState, ExternalLink, Spinner, VoteBadge, camara, formatDate } from "@/ui";
import { fetchJson } from "@/lib/data";
import { cam, fontes, type Pagina, type VotacaoLista, type VotacaoSenado } from "@/features/legislativo/api";
import { PAUTAS, type Pauta } from "@/features/legislativo/pautas";
import type { VotoCamara } from "@/features/legislativo/votacao";
import { escolherVotacaoFinal, pautaDoSenado } from "./resumo";

export interface VotoPauta { pauta: Pauta; voto: string | null; data?: string; href?: string; externo?: boolean }

const DICA = "Pautas escolhidas por grande repercussão pública, com curadoria neutra. Mostramos a votação nominal de mérito mais recente no plenário. “Sem registro” = ausente, de licença ou fora do mandato no dia.";

/** Deputado: votações de cada pauta (/proposicoes/{id}/votacoes) -> votos (/votacoes/{id}/votos). */
export function usePautasDeputado(id: number) {
  const listas = useQueries({
    queries: PAUTAS.map((p) => ({
      queryKey: ["camara", cam.votacoesProposicao(p.camaraId)],
      queryFn: ({ signal }: { signal: AbortSignal }) => camara<VotacaoLista[]>(cam.votacoesProposicao(p.camaraId), signal),
      staleTime: 86_400_000, retry: 0,
    })),
  });
  const finais = PAUTAS.map((_, i) => (listas[i]?.data ? escolherVotacaoFinal(listas[i]!.data!) : null));
  const votos = useQueries({
    queries: finais.map((v) => ({
      queryKey: ["camara-pagina", v ? cam.votos(v.id) : null],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchJson<Pagina<VotoCamara>>(`/api/camara${cam.votos(v!.id)}`, signal),
      enabled: !!v, staleTime: 86_400_000, retry: 0,
    })),
  });
  const carregando = listas.some((q) => q.isPending) || votos.some((q, i) => !!finais[i] && q.isPending);
  const itens: VotoPauta[] = PAUTAS.flatMap((pauta, i) => {
    const v = finais[i];
    if (!v) return [];
    const dados = votos[i]?.data?.dados;
    const voto = dados ? (dados.find((x) => x.deputado_.id === id)?.tipoVoto ?? "Sem registro") : null;
    return [{ pauta, voto, data: v.data, href: `/votacao/${v.id}` }];
  });
  return { itens, carregando };
}

/** Senador: casa as votações do período com as pautas pela identificação ("PL 2903/2023"). */
export function pautasSenador(vs: readonly VotacaoSenado[]): VotoPauta[] {
  const m = new Map<string, VotoPauta>();
  for (const v of [...vs].sort((a, b) => b.dataSessao.localeCompare(a.dataSessao))) {
    const p = pautaDoSenado(v.identificacao);
    if (!p || m.has(p.apelido)) continue;
    m.set(p.apelido, { pauta: p, voto: v.votos?.[0]?.siglaVotoParlamentar ?? "Sem registro", data: v.dataSessao, href: fontes.materiaSenado(v.codigoMateria)[0]!.href, externo: true });
  }
  return [...m.values()];
}

export function CardPautas({ itens, carregando }: { itens: VotoPauta[]; carregando?: boolean }) {
  const ord = useMemo(() => [...itens].sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "")), [itens]);
  return (
    <Card title="Como votou nas pautas mais polêmicas" tip={DICA}>
      {carregando && <Spinner label="Lendo votações…" />}
      {!carregando && ord.length === 0 && <EmptyState title="Nenhuma votação nominal dessas pautas no período." />}
      <ul className="divide-y divide-line">
        {ord.map((x) => (
          <li key={x.pauta.apelido} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className="min-w-0">
              <span className="font-medium">{x.pauta.apelido}</span> <Badge>{x.pauta.tema}</Badge>
              <span className="block text-xs text-muted">
                {x.pauta.sigla} {x.pauta.numero}/{x.pauta.ano}{x.data ? ` · votação de ${formatDate(x.data)}` : ""} ·{" "}
                {x.href ? (x.externo ? <ExternalLink href={x.href}>detalhes</ExternalLink> : <Link className="link" to={x.href}>ver placar</Link>) : null}
              </span>
            </span>
            {x.voto ? <VoteBadge voto={x.voto} /> : <Spinner label="" />}
          </li>
        ))}
      </ul>
    </Card>
  );
}
