import { motion } from "motion/react";
import { Gavel, History } from "lucide-react";
import { Link } from "react-router";
import { Badge, Card, ExternalLink, Skeleton, stagger } from "@/ui";
import { type AgendaEvento } from "./agenda";
import { Bloco, CASA_LABEL, MateriaList, TIPS, VotacoesCamara } from "./AgendaParts";
import { usePautaCamara } from "./useAgenda";

const diaCurto = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });

function PautaResumo({ ev }: { ev: AgendaEvento }) {
  const q = usePautaCamara(ev.camaraId);
  if (ev.camaraId == null) return ev.materias.length ? <MateriaList materias={ev.materias} limit={4} /> : <SemPauta ev={ev} />;
  if (q.isLoading) return <Skeleton className="h-16" />;
  return q.materias?.length ? <MateriaList materias={q.materias} limit={4} /> : <SemPauta ev={ev} />;
}

const SemPauta = ({ ev }: { ev: AgendaEvento }) => (
  <p className="text-sm text-muted">Pauta ainda não publicada. <ExternalLink href={ev.fonte}>Acompanhe na fonte</ExternalLink></p>
);

function Cabecalho({ ev }: { ev: AgendaEvento }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
      <Badge tone={ev.casa === "camara" ? "verde" : "azul"}>{CASA_LABEL[ev.casa]}</Badge>
      <span className="font-semibold capitalize">{diaCurto(ev.dia)} · {ev.hora}</span>
      <span className="text-muted">{ev.titulo}</span>
    </div>
  );
}

/** "O que será votado esta semana": sessões deliberativas de Plenário ainda por acontecer. */
export function VotaraoSemana({ eventos, loading }: { eventos: AgendaEvento[]; loading: boolean }) {
  return (
    <Card title={<span className="inline-flex items-center gap-2"><Gavel className="size-5 text-accent" aria-hidden />O que será votado esta semana</span>} tip={TIPS.deliberativa}
      className="bg-gradient-to-br from-verde/8 via-transparent to-amarelo/8">
      {loading ? <Skeleton className="h-32" /> : !eventos.length ? (
        <p className="text-sm text-muted">Nenhuma sessão deliberativa de Plenário marcada para o resto da semana.</p>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-5 lg:grid-cols-2">
          {eventos.map((ev) => (
            <div key={ev.id}>
              <Cabecalho ev={ev} />
              <Bloco titulo="Na pauta" tip={TIPS.pauta}><PautaResumo ev={ev} /></Bloco>
            </div>
          ))}
        </motion.div>
      )}
    </Card>
  );
}

/** "Votado hoje/ontem": resultados de sessões encerradas. */
export function VotadoRecente({ eventos, loading }: { eventos: AgendaEvento[]; loading: boolean }) {
  return (
    <Card title={<span className="inline-flex items-center gap-2"><History className="size-5 text-accent" aria-hidden />Votado hoje e ontem</span>}
      tip="Resultados das votações registradas pelas Casas. Verde = aprovado, vermelho = rejeitado. Clique para ver como cada parlamentar votou.">
      {loading ? <Skeleton className="h-24" /> : !eventos.length ? (
        <p className="text-sm text-muted">Nenhuma sessão com votação encerrada hoje ou ontem.</p>
      ) : (
        <div className="space-y-5">
          {eventos.map((ev) => (
            <div key={ev.id}>
              <Cabecalho ev={ev} />
              <p className="mb-2 text-xs text-muted">{ev.orgao}</p>
              {ev.camaraId != null ? <VotacoesCamara id={ev.camaraId} /> : (
                <>
                  {ev.materias.length ? <MateriaList materias={ev.materias} limit={4} /> : null}
                  <p className="mt-2 text-sm"><ExternalLink href={ev.fonte}>Ver resultado no site do Senado</ExternalLink></p>
                </>
              )}
            </div>
          ))}
          <p className="text-xs text-muted">Veja também <Link to="/proposicoes" className="text-accent hover:underline">proposições</Link>.</p>
        </div>
      )}
    </Card>
  );
}
