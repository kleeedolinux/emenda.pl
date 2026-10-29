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
                  <div className="flex items-start gap-3">
                    <span className="w-6 shrink-0 pt-0.5 text-right text-xs text-muted tabular">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block [overflow-wrap:anywhere]">{nomeLeigo(f.nome)}</b>
                      <span className="text-xs text-muted">contratada por {formatNumber(f.parlamentares)} {f.parlamentares === 1 ? "político" : "políticos"} · {formatNumber(f.n)} notas</span>
                    </span>
                    <b className="shrink-0 tabular">{brl(f.valor)}</b>
                  </div>
                  <details className="ml-9 mt-1 text-sm">
                    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-accent">Quem mais contratou</summary>
                    <ul className="space-y-1">
                      {comNomes(f, rk.data).map((c) => (
                        <li key={`${c.casa}-${c.id}`}>
                          <Link to={`${c.href}#gastos`} className="flex min-h-11 items-center gap-2 hover:text-accent">
                            <Avatar src={c.casa === "camara" ? fotoDeputado(c.id) : fotoSenador(c.id)} name={c.nome} size="sm" />
                            <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                            {c.partido && <PartyBadge sigla={c.partido} />}
                            {c.uf && <span className="text-xs text-muted">{c.uf}</span>}
                            <b className="tabular">{brl(c.valor)}</b>
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
