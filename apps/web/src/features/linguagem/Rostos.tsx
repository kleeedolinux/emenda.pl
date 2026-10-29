// "Quem mandou": rostos (foto, partido, UF) + valor. Grupos (bancada/comissão/relator) ganham ícone do tipo.
import type { AutorResumo } from "@emenda/contracts";
import { useQuery } from "@tanstack/react-query";
import { EyeOff, Landmark, Users } from "lucide-react";
import { Link } from "react-router";
import { nomeProprio, parlamentarDe } from "@/features/emendas/historias";
import { useParlamentares } from "@/features/emendas/explorador";
import { fetchJson } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { Avatar, PartyBadge, Skeleton } from "@/ui/primitives";
import { parsePopulacaoIbge, TIPO_DINHEIRO, tipoAutor } from "./linguagem";
import { ListaVerMais } from "./VerMais";

const ICONE_GRUPO = { bancada: Users, comissao: Landmark, relator: EyeOff } as const;
const COR_GRUPO = { bancada: TIPO_DINHEIRO.bancada.cor, comissao: TIPO_DINHEIRO.comissao.cor, relator: TIPO_DINHEIRO.relator.cor } as const;
const ROTULO_GRUPO = { bancada: "Grupo de políticos do estado", comissao: "Comissão do Congresso", relator: "Orçamento secreto · sem dono" } as const;

/** Lista de quem mandou, ordenada por valor; mostra `inicial` e cresce com "ver mais". */
export function QuemMandou({ autores, inicial = 3, valor = (a) => a.pago }: { autores: readonly AutorResumo[]; inicial?: number; valor?: (a: AutorResumo) => number }) {
  const idx = useParlamentares(autores.length > 0);
  const lista = [...autores].filter((a) => valor(a) > 0).sort((a, b) => valor(b) - valor(a));
  const max = Math.max(1, ...lista.map(valor));
  return (
    <ListaVerMais itens={lista} inicial={inicial} passo={10} chave={(a) => a.codigo} className="grid gap-2"
      vazio={<p className="text-sm text-muted">Nenhum valor pago identificado.</p>}
      render={(a, i) => {
        const k = tipoAutor(a.nome);
        const p = k === "pessoa" ? parlamentarDe(idx, a.chave) : null;
        const nome = p?.nome ?? nomeProprio(a.nome);
        const Icon = k !== "pessoa" ? ICONE_GRUPO[k] : null;
        return (
          <Link to={p?.href ?? `/autor/${encodeURIComponent(a.codigo)}`} className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-2.5 pr-3 hover:border-accent">
            <span aria-hidden className="absolute inset-y-0 left-0 bg-verde/8" style={{ width: `${(valor(a) / max) * 100}%` }} />
            <span className="relative">
              {Icon ? (
                <span className="grid size-12 place-items-center rounded-full text-white" style={{ background: COR_GRUPO[k as keyof typeof COR_GRUPO] }}><Icon className="size-6" aria-hidden /></span>
              ) : <Avatar src={p?.foto} name={nome} size="md" />}
              <span className="absolute -left-1 -top-1 grid min-w-5 place-items-center rounded-full bg-fg px-1 text-[10px] font-bold text-bg tabular">{i + 1}</span>
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block truncate font-semibold group-hover:text-accent">{nome}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                {p ? <><PartyBadge sigla={p.partido} link={false} /><span>{p.uf} · {p.casa === "Senado" ? "Senador(a)" : "Deputado(a)"}</span></> : <span>{k !== "pessoa" ? ROTULO_GRUPO[k] : "Político"}</span>}
              </span>
            </span>
            <b className="relative shrink-0 font-display text-lg tabular">{formatBRL(valor(a), true)}</b>
          </Link>
        );
      }}
    />
  );
}

export function QuemMandouSkeleton({ n = 3 }: { n?: number }) {
  return <div className="grid gap-2">{Array.from({ length: n }, (_, i) => <Skeleton key={i} className="h-[4.5rem] rounded-2xl" />)}</div>;
}

/** População estimada (IBGE, estimativa anual mais recente) de um município. */
export function usePopulacao(ibge: string | null) {
  return useQuery({
    queryKey: ["ibge-populacao", ibge],
    queryFn: async ({ signal }) => parsePopulacaoIbge(await fetchJson<unknown>(`/api/ibge/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N6[${ibge}]`, signal)),
    enabled: !!ibge && /^\d{7}$/.test(ibge),
    staleTime: Infinity,
    retry: 0,
  });
}
