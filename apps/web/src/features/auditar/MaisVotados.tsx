import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Avatar, Card, PartyBadge, Skeleton, Tip, formatNumber, useApi } from "@/ui";
import { cam, dedupeDeputados, mapSenadores, sen, type DeputadoLista, type SenadorResumo } from "@/features/legislativo/api";
import { useCamaraTodas, useSenado } from "@/features/legislativo/hooks";
import { cruzarMaisVotados, type MaisVotadosArquivo, type ParlamentarAtual } from "./cruzarMaisVotados";

/** Destaque dos mais votados em 2022 (TSE), com atalho para o boletim de cada um. */
export function MaisVotados({ limite = 12 }: { limite?: number }) {
  const [casa, setCasa] = useState<"deputados" | "senadores">("deputados");
  const arq = useApi<MaisVotadosArquivo>("/data/v1/eleicao2022/mais-votados.json");
  const deps = useCamaraTodas<DeputadoLista>(cam.deputados({}));
  const sens = useSenado<SenadorResumo[]>(sen.listaAtual(), mapSenadores);
  const atuais = useMemo<ParlamentarAtual[]>(() => [
    ...dedupeDeputados(deps.data ?? []).map((d) => ({ casa: "deputado" as const, id: String(d.id), nome: d.nome, uf: d.siglaUf, partido: d.siglaPartido, foto: d.urlFoto })),
    ...(sens.data ?? []).map((s) => ({ casa: "senador" as const, id: s.codigo, nome: s.nome, uf: s.uf, partido: s.partido, foto: s.foto })),
  ], [deps.data, sens.data]);
  const lista = useMemo(() => (arq.data ? cruzarMaisVotados(arq.data[casa], atuais, limite) : []), [arq.data, casa, atuais, limite]);

  if (arq.isError) return null;
  return (
    <Card
      title="Mais votados em 2022"
      tip="Votos nominais no 1º turno de 2022, segundo o TSE. Clique para ver o boletim."
      actions={
        <div className="flex gap-1 text-sm" role="tablist">
          {(["deputados", "senadores"] as const).map((c) => (
            <button key={c} role="tab" aria-selected={casa === c} onClick={() => setCasa(c)}
              className={casa === c ? "rounded-full bg-verde-700 px-3 py-1 text-white" : "rounded-full px-3 py-1 hover:bg-black/5 dark:hover:bg-white/10"}>
              {c === "deputados" ? "Deputados" : "Senadores"}
            </button>
          ))}
        </div>
      }
    >
      {arq.isLoading ? <Skeleton className="h-40" /> : (
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((m, i) => {
            const corpo = (
              <>
                <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-muted">{i + 1}</span>
                <Avatar src={m.foto} name={m.nome} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.nome}</span>
                  <span className="flex items-center gap-1 text-xs text-muted"><PartyBadge sigla={m.partidoAtual ?? m.partido} link={false} /> {m.uf}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums">{formatNumber(m.votos)}<span className="block text-xs font-normal text-muted">votos</span></span>
              </>
            );
            return (
              <li key={m.sq}>
                {m.id ? (
                  <Link to={`/auditar/${m.casa}/${m.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5">{corpo}</Link>
                ) : <div className="flex items-center gap-3 p-2 opacity-70" title="Sem mandato atual">{corpo}</div>}
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-3 text-xs text-muted">Fonte: <a className="link" href={arq.data?.fonte ?? "https://dadosabertos.tse.jus.br"} target="_blank" rel="noreferrer">TSE — resultados 2022</a> <Tip content="Soma dos votos nominais por município e zona. O partido mostrado é o atual, quando o parlamentar está em exercício." /></p>
    </Card>
  );
}
