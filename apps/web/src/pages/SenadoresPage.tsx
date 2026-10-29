import { CABECALHOS, CabecalhoPagina } from "@/features/linguagem";
import { BuscaUniversal } from "@/features/busca";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { UFS } from "@emenda/contracts";
import {
  Avatar, Bars, Card, DataTable, ErrorState, Hemicycle, Money, PageHeader, PartyBadge, Section, Skeleton, Stat, StatGrid, Term,
  formatNumber, partyColor, type Column,
} from "@/ui";
import { encontrarAutor, fontes, mapSenadores, sen, type SenadorResumo } from "@/features/legislativo/api";
import { useAutores, useSenado } from "@/features/legislativo/hooks";
import { duracaoDias, formatDuracao, periodosSenado } from "@/features/legislativo/mandatos";
import { Campo, ChipsMandato, Fontes, Segmentado, inputCls, selectCls } from "@/features/legislativo/components";

const LEG_INI = 45; // 1975
const LEG_FIM = 58;

type Linha = SenadorResumo & { nMandatos?: number; dias?: number; pago?: number };

export default function SenadoresPage() {
  const [sp, setSp] = useSearchParams();
  const view = sp.get("view") === "tabela" ? "tabela" : "grade";
  const ordem = (["tempo", "emendas"].includes(sp.get("ordem") ?? "") ? sp.get("ordem") : "nome") as "nome" | "tempo" | "emendas";
  const f = { q: sp.get("q") ?? "", uf: sp.get("uf") ?? "", partido: sp.get("partido") ?? "", sexo: sp.get("sexo") ?? "" };
  const set = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const [limite, setLimite] = useState(81);

  const atual = useSenado<SenadorResumo[]>(sen.listaAtual(), mapSenadores);
  const hist = useSenado<SenadorResumo[]>(sen.listaLegislatura(LEG_INI, LEG_FIM), mapSenadores);
  const autores = useAutores();

  const linhas: Linha[] = useMemo(() => {
    const porCod = new Map((hist.data ?? []).map((s) => [s.codigo, s]));
    return (atual.data ?? []).map((s) => {
      const h = porCod.get(s.codigo);
      const ms = h ? periodosSenado(h.mandatos) : null;
      const a = autores.data ? encontrarAutor(autores.data.idx, [s.nome, s.nomeCompleto]) : null;
      return { ...s, nMandatos: ms?.length, dias: ms ? duracaoDias(ms.flatMap((m) => m.periodos)) : undefined, pago: a?.pago };
    });
  }, [atual.data, hist.data, autores.data]);

  const filtrados = useMemo(() => {
    const q = f.q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const r = linhas.filter((s) =>
      (!q || `${s.nome} ${s.nomeCompleto}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q)) &&
      (!f.uf || s.uf === f.uf) && (!f.partido || s.partido === f.partido) && (!f.sexo || s.sexo === f.sexo));
    if (ordem === "tempo") return r.slice().sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
    if (ordem === "emendas") return r.slice().sort((a, b) => (b.pago ?? -1) - (a.pago ?? -1));
    return r;
  }, [linhas, f.q, f.uf, f.partido, f.sexo, ordem]);

  const partidos = useMemo(() => [...new Set(linhas.map((s) => s.partido))].sort(), [linhas]);
  const porPartido = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of linhas) m.set(s.partido, (m.get(s.partido) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [linhas]);
  const seats = useMemo(() => porPartido.flatMap(([p]) => linhas.filter((s) => s.partido === p).map((s) => ({ key: s.codigo, color: partyColor(p), group: p, label: `${s.nome} (${p}-${s.uf})` }))), [porPartido, linhas]);

  const cols: Column<Linha>[] = [
    { key: "nome", header: "Senador(a)", sort: (r) => r.nome, cell: (r) => (
      <span className="flex items-center gap-2"><Avatar src={r.foto} name={r.nome} size="sm" /><Link className="link font-medium" to={`/senador/${r.codigo}`}>{r.nome}</Link></span>
    ) },
    { key: "partido", header: "Partido", sort: true, cell: (r) => <PartyBadge sigla={r.partido} /> },
    { key: "uf", header: "UF", sort: true },
    { key: "bloco", header: "Bloco", sort: true, tip: "Blocos são alianças de partidos dentro do Senado para atuar em conjunto." },
    { key: "nMandatos", header: "Mandatos", align: "right", sort: (r) => r.nMandatos ?? 0 },
    { key: "dias", header: "Tempo de casa", align: "right", sort: (r) => r.dias ?? 0, cell: (r) => (r.dias != null ? formatDuracao(r.dias) : "—"), csv: (r) => r.dias ?? 0 },
    { key: "pago", header: "Emendas pagas", align: "right", tip: "pago", sort: (r) => r.pago ?? 0, cell: (r) => (r.pago != null ? <Money centavos={r.pago} compact /> : "—") },
  ];

  return (
    <>
      <CabecalhoPagina
        c={CABECALHOS.senadores}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Senadores" }]}
      />
      <div className="card mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2"><Campo label="Nome"><BuscaUniversal variante="hero" compacto fixo modoInicial="senador" ufInicial={f.uf || null} /></Campo></div>
        <Campo label="Estado (UF)">
          <select className={selectCls} value={f.uf} onChange={(e) => set("uf", e.target.value)}>
            <option value="">Todos</option>{Object.entries(UFS).map(([s, n]) => <option key={s} value={s}>{s} — {n}</option>)}
          </select>
        </Campo>
        <Campo label="Partido">
          <select className={selectCls} value={f.partido} onChange={(e) => set("partido", e.target.value)}>
            <option value="">Todos</option>{partidos.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Campo>
        <Campo label="Sexo">
          <select className={selectCls} value={f.sexo} onChange={(e) => set("sexo", e.target.value)}>
            <option value="">Todos</option><option value="F">Feminino</option><option value="M">Masculino</option>
          </select>
        </Campo>
        <Campo label="Ordenar por" tip="Tempo de casa soma os períodos de exercício efetivo desde 1975, sem licenças.">
          <select className={selectCls} value={ordem} onChange={(e) => set("ordem", e.target.value === "nome" ? "" : e.target.value)}>
            <option value="nome">Nome</option><option value="tempo">Tempo de casa</option><option value="emendas">Emendas pagas</option>
          </select>
        </Campo>
      </div>

      {atual.isError ? <ErrorState error={atual.error} retry={() => atual.refetch()} /> : (
        <>
          <StatGrid className="mb-6">
            <Stat label="Senadores na seleção" value={atual.isPending ? "…" : formatNumber(filtrados.length)} />
            <Stat label="Mulheres" value={formatNumber(filtrados.filter((s) => s.sexo === "F").length)} />
            <Stat label="Partidos" value={formatNumber(porPartido.length)} />
            <Stat label="Emendas pagas (seleção)" tip="pago" value={autores.data ? <Money centavos={filtrados.reduce((s, x) => s + (x.pago ?? 0), 0)} compact /> : "…"} />
          </StatGrid>
          <div className="mb-4">
            <Segmentado label="Visualização" value={view} onChange={(v) => set("view", v === "grade" ? "" : v)} options={[{ value: "grade", label: "Cartões" }, { value: "tabela", label: "Tabela" }]} />
          </div>
          {atual.isPending ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
            : view === "tabela" ? (
              <DataTable rows={filtrados} columns={cols} pageSize={81} rowKey={(r) => r.codigo} exportName="senadores" search={(r) => `${r.nome} ${r.partido} ${r.uf}`} />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtrados.slice(0, limite).map((s) => (
                  <li key={s.codigo}>
                    <Link to={`/senador/${s.codigo}`} className="card flex h-full items-center gap-3 p-3 transition hover:shadow-[0_0_0_1px_var(--color-accent)]">
                      <Avatar src={s.foto} name={s.nome} size="lg" />
                      <span className="min-w-0 space-y-1">
                        <span className="block truncate font-semibold">{s.nome}</span>
                        <span className="flex items-center gap-1.5 text-xs text-muted"><PartyBadge sigla={s.partido} link={false} />{s.uf}</span>
                        {s.nMandatos != null && <ChipsMandato n={s.nMandatos} tempo={formatDuracao(s.dias ?? 0)} atual />}
                        {s.pago != null && <span className="block text-xs text-muted">Emendas pagas: <b className="text-fg"><Money centavos={s.pago} compact /></b></span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          {filtrados.length > limite && view === "grade" && (
            <div className="mt-4 text-center"><button type="button" className="rounded-xl border border-line px-4 py-2 text-sm" onClick={() => setLimite((l) => l + 81)}>Mostrar mais</button></div>
          )}
          <Section title="Composição do plenário" tip="Cada ponto é uma cadeira, colorida pelo partido atual do senador.">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><Hemicycle seats={seats} /></Card>
              <Card title="Senadores por partido"><Bars data={porPartido.map(([label, value]) => ({ label, value, color: partyColor(label), href: `/partido/${encodeURIComponent(label)}` }))} /></Card>
            </div>
          </Section>
        </>
      )}
      <Fontes items={[
        { label: "Lista atual (API do Senado)", href: fontes.senadoApi(sen.listaAtual()) },
        { label: `Mandatos desde a ${LEG_INI}ª legislatura (API do Senado)`, href: fontes.senadoApi(sen.listaLegislatura(LEG_INI, LEG_FIM)) },
        { label: "Senadores no site do Senado", href: "https://www25.senado.leg.br/web/senadores/em-exercicio" },
        ...fontes.emendas(),
      ]} />
    </>
  );
}
