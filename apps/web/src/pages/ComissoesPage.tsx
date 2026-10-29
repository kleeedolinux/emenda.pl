import { CABECALHOS, CabecalhoPagina } from "@/features/linguagem";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Landmark, Search } from "lucide-react";
import { EmptyState, PageHeader, Section, Skeleton, Tabs, Tip } from "@/ui";
import { Fontes, inputCls } from "@/features/legislativo/components";
import { fontes } from "@/features/legislativo/api";
import { ShareButton } from "@/features/share";
import { agrupar } from "@/features/comissoes/api";
import { hrefComissao, porSigla, type TipoComissao } from "@/features/comissoes/catalogo";
import { useCpisCamaraAtivas, useListaSenado, useOrgaosCamara, useProximasCamara, useProximasSenado } from "@/features/comissoes/hooks";
import { CardComissao, DICA_TIPO, ROTULO_TIPO, type ItemHub } from "@/features/comissoes/ui";
import { semAcento } from "@emenda/contracts";

const busca = (s: string) => semAcento(s).toLowerCase();
const CMO = porSigla("CMO")!;

export default function ComissoesPage() {
  const [q, setQ] = useState("");
  const pc = useProximasCamara();
  const ps = useProximasSenado();
  const perm = useOrgaosCamara(2);
  const esp = useOrgaosCamara(3, "2025-01-01");
  const cpis = useCpisCamaraAtivas();
  const mistas = useListaSenado("mista");
  const sPerm = useListaSenado("permanente");
  const sCpi = useListaSenado("cpi");
  const sTemp = useListaSenado("temporaria");

  const proxCamara = (id?: number) => { const e = id ? pc.mapa?.get(id) : null; return e ? { data: e.dataHoraInicio, rotulo: e.descricaoTipo } : null; };
  const proxSenado = (c?: number) => { const r = c ? ps.mapa?.get(c) : null; return r ? { data: r.data, rotulo: r.titulo } : null; };

  const camara: ItemHub[] = useMemo(() => [
    ...(perm.data ?? []).map((o) => ({ key: `c${o.id}`, href: `/comissao/camara-${o.id}`, casa: "camara" as const, tipo: "permanente" as TipoComissao, sigla: o.sigla, nome: o.nome, camaraId: o.id, proxima: proxCamara(o.id) })),
    ...cpis.data.map((o) => ({ key: `c${o.id}`, href: `/comissao/camara-${o.id}`, casa: "camara" as const, tipo: "cpi" as TipoComissao, sigla: o.sigla, nome: o.apelido || o.nome, nomeOficial: o.nome, camaraId: o.id, proxima: proxCamara(o.id) })),
    ...(esp.data ?? []).filter((o) => !/teste/i.test(o.nome)).map((o) => ({ key: `c${o.id}`, href: `/comissao/camara-${o.id}`, casa: "camara" as const, tipo: "especial" as TipoComissao, sigla: o.sigla, nome: o.apelido || o.nome, nomeOficial: o.nome, camaraId: o.id, proxima: proxCamara(o.id) })),
  ], [perm.data, cpis.data, esp.data, pc.mapa]);

  const cn: ItemHub[] = useMemo(() => (mistas.data ?? []).map((c) => {
    const cat = porSigla(c.sigla);
    return { key: `s${c.codigo}`, href: `/comissao/senado-${c.codigo}`, casa: "cn" as const, tipo: "mista" as TipoComissao, sigla: c.sigla, nome: c.nome, senadoCodigo: c.codigo, proxima: proxSenado(c.codigo) ?? proxCamara(cat?.casa === "cn" ? cat.camaraId : undefined) };
  }), [mistas.data, ps.mapa, pc.mapa]);

  const senado: ItemHub[] = useMemo(() => [
    ...[...(sPerm.data ?? []), ...(sCpi.data ?? []), ...(sTemp.data ?? [])].map((c) => ({ key: `s${c.codigo}`, href: `/comissao/senado-${c.codigo}`, casa: "senado" as const, tipo: c.tipo, sigla: c.sigla, nome: c.nome, senadoCodigo: c.codigo, proxima: proxSenado(c.codigo) })),
  ], [sPerm.data, sCpi.data, sTemp.data, ps.mapa]);

  const filtra = (xs: ItemHub[]) => { const k = busca(q.trim()); return k ? xs.filter((x) => busca(`${x.sigla} ${x.nome}`).includes(k)) : xs; };
  const carregandoCamara = perm.isPending;
  const carregandoSenado = sPerm.isPending;

  return (
    <>
      <CabecalhoPagina
        c={CABECALHOS.comissoes}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Comissões" }]}
        actions={<ShareButton kind="pagina" title="Comissões do Congresso" subtitle="Quem comanda, quem participa e o que está em pauta" url="/comissoes" />}
      />

      <div className="mb-8 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="card p-5 text-sm">
          <h2 className="mb-2 flex items-center gap-1.5 text-base font-semibold">O que é uma comissão<Tip content="Constituição, art. 58: o Congresso e suas Casas têm comissões permanentes e temporárias, com atribuições previstas nos regimentos." /></h2>
          <p>Grupos menores de parlamentares que estudam as propostas por tema, ouvem especialistas em audiências públicas, fiscalizam o governo e votam pareceres. Em muitos projetos a decisão das comissões é final (<b>apreciação conclusiva</b>), sem voto no plenário, salvo recurso.</p>
          <p className="mt-2 text-muted">A composição segue o tamanho das bancadas: partidos e blocos maiores indicam mais membros.</p>
        </div>
        <Link to={hrefComissao(CMO)} className="card group block border-l-4 border-l-amarelo p-5 text-sm transition hover:shadow-[0_0_0_1px_var(--color-accent)]">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-accent"><Landmark className="size-4" aria-hidden />Dinheiro mandado pelas comissões</p>
          <p className="text-base font-semibold group-hover:underline">CMO — Comissão Mista de Orçamento</p>
          <p className="mt-1 text-muted">{CMO.oQueFaz}</p>
          <p className="mt-2 text-xs font-semibold text-link">Ver composição e reuniões →</p>
        </Link>
      </div>

      <label className="relative mb-6 block max-w-md">
        <span className="sr-only">Filtrar comissões</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input className={`${inputCls} pl-9`} placeholder="Filtrar por sigla ou nome (ex.: CCJ, saúde)" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      <Tabs tabs={[
        { id: "camara", label: "Câmara", count: camara.length + cn.length || undefined, content: carregandoCamara ? <Skeleton className="h-96" /> : <Grupos itens={filtra([...camara, ...cn])} /> },
        { id: "senado", label: "Senado", count: senado.length + cn.length || undefined, content: carregandoSenado ? <Skeleton className="h-96" /> : <Grupos itens={filtra([...senado, ...cn])} /> },
      ]} />
      {!cpis.isPending && !cpis.data.length && <p className="mt-4 text-xs text-muted">Nenhuma CPI da Câmara em funcionamento nesta legislatura segundo a API da Câmara.</p>}
      <p className="mt-2 text-xs text-muted">Comissões especiais da Câmara: criadas a partir de 2025. Próximas reuniões: agenda oficial dos próximos 30 dias.</p>
      <Fontes items={[
        { label: "Órgãos da Câmara (API)", href: fontes.camaraApi("/orgaos?codTipoOrgao=2") },
        { label: "Eventos da Câmara (API)", href: fontes.camaraApi("/eventos") },
        { label: "Comissões do Senado (API)", href: fontes.senadoApi("/comissao/lista/permanente") },
        { label: "Comissões mistas (API do Senado)", href: fontes.senadoApi("/comissao/lista/mistas") },
        { label: "Constituição, art. 58", href: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm#art58" },
      ]} />
    </>
  );
}

function Grupos({ itens }: { itens: ItemHub[] }) {
  const gs = agrupar(itens);
  if (!gs.length) return <EmptyState title="Nenhuma comissão encontrada." />;
  return (
    <>
      {gs.map(([tipo, xs]) => (
        <Section key={tipo} title={`${ROTULO_TIPO[tipo]} (${xs.length})`} tip={DICA_TIPO[tipo]}>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {xs.map((c) => <CardComissao key={c.key} c={c} destaque={c.sigla === "CMO"} />)}
          </ul>
        </Section>
      ))}
    </>
  );
}
