// "Compare": dois parlamentares ou dois municípios lado a lado, com frase pronta para compartilhar.
import { dataPath, type AutorResumo, type Municipio } from "@emenda/contracts";
import clsx from "clsx";
import { ArrowLeftRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useId, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ShareButton } from "@/features/share";
import { useMunicipiosIbge } from "@/lib/data";
import { formatBRL, formatNumber } from "@/lib/format";
import { Avatar, duration, easing, Skeleton, useApi } from "@/ui";
import { urlAutor, useNaVista, useParlamentares } from "./explorador";
import { classeAutor, comparar, fraseComparacao, nomeProprio, parlamentarDe, type Comparavel } from "./historias";
import { Segmento } from "./ui";

type Modo = "autor" | "mun";
const COR_A = "#009c3b", COR_B = "#002776";
const PADRAO_MUN = ["3550308", "3304557"] as const; // São Paulo x Rio de Janeiro
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

interface Lado extends Comparavel { href: string; foto?: string }

export function Comparar({ autores }: { autores: AutorResumo[] | undefined }) {
  const [sp] = useSearchParams();
  const [ref, visto] = useNaVista<HTMLDivElement>();
  const [modo, setModo] = useState<Modo>(sp.get("cm") === "mun" ? "mun" : "autor");
  const [sel, setSel] = useState<Record<Modo, [string | null, string | null]>>(() => {
    const a = sp.get("ca"), b = sp.get("cb");
    return sp.get("cm") === "mun" ? { mun: [a ?? PADRAO_MUN[0], b ?? PADRAO_MUN[1]], autor: [null, null] } : { autor: [a, b], mun: [...PADRAO_MUN] };
  });

  const pessoas = useMemo(() => (autores ?? []).filter((a) => classeAutor(a.nome) === "pessoa").sort((x, y) => y.pago - x.pago), [autores]);
  const idx = useParlamentares(visto);
  const muns = useMunicipiosIbge(visto && modo === "mun");
  const [ma, mb] = sel.mun;
  const qa = useApi<Municipio>(visto && modo === "mun" && ma ? dataPath.municipio(ma) : null);
  const qb = useApi<Municipio>(visto && modo === "mun" && mb ? dataPath.municipio(mb) : null);

  const [ca, cb] = sel.autor;
  const ladoAutor = (codigo: string | null, i: number): Lado | null => {
    const a = (codigo && pessoas.find((x) => x.codigo === codigo)) || pessoas[i];
    if (!a) return null;
    const p = parlamentarDe(idx, a.chave);
    return { nome: p?.nome ?? nomeProprio(a.nome), pago: a.pago, empenhado: a.empenhado, n: a.n, href: urlAutor(a.codigo), foto: p?.foto };
  };
  const ladoMun = (m: Municipio | undefined): Lado | null => (m ? { nome: `${m.nome}/${m.uf}`, pago: m.totais.pago, empenhado: m.totais.empenhado, n: m.totais.n, href: `/municipio/${m.ibge}` } : null);
  const A = modo === "autor" ? ladoAutor(ca, 0) : ladoMun(qa.data);
  const B = modo === "autor" ? ladoAutor(cb, 1) : ladoMun(qb.data);

  const opcoes = useMemo(() => modo === "autor"
    ? pessoas.map((a) => ({ id: a.codigo, label: nomeProprio(a.nome) }))
    : (muns.data ?? []).map((m) => ({ id: String(m.id), label: `${m.nome} – ${m.uf}` })), [modo, pessoas, muns.data]);
  const escolher = (i: 0 | 1, id: string) => setSel((s) => { const par = [...s[modo]] as [string | null, string | null]; par[i] = id; return { ...s, [modo]: par }; });
  const trocar = () => setSel((s) => ({ ...s, [modo]: [s[modo][1], s[modo][0]] }));
  const ids = modo === "autor" ? [ca ?? pessoas[0]?.codigo, cb ?? pessoas[1]?.codigo] : [ma, mb];
  const r = A && B ? comparar(A, B) : null;
  const frase = A && B ? fraseComparacao(A, B) : "";
  const url = `/emendas?cm=${modo}&ca=${ids[0] ?? ""}&cb=${ids[1] ?? ""}#comparar`;

  return (
    <div ref={ref} className="card overflow-hidden p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmento label="O que comparar" value={modo} onChange={setModo} options={[{ value: "autor", label: "Parlamentares" }, { value: "mun", label: "Municípios" }]} />
        {A && B && <ShareButton kind="pagina" title={`${A.nome} x ${B.nome}`} url={url} text={`⚖️ ${frase} Compare você também:`}
          bars={[{ label: A.nome, value: A.pago }, { label: B.nome, value: B.pago }]} label="Compartilhar comparação" />}
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-start gap-2 sm:gap-4">
        <Escolha lado={A} cor={COR_A} opcoes={opcoes} onPick={(id) => escolher(0, id)} rotulo="Primeiro" carregando={modo === "mun" && (qa.isPending || muns.isPending)} />
        <button type="button" onClick={trocar} aria-label="Trocar lados" className="press mt-8 inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface-2 font-display text-xs font-black text-muted hover:border-accent hover:text-fg">
          <ArrowLeftRight className="size-4" aria-hidden />
        </button>
        <Escolha lado={B} cor={COR_B} opcoes={opcoes} onPick={(id) => escolher(1, id)} rotulo="Segundo" carregando={modo === "mun" && (qb.isPending || muns.isPending)} alinhar="end" />
      </div>

      <div className="mt-6 min-h-[3.5rem] text-balance text-center font-display text-xl font-bold leading-snug sm:text-2xl" aria-live="polite">{frase || <Skeleton className="mx-auto h-7 w-3/4" />}</div>

      <div className="mt-5 space-y-5">
        {(r?.linhas ?? [{ chave: "pago" }, { chave: "empenhado" }, { chave: "n" }]).map((l) => (
          <div key={l.chave}>
            {"label" in l ? <Barras l={l} /> : <Skeleton className="h-10" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function Escolha({ lado, cor, opcoes, onPick, rotulo, carregando, alinhar = "start" }: {
  lado: Lado | null; cor: string; opcoes: Array<{ id: string; label: string }>; onPick: (id: string) => void; rotulo: string; carregando: boolean; alinhar?: "start" | "end";
}) {
  const lid = useId();
  const [txt, setTxt] = useState("");
  const pick = (v: string) => {
    setTxt(v);
    const o = opcoes.find((x) => norm(x.label) === norm(v));
    if (o) { onPick(o.id); setTxt(""); }
  };
  return (
    <div className={clsx("flex min-w-0 flex-col gap-2", alinhar === "end" ? "items-end text-right" : "items-start")}>
      <div className={clsx("flex min-w-0 items-center gap-2.5", alinhar === "end" && "flex-row-reverse")}>
        <span className="rounded-full p-0.5" style={{ background: cor }}><Avatar src={lado?.foto} name={lado?.nome ?? "?"} size="md" /></span>
        <span className="min-w-0">
          {carregando || !lado ? <Skeleton className="h-5 w-28" /> : <Link to={lado.href} className="line-clamp-2 font-semibold leading-tight hover:underline" style={{ color: cor }}>{lado.nome}</Link>}
        </span>
      </div>
      <label className="w-full">
        <span className="sr-only">{rotulo}: trocar</span>
        <input list={lid} value={txt} onChange={(e) => pick(e.target.value)} placeholder={opcoes.length ? "Trocar…" : "Carregando…"}
          className={clsx("h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent", alinhar === "end" && "text-right")} />
        <datalist id={lid}>{opcoes.slice(0, 6000).map((o) => <option key={o.id} value={o.label} />)}</datalist>
      </label>
    </div>
  );
}

function Barras({ l }: { l: ReturnType<typeof comparar>["linhas"][number] }) {
  const reduce = useReducedMotion();
  const fmt = (n: number) => (l.chave === "n" ? formatNumber(n) : formatBRL(n, true));
  const lado = (v: number, cor: string, dir: "l" | "r") => (
    <div className={clsx("flex h-7 flex-1 overflow-hidden rounded-full bg-surface-2", dir === "l" && "justify-end")}>
      <motion.span className={clsx("block h-full rounded-full", dir === "l" ? "origin-right" : "origin-left")}
        style={{ width: `${l.max ? Math.max(1.5, (v / l.max) * 100) : 0}%`, background: cor }}
        initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }}
        key={`${v}-${l.max}`} transition={{ duration: duration.slower, ease: easing.expo }} />
    </div>
  );
  return (
    <>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <b className="whitespace-nowrap tabular" style={{ color: COR_A }}>{fmt(l.a)}</b>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted max-sm:order-first max-sm:basis-full max-sm:text-center">{l.label}</span>
        <b className="whitespace-nowrap tabular text-azul dark:text-[#a9c3ff]">{fmt(l.b)}</b>
      </div>
      <div className="flex gap-1.5">{lado(l.a, COR_A, "l")}{lado(l.b, COR_B, "r")}</div>
    </>
  );
}
