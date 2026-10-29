import { BuscaUniversal } from "@/features/busca";
import clsx from "clsx";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Plus, Printer, Search, X } from "lucide-react";
import { semAcento } from "@emenda/contracts";
import { Avatar, Badge, Card, EmptyState, PageHeader, PartyBadge, Skeleton, Tip, formatNumber } from "@/ui";
import { cam, dedupeDeputados, mapSenadores, sen, type DeputadoLista, type SenadorResumo } from "@/features/legislativo/api";
import { useCamaraTodas, useSenado } from "@/features/legislativo/hooks";
import { Campo, inputCls, selectCls } from "@/features/legislativo/components";
import { ShareButton } from "@/features/share";
import { BoletimView } from "@/features/auditar/Boletim";
import { MaisVotados } from "@/features/auditar/MaisVotados";
import { useBoletimDeputado, useBoletimSenador, type Boletim } from "@/features/auditar/dados";
import { MAX_COMPARAR, parseComparar, serializarComparar, type Alvo, type CasaParam } from "@/features/auditar/regras";

// Esconde o cabeçalho/rodapé do site na impressão e evita quebrar cartões entre páginas.
const PRINT_CSS = `@media print {
  header.sticky, footer, nav[aria-label="Atalhos (móvel)"], [data-print-hide] { display: none !important; }
  main { max-width: none !important; padding: 0 !important; }
  .card { break-inside: avoid; box-shadow: none !important; }
  body { background: #fff !important; }
}`;

export default function AuditarPage() {
  const { casa, id } = useParams();
  const [sp, setSp] = useSearchParams();
  const comparar = parseComparar(sp.get("comparar"));
  const setComparar = (as: Alvo[]) => setSp((p) => { const n = new URLSearchParams(p); if (as.length) n.set("comparar", serializarComparar(as)); else n.delete("comparar"); return n; });

  const unico: Alvo | null = casa && id ? ((casa === "deputado" || casa === "senador") && /^\d+$/.test(id) ? { casa, id } : null) : null;
  if (casa && !unico) return <EmptyState title="Endereço inválido." hint={<Link className="link" to="/auditar">Escolher um parlamentar</Link>} />;

  return (
    <>
      <style>{PRINT_CSS}</style>
      <PageHeader
        eyebrow="Audite seu candidato"
        title={unico ? "Boletim do parlamentar" : comparar.length ? "Comparar parlamentares" : "Audite seu candidato"}
        subtitle="Antes de votar, veja o boletim do seu deputado ou senador: dinheiro que mandou, como votou, quanto gastou e o que propôs. Só números oficiais, sem opinião."
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Audite seu candidato", to: "/auditar" }, ...(unico ? [{ label: "Boletim" }] : [])]}
      />
      {unico ? <Unico alvo={unico} /> : comparar.length ? (
        <Comparar alvos={comparar} onChange={setComparar} />
      ) : (
        <>
          <MaisVotados />
          <Seletor comparar={comparar} onComparar={setComparar} />
        </>
      )}
      <Metodo />
    </>
  );
}

// ---------- boletins ----------
function BoletimDeputado(p: { id: string; render: (b: Boletim) => ReactNode }) { return <>{p.render(useBoletimDeputado(Number(p.id)))}</>; }
function BoletimSenador(p: { id: string; render: (b: Boletim) => ReactNode }) { return <>{p.render(useBoletimSenador(p.id))}</>; }
function ComBoletim({ alvo, render }: { alvo: Alvo; render: (b: Boletim) => ReactNode }) {
  return alvo.casa === "deputado" ? <BoletimDeputado id={alvo.id} render={render} /> : <BoletimSenador id={alvo.id} render={render} />;
}

const btn = "press inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold hover:bg-surface-2";

function Unico({ alvo }: { alvo: Alvo }) {
  const nav = useNavigate();
  const [escolher, setEscolher] = useState(false);
  return (
    <>
      <ComBoletim alvo={alvo} render={(b) => (
        <BoletimView b={b} acoes={<>
          {b.nome && (
            <ShareButton kind={alvo.casa} title={`Boletim: ${b.nome}`} subtitle={`${b.partido}-${b.uf}`} url={`/auditar/${alvo.casa}/${alvo.id}`} ogId={alvo.id}
              text={`🔎 Boletim de ${b.nome} (${b.partido}-${b.uf}): presença, votos, projetos, emendas e gastos com dados oficiais. Confira:`} />
          )}
          <button type="button" className={btn} onClick={() => window.print()}><Printer className="size-4" aria-hidden />Imprimir / PDF</button>
          <button type="button" className={btn} onClick={() => setEscolher((x) => !x)}><Plus className="size-4" aria-hidden />Comparar</button>
        </>} />
      )} />
      {escolher && (
        <div className="mt-6 print:hidden" data-print-hide>
          <h2 className="mb-3 text-lg font-bold">Comparar com…</h2>
          <Seletor comparar={[alvo]} onComparar={(as) => nav(`/auditar?comparar=${serializarComparar(as)}`)} />
        </div>
      )}
    </>
  );
}

function Comparar({ alvos, onChange }: { alvos: Alvo[]; onChange: (as: Alvo[]) => void }) {
  const [add, setAdd] = useState(false);
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden" data-print-hide>
        <button type="button" className={btn} onClick={() => window.print()}><Printer className="size-4" aria-hidden />Imprimir / PDF</button>
        {alvos.length < MAX_COMPARAR && <button type="button" className={btn} onClick={() => setAdd((x) => !x)}><Plus className="size-4" aria-hidden />Adicionar</button>}
        <ShareButton kind="pagina" title="Comparação de parlamentares" url={`/auditar?comparar=${serializarComparar(alvos)}`} subtitle="Presença, votos, projetos, emendas e gastos lado a lado" />
      </div>
      {add && <div className="mb-6 print:hidden" data-print-hide><Seletor comparar={alvos} onComparar={(as) => { onChange(as); setAdd(false); }} /></div>}
      <div className={clsx("grid gap-6", alvos.length === 2 && "lg:grid-cols-2", alvos.length >= 3 && "lg:grid-cols-2 xl:grid-cols-3")}>
        {alvos.map((a) => (
          <ComBoletim key={`${a.casa}:${a.id}`} alvo={a} render={(b) => (
            <BoletimView compacto b={b} acoes={<>
              <Link className={btn} to={`/auditar/${a.casa}/${a.id}`}>Abrir</Link>
              <button type="button" className={btn} aria-label={`Remover ${b.nome}`} onClick={() => onChange(alvos.filter((x) => x !== a))}><X className="size-4" aria-hidden /></button>
            </>} />
          )} />
        ))}
      </div>
    </>
  );
}

// ---------- busca ----------
interface Opcao { casa: CasaParam; id: string; nome: string; partido: string; uf: string; foto: string }
const k = (s: string) => semAcento(s).toLowerCase();

function Seletor({ comparar, onComparar }: { comparar: Alvo[]; onComparar: (as: Alvo[]) => void }) {
  const deps = useCamaraTodas<DeputadoLista>(cam.deputados({}));
  const sens = useSenado<SenadorResumo[]>(sen.listaAtual(), mapSenadores);
  const [q, setQ] = useState("");
  const [uf, setUf] = useState("");
  const [partido, setPartido] = useState("");
  const [casa, setCasa] = useState<"" | CasaParam>("");
  const opcoes = useMemo<Opcao[]>(() => [
    ...dedupeDeputados(deps.data ?? []).map((d) => ({ casa: "deputado" as const, id: String(d.id), nome: d.nome, partido: d.siglaPartido, uf: d.siglaUf, foto: d.urlFoto })),
    ...(sens.data ?? []).map((s) => ({ casa: "senador" as const, id: s.codigo, nome: s.nome, partido: s.partido, uf: s.uf, foto: s.foto })),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), [deps.data, sens.data]);
  const ufs = useMemo(() => [...new Set(opcoes.map((o) => o.uf))].filter(Boolean).sort(), [opcoes]);
  const partidos = useMemo(() => [...new Set(opcoes.map((o) => o.partido))].filter(Boolean).sort(), [opcoes]);
  const t = k(q.trim());
  const res = opcoes.filter((o) => (!t || k(o.nome).includes(t)) && (!uf || o.uf === uf) && (!partido || o.partido === partido) && (!casa || o.casa === casa));
  const filtrando = !!(t || uf || partido || casa);
  const naLista = (o: Opcao) => comparar.some((a) => a.casa === o.casa && a.id === o.id);

  return (
    <Card className="print:hidden">
      <BuscaUniversal variante="hero" modoInicial="deputado" modos={["deputado", "senador"]} className="mb-5"
        hrefDe={(it) => (it.tipo === "deputado" ? `/auditar/deputado/${it.id.slice(2)}` : it.tipo === "senador" ? `/auditar/senador/${it.id.slice(2)}` : it.href)} />
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Ou filtre e compare até {MAX_COMPARAR}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <Campo label="Nome">
          <span className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input className={clsx(inputCls, "pl-9")} placeholder="Filtrar por nome" value={q} onChange={(e) => setQ(e.target.value)} />
          </span>
        </Campo>
        <Campo label="Estado"><select className={selectCls} value={uf} onChange={(e) => setUf(e.target.value)}><option value="">Todos</option>{ufs.map((u) => <option key={u}>{u}</option>)}</select></Campo>
        <Campo label="Partido"><select className={selectCls} value={partido} onChange={(e) => setPartido(e.target.value)}><option value="">Todos</option>{partidos.map((u) => <option key={u}>{u}</option>)}</select></Campo>
        <Campo label="Casa">
          <select className={selectCls} value={casa} onChange={(e) => setCasa(e.target.value as "" | CasaParam)}>
            <option value="">Câmara e Senado</option><option value="deputado">Deputados</option><option value="senador">Senadores</option>
          </select>
        </Campo>
      </div>
      {comparar.length > 0 && <p className="mt-3 text-sm text-muted">Selecionados para comparar: {comparar.length} de {MAX_COMPARAR}.</p>}
      {deps.isPending || sens.isPending ? <Skeleton className="mt-4 h-40" /> : !filtrando ? (
        <p className="mt-4 text-sm text-muted">{formatNumber(opcoes.length)} parlamentares em exercício. Busque pelo nome ou filtre por estado e partido.</p>
      ) : res.length === 0 ? <EmptyState title="Ninguém encontrado com esses filtros." /> : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {res.slice(0, 8).map((o) => (
            <li key={`${o.casa}${o.id}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-line p-2.5">
              <Avatar src={o.foto} name={o.nome} size="md" />
              <span className="min-w-0 flex-1">
                <Link className="link block truncate font-medium" to={`/auditar/${o.casa}/${o.id}`}>{o.nome}</Link>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-muted"><PartyBadge sigla={o.partido} link={false} />{o.uf}<Badge tone={o.casa === "senador" ? "azul" : "neutro"}>{o.casa === "senador" ? "Senado" : "Câmara"}</Badge></span>
              </span>
              <button
                type="button" disabled={naLista(o) || comparar.length >= MAX_COMPARAR}
                onClick={() => onComparar([...comparar, { casa: o.casa, id: o.id }])}
                className="press shrink-0 rounded-lg border border-line px-2 py-1 text-xs font-semibold hover:bg-surface-2 disabled:opacity-40"
                title="Adicionar à comparação"
              >
                {naLista(o) ? "Na lista" : "+ Comparar"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {res.length > 8 && filtrando && <p className="mt-2 text-xs text-muted">Mostrando 8 de {formatNumber(res.length)}. Refine a busca.</p>}
      <p className="mt-3 text-xs text-muted">Ex-parlamentares também têm boletim: use o link a partir do perfil (/auditar/deputado/ID ou /auditar/senador/CÓDIGO).</p>
    </Card>
  );
}

function Metodo() {
  return (
    <section className="mt-10 rounded-2xl border border-line p-5 text-sm text-muted">
      <h2 className="mb-2 flex items-center gap-1 text-base font-semibold text-fg">Como o boletim é feito <Tip content="Tudo é calculado no seu navegador a partir das APIs oficiais; nada é editado à mão." /></h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Fontes: APIs de dados abertos da Câmara e do Senado, Portal da Transparência (emendas) e cota parlamentar (CEAP). Cada bloco tem o link da fonte.</li>
        <li>Os “pontos de atenção” usam regras fixas, iguais para todos, com o limite e a conta explicados. Não há nota, ranking geral ou opinião sobre a pessoa.</li>
        <li>Presença e orientação partidária na Câmara usam uma amostra das votações nominais mais recentes; no Senado, todas as votações nominais do mandato atual.</li>
        <li>Emendas são cruzadas pelo nome do parlamentar; homônimos raros podem causar divergência. Confira sempre a fonte.</li>
      </ul>
    </section>
  );
}
