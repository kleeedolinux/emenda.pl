import { Gavel, History } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton, Tip } from "@/ui";
import { ShareButton } from "@/features/share";
import { type AgendaEvento } from "./agenda";
import { CasaChip, MateriaList, PautaCamara, TIPS, VotacoesCamara } from "./AgendaParts";
import { semanaShare } from "./compartilhar";
import { useVotacoesEvento } from "./useAgenda";

const diaCurto = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).replace(".", "");

function Painel({ icon, titulo, tip, acao, children }: { icon: ReactNode; titulo: ReactNode; tip?: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-3">
      <header className="mb-1.5 flex items-center gap-1.5">
        {icon}<h2 className="text-sm font-semibold">{titulo}</h2>{tip && <Tip content={tip} />}
        {acao && <span className="ml-auto">{acao}</span>}
      </header>
      {children}
    </section>
  );
}

function Cab({ ev }: { ev: AgendaEvento }) {
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
      <CasaChip casa={ev.casa} /><span className="shrink-0 whitespace-nowrap font-semibold capitalize text-fg">{diaCurto(ev.dia)} · {ev.hora}</span><span className="truncate">{ev.titulo}</span>
    </p>
  );
}

/** "Nesta semana": contagens + sessões de Plenário com votação e a pauta resumida. */
export function ResumoSemana({ titulo, eventos, votarao, loading, onDia }: {
  titulo: string; eventos: AgendaEvento[]; votarao: AgendaEvento[]; loading: boolean; onDia: (d: string) => void;
}) {
  const n = (f: (e: AgendaEvento) => boolean) => eventos.filter(f).length;
  const stats: [string, number, string?][] = [
    ["eventos", eventos.length], ["Plenário", n((e) => e.ambito === "plenario"), TIPS.plenario],
    ["comissões", n((e) => e.ambito === "comissao"), TIPS.comissao], ["com votação", n((e) => e.deliberativa), TIPS.deliberativa],
  ];
  return (
    <Painel icon={<Gavel className="size-4 text-accent" aria-hidden />} titulo={titulo} tip={TIPS.deliberativa}
      acao={votarao.length ? <ShareButton compact label="Compartilhar a semana" {...semanaShare(votarao, eventos[0]?.dia ?? "")} /> : undefined}>
      {loading ? <Skeleton className="h-16" /> : (
        <>
          <dl className="mb-2 grid grid-cols-4 gap-1 text-center">
            {stats.map(([l, v, tip]) => (
              <div key={l} className="rounded-md bg-surface-2 px-1 py-1" title={tip}>
                <dd className="text-base font-bold tabular-nums leading-tight">{v}</dd><dt className="text-[10px] leading-tight text-muted">{l}</dt>
              </div>
            ))}
          </dl>
          {votarao.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Vai a voto no Plenário</h3>
              {votarao.map((ev) => (
                <div key={ev.id}>
                  <button type="button" onClick={() => onDia(ev.dia)} className="w-full text-left hover:underline"><Cab ev={ev} /></button>
                  <div className="pl-6">{ev.camaraId != null ? <PautaCamara ev={ev} limit={3} /> : ev.materias.length ? <MateriaList materias={ev.materias} limit={3} ev={ev} /> : <p className="text-xs text-muted">Pauta ainda não publicada.</p>}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Painel>
  );
}

function RecenteCamara({ ev }: { ev: AgendaEvento }) {
  const q = useVotacoesEvento(ev.camaraId);
  if (!q.data?.length) return null;
  return <div><Cab ev={ev} /><div className="pl-6"><VotacoesCamara id={ev.camaraId!} compact limit={3} /></div></div>;
}

/** "Votado hoje e ontem". Some quando não há nada (sem cartão vazio). */
export function VotadoRecente({ eventos, loading }: { eventos: AgendaEvento[]; loading: boolean }) {
  if (!loading && !eventos.length) return null;
  return (
    <Painel icon={<History className="size-4 text-accent" aria-hidden />} titulo="Votado hoje e ontem"
      tip="Resultados registrados pelas Casas. Verde = aprovado, vermelho = rejeitado. Toque para ver como cada parlamentar votou.">
      {loading ? <Skeleton className="h-12" /> : (
        <div className="space-y-2">
          {eventos.slice(0, 4).map((ev) => ev.camaraId != null ? <RecenteCamara key={ev.id} ev={ev} /> : ev.materias.length ? (
            <div key={ev.id}><Cab ev={ev} /><div className="pl-6"><MateriaList materias={ev.materias} limit={3} ev={ev} /></div></div>
          ) : null)}
        </div>
      )}
    </Painel>
  );
}
