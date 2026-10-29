import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { gastosPath, type GastosFornecedores, type GastosRanking, type GrupoGasto } from "@emenda/contracts";
import { Avatar, Card, ErrorState, ExternalLink, PartyBadge, Skeleton, useApi } from "@/ui";
import { fotoDeputado, fotoSenador } from "@/lib/cdn";
import { formatBRL, formatNumber } from "@/lib/format";
import { nomeLeigo } from "@/lib/nomes";
import { CABECALHOS, CabecalhoPagina, ListaVerMais } from "@/features/linguagem";
import { GRUPOS, comNomes } from "@/features/contratadas/contratadas";
import { ShareButton } from "@/features/share";

const brl = (n: number) => formatBRL(Math.round(n), true);

export default function ContratadasPage() {
  const q = useApi<GastosFornecedores>(gastosPath.fornecedores());
  const rk = useApi<GastosRanking>(gastosPath.ranking());
  const [params, setParams] = useSearchParams();
  const grupos = q.data?.grupos ?? [];
  const pedido = params.get("tipo") as GrupoGasto | null;
  const atual = grupos.find((g) => g.grupo === pedido) ?? grupos[0];
  const escolher = (g: GrupoGasto) => setParams((p) => { p.set("tipo", g); return p; }, { replace: true });
  const topo = atual?.fornecedores[0];
  const rotulo = atual ? GRUPOS[atual.grupo].rotulo : "";
  const fornecedores = useMemo(() => atual?.fornecedores ?? [], [atual]);

  return (
    <>
      <CabecalhoPagina
        c={CABECALHOS.contratadas}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Empresas contratadas" }]}
        actions={topo ? <ShareButton fab kind="pagina" title={`Quem mais recebe dos políticos: ${rotulo}`} text={`${nomeLeigo(topo.nome)} recebeu ${brl(topo.valor)} de ${formatNumber(topo.parlamentares)} deputados e senadores em ${rotulo.toLowerCase()}. Veja quem contratou:`} url={`/empresas-contratadas?tipo=${atual!.grupo}`} /> : undefined}
      />
      {q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data ? <Skeleton className="h-96 rounded-3xl" /> : (
        <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Tipo de gasto">
            {grupos.map((g) => (
              <button key={g.grupo} type="button" aria-pressed={g.grupo === atual?.grupo} onClick={() => escolher(g.grupo)}
                className="min-h-11 rounded-full border border-line px-4 text-left text-sm font-semibold aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-white">
                {GRUPOS[g.grupo].rotulo} <span className="font-normal tabular opacity-80">{brl(g.valor)}</span>
              </button>
            ))}
          </div>
          {atual && (
            <Card>
              <p className="mb-2 text-sm text-muted">{GRUPOS[atual.grupo].linha}</p>
              <ListaVerMais key={atual.grupo} itens={fornecedores} inicial={10} passo={20} chave={(f) => f.cnpjCpf || f.nome} className="divide-y divide-line" render={(f, i) => (
                <div className="py-3">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="w-6 shrink-0 pt-0.5 text-right text-xs text-muted tabular">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block break-words">{nomeLeigo(f.nome)}</b>
                      <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-muted">
                        <span>contratada por {formatNumber(f.parlamentares)} {f.parlamentares === 1 ? "político" : "políticos"} · {formatNumber(f.n)} notas</span>
                        <b className="text-sm text-fg tabular">{brl(f.valor)}</b>
                      </span>
                    </span>
                  </div>
                  <details className="mt-1 text-sm sm:ml-9">
                    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-accent">Quem mais contratou</summary>
                    <ul className="space-y-1">
                      {comNomes(f, rk.data).map((c) => (
                        <li key={`${c.casa}-${c.id}`}>
                          <Link to={`${c.href}#gastos`} className="flex min-h-11 items-center gap-2 hover:text-accent">
                            <Avatar src={c.casa === "camara" ? fotoDeputado(c.id) : fotoSenador(c.id)} name={c.nome} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block break-words">{c.nome}</span>
                              <span className="flex flex-wrap items-center gap-1 text-xs text-muted">{c.partido && <PartyBadge sigla={c.partido} />}{c.uf}<b className="ml-auto text-sm text-fg tabular">{brl(c.valor)}</b></span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )} />
            </Card>
          )}
          <p className="mt-4 text-xs text-muted">Soma das notas pagas pela cota de cada deputado e senador desde 2019. Oficialmente: fornecedores da cota parlamentar (CEAP/CEAPS). Fontes: <ExternalLink href="https://dadosabertos.camara.leg.br">Câmara</ExternalLink> e <ExternalLink href="https://www12.senado.leg.br/transparencia">Senado</ExternalLink>.</p>
        </>
      )}
    </>
  );
}
