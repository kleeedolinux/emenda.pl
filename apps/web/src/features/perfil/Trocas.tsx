// Troca de partido: linha do tempo por parlamentar e lista da legislatura atual.
import { useQueries } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { Card, EmptyState, ErrorState, PartyBadge, Skeleton, Spinner, Tip, camara, formatDate } from "@/ui";
import { cam, fontes, type DeputadoLista, type HistoricoDeputado } from "@/features/legislativo/api";
import { useCamaraTodas } from "@/features/legislativo/hooks";
import { Fontes } from "@/features/legislativo/components";
import { trocasCamara, trocasDaLista, type Troca } from "./resumo";

export const TIP_JANELA =
  "Janela partidária: nos 30 dias que antecedem o prazo de filiação para a eleição seguinte, deputados podem trocar de partido sem perder o mandato (Lei 9.096/1995, art. 22-A). Fora dela, só com justa causa. Senadores, eleitos pelo voto majoritário, não perdem o mandato ao trocar.";

const mesAno = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** "PSL → PL em 03/2022" */
export function LinhaPartidos({ trocas, atual }: { trocas: Troca[]; atual?: string }) {
  if (!trocas.length) return <p className="text-sm text-muted">Sem troca de partido registrada{atual ? <> — sempre no <PartyBadge sigla={atual} /></> : null}.</p>;
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      <li><PartyBadge sigla={trocas[0]!.de} /></li>
      {trocas.map((t) => (
        <li key={t.data + t.para} className="flex items-center gap-2">
          <ArrowRight className="size-4 text-muted" aria-hidden />
          <span className="flex flex-col items-start"><PartyBadge sigla={t.para} /><span className="text-xs text-muted">{mesAno(t.data)}</span></span>
        </li>
      ))}
    </ol>
  );
}

export function CardTrocas({ trocas, atual, fonte }: { trocas: Troca[]; atual?: string; fonte?: React.ReactNode }) {
  return (
    <Card title="Partidos ao longo do tempo" tip={TIP_JANELA}>
      <LinhaPartidos trocas={trocas} atual={atual} />
      {trocas.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          {trocas.map((t) => `${t.de} → ${t.para} em ${formatDate(t.data)}`).join("; ")}.
        </p>
      )}
      {fonte}
    </Card>
  );
}

/** Deputados da 57ª legislatura com mais de um partido; datas vêm do histórico de cada um (carregado sob demanda). */
export function TrocasLegislatura({ legislatura = 57 }: { legislatura?: number }) {
  const path = cam.deputados({ idLegislatura: legislatura, itens: 100 });
  const lista = useCamaraTodas<DeputadoLista>(path, 86_400_000);
  const quem = useMemo(() => trocasDaLista(lista.data ?? []), [lista.data]);
  const hist = useQueries({
    queries: quem.map((d) => ({
      queryKey: ["camara", cam.historico(d.id)],
      queryFn: ({ signal }: { signal: AbortSignal }) => camara<HistoricoDeputado[]>(cam.historico(d.id), signal),
      staleTime: 86_400_000,
    })),
  });
  if (lista.isError) return <ErrorState error={lista.error} retry={() => lista.refetch()} />;
  if (lista.isPending) return <Skeleton className="h-60" />;
  const prontos = hist.filter((h) => h.data).length;
  return (
    <Card title={<>Quem trocou de partido na {legislatura}ª legislatura <Tip content={TIP_JANELA} /></>}>
      {quem.length === 0 ? <EmptyState title="Nenhuma troca encontrada na lista da Câmara." /> : (
        <>
          {prontos < quem.length && <Spinner label={`Lendo históricos ${prontos}/${quem.length}…`} />}
          <ul className="mt-2 divide-y divide-line">
            {quem.map((d, i) => {
              const h = hist[i]?.data;
              const ts = h ? trocasCamara(h.filter((x) => x.idLegislatura === legislatura)) : [];
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span><Link className="link font-medium" to={`/deputado/${d.id}`}>{d.nome}</Link> <span className="text-xs text-muted">{d.siglaUf}</span></span>
                  {ts.length ? <LinhaPartidos trocas={ts} /> : (
                    <span className="flex items-center gap-1 text-sm">{d.partidos.map((p, k) => <span key={p + k} className="flex items-center gap-1">{k > 0 && <ArrowRight className="size-3.5 text-muted" />}<PartyBadge sigla={p} /></span>)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Fontes items={[{ label: "Deputados por legislatura (API da Câmara)", href: fontes.camaraApi(path) }, { label: "Histórico de cada deputado", href: fontes.camaraApi("/deputados/{id}/historico") }]} />
    </Card>
  );
}
