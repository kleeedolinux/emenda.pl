// Boletim "Audite seu candidato": indicadores factuais por tema + pontos de atenção com fórmula e fonte.
import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { AlertTriangle, CheckCircle2, CircleDashed, FileText, HandCoins, Landmark, ListChecks, Users, Vote, Wallet } from "lucide-react";
import { UFS, type SiglaUf } from "@emenda/contracts";
import { Avatar, Badge, Card, EmptyState, Money, PartyBadge, Skeleton, Spinner, Tip, VoteBadge, formatNumber, formatPct } from "@/ui";
import { ChipsMandato, Fontes, resumoMandatos } from "@/features/legislativo/components";
import { CardPautas } from "@/features/perfil/Pautas";
import { LinhaPartidos, TIP_JANELA } from "@/features/perfil/Trocas";
import { topMunicipios } from "@/features/perfil/resumo";
import { formatCnpjCpf, mesAno } from "@/features/gastos/gastos";
import { bancadaPorId } from "@/features/bancadas/catalogo";
import { DESFECHO_LABEL, pontosDeAtencao, type Desfecho, type Ponto } from "./regras";
import { indicadoresDe, type Boletim, type Secao } from "./dados";

const cargo = (b: Boletim) => (b.casa === "senador" ? (b.sexo === "F" ? "Senadora" : "Senador") : b.sexo === "F" ? "Deputada federal" : "Deputado federal");
const pct = (x: number | null | undefined) => (x == null ? "—" : formatPct(x));

function Ficha({ icon, titulo, tip, secao, children, className }: { icon: ReactNode; titulo: string; tip?: ReactNode; secao?: Secao<unknown>; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("card relative min-w-0 break-inside-avoid p-5", className)}>
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <span className="rounded-lg bg-verde/12 p-1.5 text-accent">{icon}</span>{titulo}{tip && <Tip content={tip} />}
      </h3>
      {secao?.carregando ? <Spinner label="Consultando fonte oficial…" /> : children}
      {secao?.nota && <p className="mt-3 text-xs text-muted">{secao.nota}</p>}
      {secao && <Fontes items={secao.fontes} />}
    </section>
  );
}

function Numero({ rotulo, valor, dica }: { rotulo: ReactNode; valor: ReactNode; dica?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs text-muted">{rotulo}{dica && <Tip content={dica} />}</dt>
      <dd className="font-display text-xl font-bold tabular">{valor}</dd>
    </div>
  );
}

const ICONE: Record<Ponto["status"], ReactNode> = {
  atencao: <AlertTriangle className="size-5 shrink-0 text-amarelo" aria-label="Ponto de atenção" />,
  ok: <CheckCircle2 className="size-5 shrink-0 text-verde" aria-label="Dentro do limite" />,
  "sem-dados": <CircleDashed className="size-5 shrink-0 text-muted" aria-label="Sem dados" />,
};

export function PontosAtencao({ b }: { b: Boletim }) {
  const ps = pontosDeAtencao(indicadoresDe(b));
  const n = ps.filter((p) => p.status === "atencao").length;
  const fonte: Record<string, Secao<unknown>> = { gastos: b.gastos, orientacao: b.alinhamento, trocas: b.trocas, pix: b.emendas, presenca: b.presenca, "fora-uf": b.emendas };
  return (
    <section className="card break-inside-avoid border-l-4 border-l-amarelo p-5" aria-labelledby={`pontos-${b.id}`}>
      <h2 id={`pontos-${b.id}`} className="flex flex-wrap items-center gap-2 text-lg font-bold">
        <ListChecks className="size-5 text-accent" aria-hidden />Pontos de atenção
        <Badge tone={n ? "amarelo" : "verde"}>{n} de {ps.length}</Badge>
        <Tip content="Regras fixas e iguais para todos: cada item compara um número público com um limite explícito. Não é nota nem juízo sobre a pessoa; serve para saber onde olhar com mais cuidado." />
      </h2>
      <ul className="mt-3 divide-y divide-line">
        {ps.map((p) => {
          const carregando = fonte[p.id]?.carregando;
          return (
            <li key={p.id} className="flex items-start gap-3 py-2.5">
              {carregando ? <Spinner label="" /> : ICONE[p.status]}
              <span className="min-w-0 text-sm">
                <span className="flex items-center gap-1 font-semibold">{p.titulo}<Tip content={<><b>Como calculamos:</b> {p.formula}</>} /></span>
                <span className="block text-muted">{carregando ? "Consultando…" : p.texto}</span>
                {fonte[p.id]?.fontes[0] && <a className="link text-xs print:hidden" href={fonte[p.id]!.fontes[0]!.href} target="_blank" rel="noreferrer">fonte: {fonte[p.id]!.fontes[0]!.label}</a>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Identidade({ b, acoes }: { b: Boletim; acoes?: ReactNode }) {
  const r = resumoMandatos(b.mandatos);
  const perfil = b.casa === "deputado" ? `/deputado/${b.id}` : `/senador/${b.id}`;
  return (
    <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <Avatar src={b.foto} name={b.nome || "?"} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">{cargo(b)}</p>
        <h2 className="text-2xl font-bold leading-tight">{b.nome || <Skeleton className="h-7 w-48" />}</h2>
        {b.nomeCivil && b.nomeCivil !== b.nome && <p className="text-sm text-muted">Nome civil: {b.nomeCivil}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {b.partido && <PartyBadge sigla={b.partido} />}
          {b.uf && <Link className="link" to={`/uf/${b.uf}`}>{UFS[b.uf as SiglaUf] ?? b.uf}</Link>}
          {b.mandatos.length > 0 && <ChipsMandato {...r} />}
        </p>
        <p className="mt-2 text-sm"><Link className="link print:hidden" to={perfil}>Perfil completo →</Link></p>
      </div>
      {acoes && <div className="flex shrink-0 flex-wrap gap-2 print:hidden">{acoes}</div>}
    </section>
  );
}

const ORDEM: Desfecho[] = ["lei", "avancou", "tramitando", "arquivada"];
const COR: Record<Desfecho, string> = { lei: "bg-verde", avancou: "bg-azul", tramitando: "bg-amarelo", arquivada: "bg-[#94a3b8]" };

function Producao({ b }: { b: Boletim }) {
  const v = b.producao.valor;
  return (
    <Ficha icon={<FileText className="size-4" aria-hidden />} titulo="Produção legislativa" secao={b.producao}
      tip="Projetos que podem virar lei e o que aconteceu com eles. Ser coautor de muitos projetos não significa que foram aprovados; a maioria dos projetos no Congresso não chega a ser votada.">
      {!v ? <EmptyState title="Sem dados de autoria." /> : (
        <>
          <dl className="grid grid-cols-2 gap-3">
            {v.totalGeral != null && <Numero rotulo="Proposições (todos os tipos)" valor={formatNumber(v.totalGeral)} dica="Inclui requerimentos, indicações e emendas, além de projetos." />}
            <Numero rotulo="Projetos que mudam leis" valor={formatNumber(v.universo)} />
            <Numero rotulo={DESFECHO_LABEL.lei} valor={formatNumber(v.resumo.lei)} />
            <Numero rotulo="Aprovados numa etapa" valor={formatNumber(v.resumo.avancou)} dica={DESFECHO_LABEL.avancou} />
          </dl>
          {v.resumo.total > 0 && (
            <>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={ORDEM.map((d) => `${DESFECHO_LABEL[d]}: ${v.resumo[d]}`).join("; ")}>
                {ORDEM.map((d) => <span key={d} className={COR[d]} style={{ width: `${(v.resumo[d] / v.resumo.total) * 100}%` }} />)}
              </div>
              <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                {ORDEM.map((d) => <li key={d} className="flex items-center gap-1.5"><span className={clsx("size-2.5 rounded-full", COR[d])} aria-hidden />{DESFECHO_LABEL[d]}: <b className="tabular">{v.resumo[d]}</b></li>)}
              </ul>
              <p className="mt-2 flex flex-wrap gap-1 text-xs">
                {v.resumo.porTipo.map((t) => <Badge key={t.tipo} tone="azul">{t.tipo}: {t.n}</Badge>)}
                {v.analisadas < v.universo && <span className="text-muted">({v.analisadas} mais recentes analisados)</span>}
              </p>
            </>
          )}
        </>
      )}
    </Ficha>
  );
}

function Votos({ b }: { b: Boletim }) {
  const p = b.presenca.valor;
  const a = b.alinhamento.valor;
  const just = p && "justificada" in p ? p : null;
  return (
    <Ficha icon={<Vote className="size-4" aria-hidden />} titulo="Presença e orientação do partido" secao={b.presenca}
      tip="Em votação nominal cada voto fica registrado. Ausência não é voto contra; licenças médicas e missões oficiais também aparecem como ausência.">
      <dl className="grid grid-cols-2 gap-3">
        <Numero rotulo="Presença nas votações" valor={pct(p?.pct)} dica={p ? `${p.presente} de ${p.total} votações nominais com voto registrado.` : undefined} />
        <Numero rotulo="Contra a orientação do partido" valor={b.alinhamento.carregando ? "…" : pct(a?.pctContra)}
          dica={a && a.total ? `${a.contra} de ${a.total} votos com orientação Sim/Não/Abstenção/Obstrução do partido.` : b.alinhamento.nota} />
      </dl>
      {just && <p className="mt-2 text-xs text-muted">Ausências: {just.justificada} justificadas (licença, missão) · {just.semJustificativa} sem justificativa (NCom).</p>}
      {b.alinhamento.nota && <p className="mt-2 text-xs text-muted">{b.alinhamento.nota}</p>}
    </Ficha>
  );
}

function Emendas({ b }: { b: Boletim }) {
  const v = b.emendas.valor;
  const top = v ? topMunicipios(v.autor.emendas, 5) : [];
  return (
    <Ficha icon={<HandCoins className="size-4" aria-hidden />} titulo="Emendas parlamentares" secao={b.emendas}
      tip="Parte do Orçamento da União que o parlamentar indica para onde vai. “Pago” é o que de fato saiu do caixa (inclui restos a pagar). Cruzamento por nome com o Portal da Transparência.">
      {b.emendas.semCorrespondencia ? <EmptyState title="Nome não encontrado entre os autores de emendas." hint="Suplentes e recém-empossados podem não ter emendas pagas." /> : !v ? <Skeleton className="h-24" /> : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Numero rotulo="Total pago" valor={<Money centavos={v.ind.pago} compact />} />
            <Numero rotulo="Via Emenda Pix" valor={pct(v.ind.pctPix)} dica="Transferência especial: o dinheiro cai direto no caixa do município ou estado, sem convênio prévio." />
            <Numero rotulo={`Para fora de ${b.uf}`} valor={pct(v.ind.pctForaUf)} dica="Entre as emendas com UF de destino identificada." />
          </dl>
          {top.length > 0 && (
            <ol className="mt-3 space-y-1 text-sm">
              {top.map((m, i) => (
                <li key={m.ibge} className="flex justify-between gap-2">
                  <span className="truncate">{i + 1}. <Link className="link" to={`/municipio/${m.ibge}`}>{m.nome}</Link></span>
                  <Money centavos={m.valor} compact className="shrink-0 tabular" />
                </li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-xs print:hidden"><Link className="link" to={`/autor/${v.autor.codigo}`}>Ver cada emenda →</Link></p>
        </>
      )}
    </Ficha>
  );
}

function Gastos({ b }: { b: Boletim }) {
  const v = b.gastos.valor;
  const arq = v?.arquivo;
  const comp = v?.comp;
  const casa = b.casa === "deputado" ? "Câmara" : "Senado";
  return (
    <Ficha icon={<Wallet className="size-4" aria-hidden />} titulo="Cota parlamentar (CEAP)" secao={b.gastos}
      tip="Reembolso de despesas do mandato: passagens, combustível, escritório, divulgação etc. Gastar mais não é ilegal; é um dado para comparar.">
      {!v || (!arq && !comp) ? <EmptyState title="Sem dados de cota para este parlamentar." /> : (
        <>
          <dl className="grid grid-cols-2 gap-3">
            {comp && <Numero rotulo="Total na legislatura" valor={<Money centavos={comp.valor} compact />} />}
            {comp && <Numero rotulo={`Média da ${casa}`} valor={<Money centavos={Math.round(comp.media)} compact />} dica={`Média entre ${formatNumber(comp.n)} parlamentares em exercício.`} />}
            {arq && <Numero rotulo="Média mensal" valor={<Money centavos={arq.mandato.mediaMensal} compact />} dica={`${arq.mandato.meses} meses desde ${mesAno(arq.mandato.inicio)}; dados até ${mesAno(arq.dadosAte)}.`} />}
            {comp && <Numero rotulo="Posição (maior gasto = 1º)" valor={`${comp.posicao}º de ${comp.n}`} />}
          </dl>
          {arq && arq.topFornecedores.length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold text-muted">Maiores fornecedores</p>
              <ol className="mt-1 space-y-1 text-sm">
                {arq.topFornecedores.slice(0, 3).map((f) => (
                  <li key={f.cnpjCpf} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate" title={formatCnpjCpf(f.cnpjCpf)}>{f.nome}</span>
                    <Money centavos={f.valor} compact className="shrink-0 tabular" />
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </Ficha>
  );
}

function Mandatos({ b }: { b: Boletim }) {
  const r = resumoMandatos(b.mandatos);
  return (
    <Ficha icon={<Landmark className="size-4" aria-hidden />} titulo="Mandatos e partidos" secao={b.trocas} tip={TIP_JANELA}>
      <dl className="mb-3 grid grid-cols-2 gap-3">
        <Numero rotulo="Mandatos" valor={formatNumber(r.n)} />
        <Numero rotulo="Tempo de casa" valor={<span className="text-base">{r.estimado ? "≈ " : ""}{r.tempo}</span>} dica="Soma dos períodos de exercício, sem licenças e afastamentos." />
      </dl>
      {b.trocas.valor ? <LinhaPartidos trocas={b.trocas.valor} atual={b.partido} /> : <p className="text-sm text-muted">Sem histórico de filiação.</p>}
    </Ficha>
  );
}

function Frentes({ b }: { b: Boletim }) {
  const [todas, setTodas] = useState(false);
  const fs = b.frentes.valor;
  const ord = fs ? [...fs].sort((x, y) => Number(!!bancadaPorId(y.id)) - Number(!!bancadaPorId(x.id)) || x.titulo.localeCompare(y.titulo, "pt-BR")) : [];
  const vis = todas ? ord : ord.slice(0, 14);
  return (
    <Ficha icon={<Users className="size-4" aria-hidden />} titulo="Bancadas e frentes de que participa" secao={b.frentes}
      tip="Bancadas temáticas conhecidas aparecem primeiro, com borda verde. Participar de uma frente não obriga a votar de determinado jeito.">
      {!fs ? null : fs.length === 0 ? <p className="text-sm text-muted">Não participa de frentes nesta legislatura.</p> : (
        <>
          <p className="mb-2 text-sm">Participa de <b>{fs.length}</b> frentes parlamentares nesta legislatura.</p>
          <ul className="flex flex-wrap gap-1.5">
            {vis.map((f) => {
              const t = bancadaPorId(f.id);
              return (
                <li key={f.id} className="max-w-full">
                  <Link to={`/bancada/${t?.slug ?? f.id}`} className={clsx("inline-block max-w-full truncate rounded-full border px-2.5 py-1 text-xs hover:bg-surface-2", t ? "border-verde font-semibold" : "border-line")}>
                    {t?.apelido ?? f.titulo.replace(/^Frente Parlamentar\s+(Mista\s+)?/i, "")}
                  </Link>
                </li>
              );
            })}
          </ul>
          {ord.length > vis.length && (
            <button type="button" className="link mt-2 text-xs print:hidden" onClick={() => setTodas(true)}>Ver todas as {ord.length}</button>
          )}
        </>
      )}
    </Ficha>
  );
}

/** Boletim completo. `compacto` = coluna do modo comparar. */
export function BoletimView({ b, acoes, compacto }: { b: Boletim; acoes?: ReactNode; compacto?: boolean }) {
  if (b.erro) return <EmptyState title="Não foi possível carregar este parlamentar." hint={b.erro.message} />;
  return (
    <div className="space-y-4">
      <Identidade b={b} acoes={acoes} />
      <PontosAtencao b={b} />
      <div className={clsx("grid gap-4", !compacto && "lg:grid-cols-2")}>
        <Mandatos b={b} />
        <Producao b={b} />
        <Votos b={b} />
        <Emendas b={b} />
        <Gastos b={b} />
        <Frentes b={b} />
      </div>
      {!compacto && <CardPautas itens={b.pautas.itens} carregando={b.pautas.carregando} />}
      {compacto && (
        <Card title="Pautas polêmicas">
          {b.pautas.carregando ? <Spinner /> : b.pautas.itens.length === 0 ? <p className="text-sm text-muted">Sem votos nominais dessas pautas.</p> : (
            <ul className="space-y-1 text-sm">{b.pautas.itens.map((x) => <li key={x.pauta.apelido} className="flex justify-between gap-2"><span className="truncate">{x.pauta.apelido}</span>{x.voto ? <VoteBadge voto={x.voto} /> : <Spinner label="" />}</li>)}</ul>
          )}
        </Card>
      )}
      <Fontes items={b.fontes} />
    </div>
  );
}
