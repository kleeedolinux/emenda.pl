// Peças visuais da página /congresso (compostas com "@/ui").
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import {
  Building2, ClipboardCheck, GraduationCap, HeartPulse, Landmark, Leaf, Palette, Scale, Shield, Sprout, TrainFront, Users, Wallet, Wifi, Briefcase, FileText,
} from "lucide-react";
import { Avatar, Card, EmptyState, PartyBadge, Skeleton, Tip, formatNumber } from "@/ui";
import { ShareButton } from "@/features/share";
import type { ShareKind } from "@/features/share";
import type { Membro } from "./composicao";
import type { Posicionada, Linha } from "./rankings";
import type { IconeTema } from "./resumo";

export const auditarHref = (m: Pick<Membro, "casa" | "id">) => `/auditar/${m.casa === "camara" ? "deputado" : "senador"}/${m.id}`;
export const casaLabel = (c: Membro["casa"]) => (c === "camara" ? "Dep." : "Sen.");

/** Linha de ranking: posição, foto, nome (perfil), partido-UF, barra proporcional e valor; atalho para /auditar. */
export function LinhaRanking({ l, max, valor, i }: { l: Posicionada<Linha>; max: number; valor: ReactNode; i: number }) {
  const reduce = useReducedMotion();
  const frac = max > 0 ? Math.max(0.01, Math.min(1, l.valor / max)) : 0;
  const m = l.membro;
  return (
    <li className="group relative grid grid-cols-[1.75rem_2.25rem_1fr_auto] items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-surface-2">
      <span className="tabular text-right text-xs font-semibold text-muted">{l.posicao}º</span>
      <Avatar src={m.foto} name={m.nome} size="sm" />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <Link to={m.href} className="link truncate text-sm font-semibold">{m.nome}</Link>
          <span className="hidden shrink-0 sm:inline"><PartyBadge sigla={m.partido} link={false} /></span>
          <span className="shrink-0 text-xs text-muted">{casaLabel(m.casa)} · {m.uf}</span>
        </span>
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <motion.span
            className="block h-full origin-left rounded-full bg-gradient-to-r from-verde to-azul"
            initial={reduce ? false : { scaleX: 0 }} whileInView={{ scaleX: frac }} viewport={{ once: true }}
            transition={{ duration: 0.7, delay: Math.min(i, 10) * 0.04 }} style={reduce ? { transform: `scaleX(${frac})` } : undefined}
          />
        </span>
      </span>
      <span className="flex items-center gap-1">
        <span className="tabular text-sm font-semibold">{valor}</span>
        <Link to={auditarHref(m)} title={`Auditar ${m.nome}`} aria-label={`Auditar ${m.nome}`} className="press inline-flex size-7 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-fg">
          <ClipboardCheck className="size-4" aria-hidden />
        </Link>
      </span>
    </li>
  );
}

export interface RankingProps {
  titulo: string;
  tip: ReactNode;
  linhas: Posicionada<Linha>[] | null;
  formato: (n: number) => string;
  /** Texto do valor (ex.: "92%"); padrão = formato(valor) */
  rotulo?: (l: Posicionada<Linha>) => ReactNode;
  share: { kind?: ShareKind; metric: "brl" | "int"; label: string; url: string };
  vazio?: ReactNode;
  carregando?: ReactNode;
  n?: number;
  rodape?: ReactNode;
}

/** Cartão de ranking: top N com "ver mais", compartilhamento e nota de método. */
export function CardRanking({ titulo, tip, linhas, formato, rotulo, share, vazio, carregando, n = 10, rodape }: RankingProps) {
  const [mais, setMais] = useState(false);
  if (!linhas) return <Card title={titulo} tip={tip}>{carregando ?? <Skeleton className="h-72" />}</Card>;
  const vis = linhas.slice(0, mais ? 50 : n);
  const max = Math.max(0, ...linhas.map((l) => l.valor));
  const top = linhas.slice(0, 5);
  return (
    <Card
      title={titulo} tip={tip}
      actions={linhas.length > 0 && (
        <ShareButton compact kind={share.kind ?? "pagina"} title={titulo} url={share.url}
          metric={top[0] ? { value: top[0].valor, format: share.metric, label: share.label } : undefined}
          bars={top.map((l) => ({ label: l.membro.nome, value: l.valor }))} subtitle="Congresso Nacional — dados oficiais" />
      )}
    >
      {linhas.length === 0 ? (vazio ?? <EmptyState title="Nada para mostrar com estes filtros." />) : (
        <>
          <ol className="-mx-2 space-y-0.5">
            {vis.map((l, i) => <LinhaRanking key={`${l.membro.casa}-${l.membro.id}`} l={l} max={max} i={i} valor={rotulo ? rotulo(l) : formato(l.valor)} />)}
          </ol>
          {linhas.length > n && (
            <button type="button" onClick={() => setMais((v) => !v)} className="press mt-3 text-sm font-semibold text-accent hover:underline">
              {mais ? "Mostrar menos" : `Ver até 50 (de ${formatNumber(linhas.length)})`}
            </button>
          )}
        </>
      )}
      {rodape && <p className="mt-3 border-t border-line pt-3 text-xs text-muted">{rodape}</p>}
    </Card>
  );
}

/** Cartão "quem mais / quem menos" em linguagem simples. */
export function CardDestaque({ icone, titulo, mais, menos, formato, tip }: {
  icone: ReactNode; titulo: string; mais: Linha | null; menos?: Linha | null; formato: (n: number) => string; tip?: ReactNode;
}) {
  const bloco = (rot: string, l: Linha | null | undefined, tom: string) => l && (
    <div className="flex items-center gap-3">
      <Avatar src={l.membro.foto} name={l.membro.nome} size="md" />
      <div className="min-w-0">
        <p className={`text-[11px] font-semibold uppercase tracking-wider ${tom}`}>{rot}</p>
        <Link to={l.membro.href} className="link block truncate font-semibold">{l.membro.nome}</Link>
        <p className="text-xs text-muted">{l.membro.partido}-{l.membro.uf} · <span className="tabular font-semibold text-fg">{formato(l.valor)}</span></p>
      </div>
    </div>
  );
  return (
    <motion.article whileHover={{ y: -3 }} className="card flex flex-col gap-3 p-4">
      <header className="flex items-center gap-2 text-sm font-bold">
        <span className="inline-flex size-8 items-center justify-center rounded-xl bg-verde/12 text-verde-700 dark:text-[#5fe39a]">{icone}</span>
        <span className="min-w-0 flex-1">{titulo}</span>
        {tip && <Tip content={tip} />}
      </header>
      {mais ? bloco("Mais", mais, "text-verde-700 dark:text-[#5fe39a]") : <Skeleton className="h-12" />}
      {menos !== undefined && (menos ? bloco("Menos", menos, "text-muted") : <Skeleton className="h-12" />)}
    </motion.article>
  );
}

/** Barra de resultado Sim/Não/Abstenção. */
export function BarraResultado({ sim, nao, abstencao }: { sim: number; nao: number; abstencao: number }) {
  const t = Math.max(1, sim + nao + abstencao);
  const seg = (v: number, cls: string, rot: string) => v > 0 && (
    <span className={`block h-full ${cls}`} style={{ width: `${(v / t) * 100}%` }} title={`${rot}: ${v}`} />
  );
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Sim ${sim}, Não ${nao}, Abstenção ${abstencao}`}>
        {seg(sim, "bg-[#16a34a]", "Sim")}{seg(nao, "bg-[#dc2626]", "Não")}{seg(abstencao, "bg-[#eab308]", "Abstenção")}
      </div>
      <p className="mt-1 flex gap-3 text-xs text-muted tabular">
        <span><b className="text-[#16a34a]">{sim}</b> sim</span><span><b className="text-[#dc2626]">{nao}</b> não</span>{abstencao > 0 && <span>{abstencao} abst.</span>}
      </p>
    </div>
  );
}

const ICONES: Record<IconeTema, typeof HeartPulse> = {
  saude: HeartPulse, educacao: GraduationCap, seguranca: Shield, economia: Wallet, trabalho: Briefcase, ambiente: Leaf, cidades: Building2,
  transporte: TrainFront, social: Users, direitos: Scale, campo: Sprout, cultura: Palette, tecnologia: Wifi, politica: Landmark, outros: FileText,
};
export function IconeTemaSvg({ icone, className = "size-4" }: { icone: IconeTema; className?: string }) {
  const I = ICONES[icone];
  return <I className={className} aria-hidden />;
}

/** Nota de método curta (sempre visível) + detalhe em Tip. */
export function Metodo({ children, tip }: { children: ReactNode; tip?: ReactNode }) {
  return <p className="mt-2 flex items-start gap-1 text-xs text-muted"><span>{children}</span>{tip && <Tip content={tip} label="Como calculamos" />}</p>;
}
