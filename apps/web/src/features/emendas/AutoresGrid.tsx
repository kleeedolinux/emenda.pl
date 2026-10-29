// Grade de autores: foto, partido, UF, total pago, % Pix e série por ano. Detalhe do autor só carrega na tela.
import { dataPath, type Autor, type AutorResumo, type Uf } from "@emenda/contracts";
import { Plus, Zap } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { ShareButton } from "@/features/share";
import { formatBRL, formatNumber, formatPct } from "@/lib/format";
import { Avatar, Badge, CountUp, EmptyState, PartyBadge, Skeleton, useApi } from "@/ui";
import { urlAutor, useNaVista, useParlamentares } from "./explorador";
import { autoresDoRecorte, noEstado, nomeProprio, parlamentarDe, parteTipos, serieAnual, type AutorLinha, type Filtros, type IndiceParlamentares } from "./historias";
import { AvisoRecorte, Sparkline } from "./ui";

const brl = (n: number) => formatBRL(n, true);
const PASSO = 12;

export function AutoresGrid({ f, autores, uf, anos }: { f: Filtros; autores: AutorResumo[] | undefined; uf: Uf | null; anos: readonly number[] }) {
  const [ref, visto] = useNaVista<HTMLDivElement>();
  const pix = useApi<{ autores: AutorResumo[] }>(visto && f.tipo === "pix" && !f.uf ? dataPath.pix() : null);
  const idx = useParlamentares(visto);
  const [n, setN] = useState(PASSO);
  const r = autores ? autoresDoRecorte({ autores, uf, pix: pix.data?.autores ?? null }, f) : null;
  const lista = r?.lista.slice(0, n) ?? [];

  return (
    <div ref={ref}>
      {f.uf && <p className="-mt-2 mb-4 text-sm text-muted">Valores pagos {noEstado(f.uf)}. A linha mostra o total do autor no Brasil, ano a ano.</p>}
      <AvisoRecorte ignorados={r?.ignorados ?? []} className="mb-3 text-xs" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {!r ? Array.from({ length: 8 }, (_, i) => <li key={i}><Skeleton className="h-[10.5rem] rounded-2xl" /></li>) :
          lista.map((a, i) => <AutorCard key={a.codigo} a={a} i={i} idx={idx} anos={anos} />)}
      </ul>
      {r && !r.lista.length && <EmptyState title="Nenhum autor neste recorte" />}
      {r && r.lista.length > n && (
        <div className="mt-5 flex justify-center">
          <button type="button" onClick={() => setN((x) => x + PASSO)} className="press inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-5 py-2.5 text-sm font-semibold hover:border-accent">
            <Plus className="size-4" aria-hidden />Mostrar mais {Math.min(PASSO, r.lista.length - n)} de {formatNumber(r.lista.length - n)}
          </button>
        </div>
      )}
    </div>
  );
}

function AutorCard({ a, i, idx, anos }: { a: AutorLinha; i: number; idx: IndiceParlamentares; anos: readonly number[] }) {
  const reduce = useReducedMotion();
  const [ref, visto] = useNaVista<HTMLLIElement>("100px");
  const det = useApi<Autor>(visto ? dataPath.autor(a.codigo) : null);
  const p = parlamentarDe(idx, a.chave);
  const nome = p?.nome ?? nomeProprio(a.nome);
  const d = det.data;
  const serie = d ? serieAnual(d.porAno, anos) : null;
  const pix = d ? parteTipos(d.porTipo).pix : null;

  return (
    <motion.li
      ref={ref}
      initial={reduce ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.45, delay: (i % 4) * 0.05, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3 }}
      className="card group relative flex h-[10.5rem] flex-col p-4 transition-shadow hover:shadow-[0_0_0_1px_var(--color-accent),0_14px_40px_-16px_var(--color-glow)]"
    >
      <div className="flex items-start gap-3">
        <span className="relative">
          <Avatar src={p?.foto} name={nome} size="md" />
          <span className="absolute -left-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-fg px-1 text-[10px] font-bold text-bg tabular">{i + 1}</span>
        </span>
        <div className="min-w-0 flex-1">
          <Link to={urlAutor(a.codigo)} className="line-clamp-2 font-semibold leading-tight after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover:text-accent">{nome}</Link>
          <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-1.5 whitespace-nowrap text-xs text-muted">
            {p ? <><span className="relative z-10"><PartyBadge sigla={p.partido} /></span><span>{p.uf}</span><span>· {p.casa === "Senado" ? "Senador(a)" : "Deputado(a)"}</span></> : <span>{formatNumber(a.n)} emendas</span>}
          </div>
        </div>
        <span className="relative z-10 -mr-1 -mt-1"><ShareButton compact kind="autor" title={nome} url={urlAutor(a.codigo)} ogId={a.codigo} metric={{ value: a.pago, format: "brl", label: "pagas" }} /></span>
      </div>
      <div className="mt-auto flex items-end gap-3">
        <div className="min-w-0 shrink-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Total pago</p>
          <p className="font-display text-2xl font-bold leading-none tabular"><CountUp value={a.pago} format={brl} /></p>
          <span className="mt-2 block h-5">{pix === null ? <Skeleton className="h-5 w-16 rounded-full" /> : pix > 0 ? <Badge tone="amarelo"><Zap className="size-3" aria-hidden />{formatPct(pix)} Pix</Badge> : <Badge>sem Pix</Badge>}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="h-10">{serie ? <Sparkline values={serie} className="h-10 w-full" label={`Pago por ano, ${anos[0]} a ${anos.at(-1)}`} /> : <Skeleton className="h-10" />}</div>
          <div className="mt-0.5 flex justify-between text-[10px] text-muted tabular"><span>{anos[0]}</span><span>{anos.at(-1)}</span></div>
        </div>
      </div>
    </motion.li>
  );
}
