// <AutoLink text>: texto livre com entidades (comissões, proposições, partidos, leis...) virando links
// com cartão de pré-visualização (hover/foco). Puro na detecção (./registro); aqui só apresentação.
import * as T from "@radix-ui/react-tooltip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import { useMemo, useState, type ComponentType, type ElementType, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { fetchJson, useMunicipiosIbge, type IbgeMunicipio } from "@/lib/data";
import { cam, type ProposicaoLista } from "@/features/legislativo/api";
import { autolink, chaveMunicipio, type Casa, type Entidade, type NomeConhecido } from "./registro";

// ---------- registro de apresentação ----------
const ROTULOS: Record<string, string> = {
  comissao: "Comissão", proposicao: "Proposição", partido: "Partido", federacao: "Federação partidária", uf: "Estado",
  municipio: "Município", lei: "Norma", constituicao: "Constituição", deputado: "Deputado(a)", senador: "Senador(a)",
};
const PREVIEWS: Record<string, ComponentType<{ e: Entidade }>> = {};

/** Outros módulos: rótulo e (opcional) conteúdo próprio do cartão para um tipo registrado com `registrarMatcher`. */
export function registrarApresentacao(tipo: string, rotulo: string, Preview?: ComponentType<{ e: Entidade }>) {
  ROTULOS[tipo] = rotulo;
  if (Preview) PREVIEWS[tipo] = Preview;
}

// ---------- municípios (índice estático, só quando o texto tem "Cidade/UF") ----------
const cacheMun = new WeakMap<IbgeMunicipio[], Map<string, number>>();
function indiceMunicipios(ms: IbgeMunicipio[]) {
  let m = cacheMun.get(ms);
  if (!m) { m = new Map(ms.map((x) => [chaveMunicipio(x.nome, x.uf ?? ""), x.id])); cacheMun.set(ms, m); }
  return m;
}
const TALVEZ_MUNICIPIO = /\p{Ll}\s?\/\s?[A-Z]{2}(?![\p{L}])/u;

export interface AutoLinkProps {
  text: string | null | undefined;
  /** Casa do texto (desempata CCJ, CE...). */
  casa?: Casa;
  /** Parlamentares que podem aparecer pelo nome. */
  nomes?: readonly NomeConhecido[];
  className?: string;
  as?: ElementType;
}

/** Texto com links automáticos e acessíveis. Não use dentro de outro link. */
export function AutoLink({ text, casa, nomes, className, as: Tag = "span" }: AutoLinkProps) {
  const t = text ?? "";
  const querMun = TALVEZ_MUNICIPIO.test(t);
  const mun = useMunicipiosIbge(querMun);
  const municipios = mun.data ? indiceMunicipios(mun.data) : undefined;
  const segs = useMemo(() => autolink(t, { casa, nomes, municipios }), [t, casa, nomes, municipios]);
  if (!t) return null;
  return (
    <Tag className={className}>
      {segs.map((s, i) => (s.entidade ? <EntityLink key={i} e={s.entidade}>{s.texto}</EntityLink> : s.texto))}
    </Tag>
  );
}

const linkCls = "rounded-sm text-link underline decoration-dotted decoration-1 underline-offset-[3px] transition hover:decoration-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

/** Um link de entidade com cartão de pré-visualização. Pode ser usado isolado. */
export function EntityLink({ e, children, className }: { e: Entidade; children: ReactNode; className?: string }) {
  const [aberto, setAberto] = useState(false);
  const prop = useProposicaoResolvida(e, aberto);
  const qc = useQueryClient();
  const nav = useNavigate();
  const href = prop.data ? `/proposicao/${prop.data.id}` : e.href;

  const onClick = async (ev: MouseEvent) => {
    if (e.tipo !== "proposicao" || prop.data || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
    ev.preventDefault();
    const r = await qc.fetchQuery(opcoesProposicao(e)).catch(() => null);
    nav(r ? `/proposicao/${r.id}` : e.href);
  };

  const conteudo = <>{children}{e.externo && <ArrowUpRight className="ml-px inline size-3 align-[-1px]" aria-hidden />}{e.externo && <span className="sr-only"> (abre em nova aba)</span>}</>;
  const trigger = e.externo
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={clsx(linkCls, className)}>{conteudo}</a>
    : <Link to={href} onClick={onClick} className={clsx(linkCls, className)}>{conteudo}</Link>;

  const Custom = PREVIEWS[e.tipo];
  return (
    <T.Provider delayDuration={250}>
    <T.Root open={aberto} onOpenChange={setAberto}>
      <T.Trigger asChild>{trigger}</T.Trigger>
      <T.Portal>
        <T.Content side="top" sideOffset={6} collisionPadding={12}
          className="z-[100] w-72 max-w-[calc(100vw-24px)] rounded-xl border border-line bg-surface p-3 text-[13px] leading-snug text-fg shadow-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">{ROTULOS[e.tipo] ?? "Link"}</p>
          <p className="mt-0.5 font-semibold">{e.titulo}</p>
          {Custom ? <Custom e={e} /> : e.tipo === "proposicao" ? (
            <p className="mt-1 line-clamp-4 text-muted">{prop.isFetching && !prop.data ? "Buscando na Câmara…" : prop.data?.ementa ?? (prop.isFetched ? "Abre a busca de proposições." : "")}</p>
          ) : e.descricao ? <p className="mt-1 line-clamp-4 text-muted">{e.descricao}</p> : null}
          <T.Arrow className="fill-surface" />
        </T.Content>
      </T.Portal>
    </T.Root>
    </T.Provider>
  );
}

// ---------- proposição: id da Câmara resolvido sob demanda ----------
function opcoesProposicao(e: Entidade) {
  const d = e.dados ?? {};
  return {
    queryKey: ["autolink-proposicao", d.siglaTipo, d.numero, d.ano],
    queryFn: async ({ signal }: { signal?: AbortSignal }) => {
      const r = await fetchJson<{ dados: ProposicaoLista[] }>(`/api/camara${cam.buscaProposicao(String(d.siglaTipo), d.numero!, d.ano!)}`, signal);
      return r.dados[0] ?? null;
    },
    staleTime: 24 * 60 * 60_000,
  };
}
function useProposicaoResolvida(e: Entidade, ativo: boolean) {
  return useQuery({ ...opcoesProposicao(e), enabled: ativo && e.tipo === "proposicao" });
}
