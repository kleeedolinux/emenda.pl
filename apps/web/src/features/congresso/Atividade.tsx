// Atividade recente: votações nominais do Plenário e resumo das proposições.
import { useState } from "react";
import { Link } from "react-router";
import { ExternalLink as IconeExterno } from "lucide-react";
import { Badge, Card, EmptyState, ErrorState, Skeleton, Stagger, formatDate, formatNumber } from "@/ui";
import { Segmentado } from "@/features/legislativo/components";
import { ShareButton } from "@/features/share";
import { agruparPorTema, resumir } from "./resumo";
import { ultimasVotacoes } from "./votacoes";
import { RESUMO_N, TIPOS_PRODUCAO, useProducaoAnual, useResumoPLs, type ModoResumo, type useVotacoesCamara, type useVotacoesSenado } from "./hooks";
import type { Membro } from "./composicao";
import { BarraResultado, IconeTemaSvg, Metodo } from "./ui";

export function Votacoes({ vc, vs, casa }: { vc: ReturnType<typeof useVotacoesCamara>; vs: ReturnType<typeof useVotacoesSenado>; casa: "ambas" | "camara" | "senado" }) {
  if (vc.isError && vs.isError) return <ErrorState error={vc.error} retry={() => { void vc.refetch(); void vs.refetch(); }} />;
  if (vc.isPending || vs.isPending) return <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-36" /><Skeleton className="h-36" /><Skeleton className="h-36" /><Skeleton className="h-36" /></div>;
  const lista = ultimasVotacoes(casa === "senado" ? [] : vc.data ?? [], casa === "camara" ? [] : vs.data ?? [], 10);
  if (!lista.length) return <EmptyState title="Nenhuma votação nominal no período." />;
  return (
    <Stagger className="grid gap-3 md:grid-cols-2">
      {lista.map((v) => (
        <Stagger.Item key={v.chave} className="h-full">
          <article className="card flex h-full flex-col gap-2 p-4">
            <header className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone={v.casa === "camara" ? "verde" : "azul"}>{v.casa === "camara" ? "Câmara" : "Senado"}</Badge>
              <span className="text-muted">{formatDate(v.data)}</span>
              {v.aprovada !== null && <Badge tone={v.aprovada ? "verde" : "vermelho"}>{v.aprovada ? "Aprovada" : "Rejeitada"}</Badge>}
              <span className="ml-auto">
                <ShareButton compact kind="resultado" title={v.titulo} url={v.externo ? "/congresso#votacoes" : v.href} votes={{ sim: v.sim, nao: v.nao, outros: v.abstencao }} resultado={v.aprovada === null ? undefined : v.aprovada ? "aprovada" : "rejeitada"} subtitle={v.resumo.slice(0, 120)} />
              </span>
            </header>
            <h3 className="font-semibold leading-snug">
              {v.externo ? <a className="link inline-flex items-center gap-1" href={v.href} target="_blank" rel="noopener noreferrer">{v.titulo}<IconeExterno className="size-3.5" aria-hidden /></a>
                : <Link className="link" to={v.href}>{v.titulo}</Link>}
            </h3>
            <p className="line-clamp-3 text-sm text-muted">{v.resumo}</p>
            <div className="mt-auto"><BarraResultado sim={v.sim} nao={v.nao} abstencao={v.abstencao} /></div>
          </article>
        </Stagger.Item>
      ))}
    </Stagger>
  );
}

export function ResumoPLs({ membros, vc }: { membros: Membro[] | null; vc: ReturnType<typeof useVotacoesCamara> }) {
  const [modo, setModo] = useState<ModoResumo>("apresentadas");
  const q = useResumoPLs(modo, membros, vc.data);
  const ano = new Date().getFullYear();
  const prod = useProducaoAnual([ano - 1, ano]);
  const grupos = q.data ? agruparPorTema(q.data.map(resumir)) : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentado label="Quais proposições" value={modo} onChange={setModo} options={[
          { value: "apresentadas", label: "Apresentadas (14 dias)" }, { value: "aprovadas", label: "Aprovadas no Plenário da Câmara" },
        ]} />
        <p className="text-sm text-muted">
          {TIPOS_PRODUCAO.join(", ")} apresentados na Câmara: <b className="tabular">{prod[1]?.data !== undefined ? formatNumber(prod[1].data) : "…"}</b> em {ano}
          {" "}· <span className="tabular">{prod[0]?.data !== undefined ? formatNumber(prod[0].data) : "…"}</span> em {ano - 1}
        </p>
      </div>
      {q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !grupos ? <Skeleton className="h-72" /> : !grupos.length ? <EmptyState title="Nada encontrado no período." /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {grupos.map((g) => (
            <Card key={g.tema} title={<span className="inline-flex items-center gap-2"><span className="inline-flex size-7 items-center justify-center rounded-lg bg-surface-2"><IconeTemaSvg icone={g.icone} /></span>{g.tema} <span className="text-sm font-normal text-muted">({g.itens.length})</span></span>}>
              <ul className="space-y-4">
                {g.itens.map((r) => (
                  <li key={r.id}>
                    <Link to={r.href} className="link font-semibold">{r.titulo}</Link>
                    <p className="mt-1 text-sm leading-relaxed">{r.texto}</p>
                    {r.palavras.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{r.palavras.map((p) => <Badge key={p}>{p}</Badge>)}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      <Metodo tip="Cada parágrafo é montado por regras fixas a partir dos campos oficiais da Câmara: tipo, autores, data, ementa, explicação da ementa, regime e situação. Nenhuma frase é criada além desses campos; o tema vem da classificação oficial da Câmara ou, sem ela, de palavras da ementa.">
        Resumos automáticos das últimas {RESUMO_N} proposições, só com textos oficiais. Aprovadas: proposições com votação de aprovação no Plenário da Câmara nos últimos 90 dias.
      </Metodo>
    </div>
  );
}
