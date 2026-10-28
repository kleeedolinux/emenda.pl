// Filtros do explorador em chips: tipo, ano, estado. Atualizam a URL e todos os cartões.
import { TIPOS_EMENDA, UFS, type Brasil, type TipoEmenda, type Uf } from "@emenda/contracts";
import clsx from "clsx";
import { X, Zap } from "lucide-react";
import { formatBRL, formatNumber } from "@/lib/format";
import { CountUp, Skeleton, Term } from "@/ui";
import { alternar } from "./explorador";
import { recorte, type Dim, type Filtros } from "./historias";
import { COR_TIPO, nomeTipoCurto, TIP_TIPO } from "./tipos";
import { AvisoRecorte } from "./ui";

const TIPOS = (Object.keys(TIPOS_EMENDA) as TipoEmenda[]).filter((t) => t !== "outra");
const chip = (on: boolean) => clsx(
  "press inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition",
  on ? "border-transparent bg-fg text-bg shadow-sm" : "border-line bg-surface text-fg/80 hover:border-accent hover:text-fg",
);
const select = "press h-9 rounded-full border border-line bg-surface pl-3 pr-8 text-sm font-medium hover:border-accent focus-visible:ring-2 focus-visible:ring-accent";

export function FiltrosBar({ f, set, anos, brasil, uf }: {
  f: Filtros; set: (p: Partial<Record<Dim, string | number | undefined>>) => void; anos: readonly number[]; brasil: Brasil | undefined; uf: Uf | null;
}) {
  const r = brasil ? recorte(brasil, uf, f) : null;
  const ativo = !!(f.tipo || f.ano || f.uf);
  const desc = [f.tipo && nomeTipoCurto(f.tipo), f.ano, f.uf && UFS[f.uf as keyof typeof UFS]].filter(Boolean).join(" · ");

  return (
    <div className="z-30 -mx-4 mt-6 md:sticky md:top-16 border-y border-line bg-bg/85 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div role="radiogroup" aria-label="Tipo de emenda" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          <button type="button" role="radio" aria-checked={!f.tipo} onClick={() => set({ tipo: undefined })} className={chip(!f.tipo)}>Todos</button>
          {TIPOS.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={f.tipo === t} onClick={() => set({ tipo: alternar(f.tipo, t) })} className={chip(f.tipo === t)}>
              {t === "pix" ? <Zap className="size-3.5" style={{ color: f.tipo === t ? undefined : COR_TIPO.pix }} aria-hidden /> : <span className="size-2 rounded-full" style={{ background: COR_TIPO[t] }} aria-hidden />}
              {nomeTipoCurto(t)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="relative">
            <span className="sr-only">Ano</span>
            <select value={f.ano ?? ""} onChange={(e) => set({ ano: e.target.value || undefined })} className={clsx(select, f.ano && "border-fg")}>
              <option value="">Todos os anos</option>
              {[...anos].reverse().map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="relative min-w-0 flex-1 lg:flex-none">
            <span className="sr-only">Estado</span>
            <select value={f.uf ?? ""} onChange={(e) => set({ uf: e.target.value || undefined })} className={clsx(select, "w-full", f.uf && "border-fg")}>
              <option value="">Brasil inteiro</option>
              {Object.entries(UFS).sort((a, b) => a[1].localeCompare(b[1], "pt-BR")).map(([s, n]) => <option key={s} value={s}>{n}</option>)}
            </select>
          </label>
          {ativo && (
            <button type="button" onClick={() => set({ tipo: undefined, ano: undefined, uf: undefined })} className="press inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg">
              <X className="size-4" aria-hidden />Limpar
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex min-h-5 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm" aria-live="polite">
        {f.tipo && <span className="text-muted"><Term k={TIP_TIPO[f.tipo]}>{TIPOS_EMENDA[f.tipo]}</Term> ·</span>}
        {r ? (
          <span>
            <span className="text-muted">{ativo ? `${desc}: ` : "Tudo: "}</span>
            <b className="tabular"><CountUp value={r.totais.pago} format={(n) => formatBRL(n, true)} duration={0.6} /></b>
            <span className="text-muted"> pagos em {formatNumber(r.totais.n)} emendas</span>
          </span>
        ) : <Skeleton className="h-4 w-56" />}
        {r && <AvisoRecorte ignorados={r.ignorados} />}
      </div>
    </div>
  );
}
