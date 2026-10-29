// Últimas emendas: cartão de pagamento, partidos por autor, rankings por janela recente.
import clsx from "clsx";
import { motion, useReducedMotion } from "motion/react";
import { Building2, MapPin, User, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { chaveNome, dataPath, type JanelaRanking, type Pagamento, type Rankings } from "@emenda/contracts";
import { Badge, Bars, Card, EmptyState, ErrorState, ExternalLink, Money, Skeleton, Tip, externo, formatDocumento, partyColor, useApi } from "@/ui";
import { formatBRL, formatNumber } from "@/lib/format";
import { COR_TIPO, nomeTipoCurto } from "@/features/emendas/tipos";
import { cam, mapSenadores, sen, type DeputadoLista, type SenadorResumo } from "@/features/legislativo/api";
import { useCamaraTodas, useSenado } from "@/features/legislativo/hooks";
import { Segmentado } from "@/features/legislativo/components";
import { JANELA_ROTULO, mesLongo, rankingPorPartido } from "./feed";
import { TipoChip } from "@/features/linguagem/TipoDinheiro";
import { nomeLeigo } from "@/lib/nomes";

export function PagamentoCard({ p, i = 0 }: { p: Pagamento; i?: number }) {
  const reduce = useReducedMotion();
  const pix = p.tipo === "pix";
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.03 }}
      className={clsx("card relative flex flex-col gap-2 p-4", pix && "ring-2 ring-amarelo/70")}
    >
      <div className="flex items-start justify-between gap-3">
        <TipoChip tipo={p.tipo} />
        <span className="text-right">
          <span className="block font-display text-lg font-bold tabular"><Money centavos={p.valor} /></span>
          <span className="text-xs text-muted">pago em {mesLongo(p.mes)}</span>
        </span>
      </div>
      <p className="flex items-start gap-1.5 text-sm">
        <Building2 className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <span><span className="text-xs text-muted">Quem recebeu: </span><b>{p.favorecido.nome ? nomeLeigo(p.favorecido.nome) : "Não informado"}</b>
          {p.favorecido.documento && <span className="ml-1 text-xs text-muted tabular" title="CNPJ ou CPF de quem recebeu">{formatDocumento(p.favorecido.documento)}</span>}</span>
      </p>
      <p className="flex items-center gap-1.5 text-sm">
        <MapPin className="size-4 shrink-0 text-muted" aria-hidden />
        {p.municipio.ibge ? <Link className="link" to={`/municipio/${p.municipio.ibge}`}>{nomeLeigo(p.municipio.nome)}</Link> : <span>{nomeLeigo(p.municipio.nome) || "—"}</span>}
        {p.municipio.uf && <Link className="text-xs text-muted hover:underline" to={`/uf/${p.municipio.uf}`}>{p.municipio.uf}</Link>}
      </p>
      <p className="flex items-center gap-1.5 text-sm">
        <User className="size-4 shrink-0 text-muted" aria-hidden />
        <span className="text-xs text-muted">Quem mandou:</span>
        {/^[A-Za-z0-9]+$/.test(p.autor.codigo) ? <Link className="link" to={`/autor/${p.autor.codigo}`}>{nomeLeigo(p.autor.nome)}</Link> : <span>{nomeLeigo(p.autor.nome)}</span>}
      </p>
      <p className="mt-auto text-xs"><ExternalLink href={externo.emenda(p.codigoEmenda)}>Ver no Portal da Transparência</ExternalLink></p>
    </motion.li>
  );
}

const TITULOS = /^(DEP|DEPUTADO|DEPUTADA|SEN|SENADOR|SENADORA)\s+/;
/** chave do nome -> partido atual (Câmara 57ª legislatura + Senado em exercício). */
export function usePartidoPorChave() {
  const deps = useCamaraTodas<DeputadoLista>(cam.deputados({ idLegislatura: 57, itens: 100 }), 86_400_000);
  const sens = useSenado<SenadorResumo[]>(sen.listaAtual(), mapSenadores);
  const mapa = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of deps.data ?? []) m.set(chaveNome(d.nome), d.siglaPartido);
    for (const s of sens.data ?? []) { m.set(chaveNome(s.nome), s.partido); m.set(chaveNome(s.nomeCompleto), s.partido); }
    return m;
  }, [deps.data, sens.data]);
  return { mapa, carregando: deps.isPending || sens.isPending };
}
export const chaveSemTitulo = (c: string) => c.replace(TITULOS, "");

type Visao = "autores" | "partidos" | "ufs" | "municipios";

/** "Quem mais enviou" nas janelas 1/3/6/12 meses (pagamentos do Portal por mês). */
export function RankingsRecentes({ compacto = false }: { compacto?: boolean }) {
  const q = useApi<Rankings>(dataPath.rankings());
  const [jan, setJan] = useState<JanelaRanking>("3m");
  const [visao, setVisao] = useState<Visao>("autores");
  const { mapa, carregando } = usePartidoPorChave();
  const j = q.data?.janelas.find((x) => x.janela === jan);
  const partidos = useMemo(() => (j ? rankingPorPartido(j.autores.map((a) => ({ ...a, chave: chaveSemTitulo(a.chave) })), mapa) : []), [j, mapa]);
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!j) return <Skeleton className="h-80" />;
  const fmt = (n: number) => formatBRL(n, true);
  const limit = compacto ? 8 : 25;
  const dados = {
    autores: j.autores.map((a) => ({ label: nomeLeigo(a.nome), value: a.valor, href: `/autor/${a.codigo}`, sub: mapa.get(chaveSemTitulo(a.chave)) })),
    partidos: partidos.map((p) => ({ label: p.partido ?? "Não identificado", value: p.valor, href: p.partido ? `/partido/${p.partido}` : undefined, color: p.partido ? partyColor(p.partido) : "#94a3b8", sub: `${p.autores} ${p.autores === 1 ? "político" : "políticos"}` })),
    ufs: j.ufs.map((u) => ({ label: u.nome, value: u.valor, href: `/uf/${u.uf}` })),
    municipios: j.municipios.map((m) => ({ label: `${nomeLeigo(m.nome)} (${m.uf})`, value: m.valor, href: `/municipio/${m.ibge}` })),
  }[visao];
  return (
    <Card
      title={<>Quem mais mandou dinheiro · últimos {JANELA_ROTULO[jan]}</>}
      tip="Soma do que foi pago no período, não importa em que ano o político indicou o dinheiro. Fonte: Portal da Transparência."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmentado label="Período" value={jan} onChange={setJan} options={(["1m", "3m", "6m", "12m"] as const).map((k) => ({ value: k, label: JANELA_ROTULO[k] }))} />
        <Segmentado label="Agrupar por" value={visao} onChange={setVisao} options={[
          { value: "autores", label: "Político" }, { value: "partidos", label: "Partido" }, { value: "ufs", label: "Estado" }, { value: "municipios", label: "Cidade" },
        ]} />
      </div>
      <p className="mb-3 text-sm text-muted">
        {mesLongo(j.desde)} a {mesLongo(j.ate)}: <b className="text-fg">{fmt(j.valor)}</b> em {formatNumber(j.pagamentos)} pagamentos.
        {visao === "partidos" && <> <Tip content="Cruzamos o nome do autor com deputados da 57ª legislatura e senadores em exercício. Grupos do estado, comissões, orçamento secreto e ex-políticos aparecem como “Não identificado”. É o partido de hoje, não o da época." /></>}
      </p>
      {visao === "partidos" && carregando ? <Skeleton className="h-60" /> : dados.length ? <Bars data={dados} format={fmt} limit={limit} /> : <EmptyState title="Sem pagamentos no período." />}
      {visao === "autores" && !compacto && j.tipos.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {j.tipos.map((t) => <Badge key={t.tipo}><span className="mr-1 inline-block size-2 rounded-full" style={{ background: COR_TIPO[t.tipo] }} />{nomeTipoCurto(t.tipo)}: {fmt(t.valor)}</Badge>)}
        </div>
      )}
      {compacto && <p className="mt-3 text-sm"><Link className="link" to="/ultimas?tab=rankings">Ver ranking completo e por partido →</Link></p>}
    </Card>
  );
}

