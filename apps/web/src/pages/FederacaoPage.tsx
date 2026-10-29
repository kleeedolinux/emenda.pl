import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { Handshake } from "lucide-react";
import {
  Badge, Card, DataTable, EmptyState, Money, PageHeader, PartyBadge, Section, Skeleton, Stat, StatGrid, Tip, formatDate, formatNumber, partyColor,
  type Column, type Tone,
} from "@/ui";
import { Fontes, Parlamentar } from "@/features/legislativo/components";
import { fontes, sen } from "@/features/legislativo/api";
import { ShareButton } from "@/features/share";
import { FEDERACOES, LEI_FEDERACOES, federacaoPorId, vigencia, type Posicao } from "@/features/federacoes/dados";
import type { BancadaFed } from "@/features/federacoes/bancada";
import { useBancadas, useCoesao } from "@/features/federacoes/hooks";

const POS: Record<Exclude<Posicao, null>, [string, Tone]> = { sim: ["Sim", "verde"], nao: ["Não", "vermelho"], dividido: ["Dividido", "amarelo"] };
const PosBadge = ({ p }: { p: Posicao }) => (p ? <Badge tone={POS[p][1]}>{POS[p][0]}</Badge> : <span className="text-xs text-muted">sem votos</span>);
const pct = (x: number) => `${Math.round(x * 100)}%`;

type Dep = BancadaFed["deputados"][number];

export default function FederacaoPage() {
  const f = federacaoPorId(useParams().id ?? "");
  const fs = useMemo(() => (f ? [f] : []), [f]);
  const { bancadas, deps, sens, autores } = useBancadas(fs);
  if (!f) return <EmptyState title="Federação não encontrada." hint={<Link className="link" to="/federacoes">Ver todas as federações</Link>} />;
  const b = bancadas?.[0];
  const v = vigencia(f);
  const cols: Column<Dep>[] = [
    { key: "nome", header: "Deputado(a)", sort: true, cell: (r) => <Parlamentar nome={r.nome} foto={r.urlFoto} to={`/deputado/${r.id}`} /> },
    { key: "siglaPartido", header: "Partido", sort: true, cell: (r) => <PartyBadge sigla={r.siglaPartido} /> },
    { key: "siglaUf", header: "UF", sort: true, cell: (r) => <Link className="link" to={`/uf/${r.siglaUf}`}>{r.siglaUf}</Link> },
    { key: "pago", header: "Emendas pagas", align: "right", tip: "pago", sort: (r) => r.pago ?? 0, cell: (r) => (r.pago != null ? <Money centavos={r.pago} compact /> : "—") },
  ];
  return (
    <>
      <PageHeader
        eyebrow={<>Federação partidária · registrada no TSE em {formatDate(f.deferimento)}</>}
        title={f.nome}
        subtitle={<span className="flex flex-wrap items-center gap-1.5">Partidos: {f.partidos.map((p) => <PartyBadge key={p} sigla={p} />)}</span>}
        media={<span className="flex size-20 shrink-0 items-center justify-center rounded-full text-white" style={{ background: `conic-gradient(${f.partidos.map((p, i) => `${partyColor(p)} ${(i / f.partidos.length) * 100}% ${((i + 1) / f.partidos.length) * 100}%`).join(",")})` }}><Handshake className="size-8 drop-shadow" aria-hidden /></span>}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Federações", to: "/federacoes" }, { label: f.nome.replace("Federação ", "") }]}
        actions={<ShareButton fab kind="pagina" title={f.nome} subtitle={`Federação de ${f.partidos.join(", ")}`} url={`/federacao/${f.id}`} metric={b?.pago != null ? { value: b.pago, format: "brl", label: "em emendas pagas" } : undefined} />}
      />

      <StatGrid className="mb-6">
        <Stat label="Deputados" value={b ? formatNumber(b.deputados.length) : "…"} hint={b ? `${((b.deputados.length / 513) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da Câmara` : undefined} />
        <Stat label="Senadores" value={b ? formatNumber(b.senadores.length) : "…"} hint="de 81" />
        <Stat label="Emendas pagas (bancada atual)" tip="pago" value={b?.pago != null ? <Money centavos={b.pago} compact /> : autores.isError ? "—" : "…"} hint="Soma de quem hoje está nos partidos da federação" />
        <Stat label="Prazo mínimo (4 anos)" value={<span className="text-base">{formatDate(v.minimoAte)}</span>} hint={v.cumpriuMinimo ? "Cumprido; a federação segue registrada" : "Em curso"} tip="Lei 9.096/1995, art. 11-A, § 3º: os partidos devem permanecer na federação por no mínimo quatro anos." />
      </StatGrid>

      <Section title="Partidos da federação">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {f.partidos.map((p, i) => {
            const x = b?.porPartido[i];
            return (
              <li key={p} className="card relative p-4">
                <span className="absolute inset-y-0 left-0 w-1.5 rounded-l-2xl" style={{ background: partyColor(p) }} aria-hidden />
                <p className="flex items-center justify-between gap-2"><PartyBadge sigla={p} /><Link className="link text-sm" to={`/partido/${encodeURIComponent(p)}`}>Página do partido →</Link></p>
                {x ? (
                  <p className="mt-3 text-sm"><b className="tabular">{x.deputados}</b> deputados · <b className="tabular">{x.senadores}</b> senadores{b?.pago != null && <> · <Money centavos={x.pago} compact /> em dinheiro mandado</>}</p>
                ) : <Skeleton className="mt-3 h-5 w-48" />}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Como votou nas pautas de grande repercussão" tip="Para cada pauta, a votação nominal do Plenário da Câmara com mais votos. Coesão: fatia dos votos Sim/Não da federação que seguiu a posição majoritária dela.">
        <Coesao fId={f.id} />
      </Section>

      <Section title="Deputados">
        <Card>
          {deps.isPending ? <Skeleton className="h-60" /> : b?.deputados.length ? (
            <DataTable rows={b.deputados} columns={cols} pageSize={25} rowKey={(r) => r.id} exportName={`federacao-${f.id}-deputados`} search={(r) => `${r.nome} ${r.siglaPartido} ${r.siglaUf}`} initialSort={{ key: "pago", dir: "desc" }} />
          ) : <EmptyState title="Nenhum deputado em exercício." />}
          <Fontes items={[{ label: "Deputados (API da Câmara)", href: fontes.camaraApi("/deputados") }, ...fontes.emendas()]} />
        </Card>
      </Section>

      <Section title="Senadores">
        <Card>
          {sens.isPending ? <Skeleton className="h-24" /> : b?.senadores.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {b.senadores.map((s) => (
                <li key={s.codigo} className="flex items-center justify-between gap-2">
                  <Parlamentar nome={s.nome} foto={s.foto} partido={s.partido} uf={s.uf} to={`/senador/${s.codigo}`} />
                  {s.pago != null && <span className="text-xs text-muted"><Money centavos={s.pago} compact /></span>}
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Nenhum senador em exercício nos partidos da federação." />}
          <Fontes items={[{ label: "Senadores (API do Senado)", href: fontes.senadoApi(sen.listaAtual()) }]} />
        </Card>
      </Section>

      <Section title="Outras federações">
        <ul className="flex flex-wrap gap-2">
          {FEDERACOES.filter((x) => x.id !== f.id).map((x) => <li key={x.id}><Link className="link text-sm" to={`/federacao/${x.id}`}>{x.nome}</Link></li>)}
        </ul>
      </Section>

      <Fontes items={[...f.fontes, LEI_FEDERACOES]} />
    </>
  );
}

function Coesao({ fId }: { fId: string }) {
  const f = federacaoPorId(fId)!;
  const linhas = useCoesao(f);
  const comVoto = linhas.filter((l) => l.coesao?.coesao != null);
  const media = comVoto.length ? comVoto.reduce((s, l) => s + l.coesao!.coesao!, 0) / comVoto.length : null;
  const unidas = comVoto.filter((l) => l.coesao!.unida).length;
  return (
    <Card actions={media != null ? <Badge tone="azul">coesão média {pct(media)} · unida em {unidas} de {comVoto.length}</Badge> : undefined}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-2 pr-3 font-medium" scope="col">Pauta</th>
              <th className="py-2 pr-3 font-medium" scope="col">Federação</th>
              <th className="py-2 pr-3 font-medium pointer-coarse:py-3" scope="col">Coesão <Tip content="100% = todos os votos Sim/Não da federação no mesmo lado. Abstenções e obstruções não entram na conta." /></th>
              <th className="py-2 font-medium" scope="col">Por partido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {linhas.map((l) => (
              <tr key={l.pauta.camaraId} className="align-top">
                <td className="py-2.5 pr-3">
                  <Link className="link font-medium" to={`/proposicao/${l.pauta.camaraId}`}>{l.pauta.apelido}</Link>
                  <span className="block text-xs text-muted">{l.pauta.sigla} {l.pauta.numero}/{l.pauta.ano}{l.votacao ? <> · <Link className="link" to={`/votacao/${l.votacao.id}`}>votação de {formatDate(l.votacao.data)}</Link></> : null}</span>
                </td>
                {l.carregando ? <td colSpan={3} className="py-2.5"><Skeleton className="h-5 w-56" /></td> : !l.votacao ? (
                  <td colSpan={3} className="py-2.5 text-xs text-muted">Sem votação com voto de cada deputado no Plenário da Câmara.</td>
                ) : (
                  <>
                    <td className="py-2.5 pr-3"><PosBadge p={l.coesao?.posicao ?? null} />{l.coesao?.unida && <Badge tone="azul" className="ml-1">unida</Badge>}</td>
                    <td className="py-2.5 pr-3 tabular">{l.coesao?.coesao != null ? pct(l.coesao.coesao) : "—"}{l.coesao ? <span className="block text-xs text-muted">Sim {l.coesao.sim} · Não {l.coesao.nao}{l.coesao.outros ? ` · outros ${l.coesao.outros}` : ""}</span> : null}</td>
                    <td className="py-2.5">
                      <span className="flex flex-wrap gap-x-3 gap-y-1">
                        {l.coesao?.partidos.map((p) => <span key={p.partido} className="inline-flex items-center gap-1"><PartyBadge sigla={p.partido} link={false} /><PosBadge p={p.posicao} /></span>)}
                      </span>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">Votos contados pelo partido do deputado na data da votação (registro da Câmara). Algumas votações são anteriores à criação da federação.</p>
      <Fontes items={[{ label: "Votações e votos (API da Câmara)", href: fontes.camaraApi("/votacoes") }]} />
    </Card>
  );
}
