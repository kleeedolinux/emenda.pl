import { useStats } from "@/lib/analytics";
import { LineArea } from "./charts/LineArea";
import { Card, Skeleton, Stat, StatGrid } from "./primitives";
import { CountUp } from "./Money";

/** Painel público de audiência (para transparência e patrocinadores). */
export function Audiencia() {
  const s = useStats();
  if (s.isError) return <p className="text-sm text-muted">Estatísticas de audiência indisponíveis no momento.</p>;
  if (!s.data) return <Skeleton className="h-40" />;
  const d = s.data;
  return (
    <div className="space-y-4">
      <StatGrid className="lg:grid-cols-5">
        <Stat label="Online agora" value={<CountUp value={d.online} />} />
        <Stat label="Hoje" value={<CountUp value={d.hoje} />} />
        <Stat label="7 dias" value={<CountUp value={d.semana} />} />
        <Stat label="30 dias" value={<CountUp value={d.mes} />} />
        <Stat label="Total" value={<CountUp value={d.total} />} />
      </StatGrid>
      {d.serie.length > 1 && (
        <Card title="Visitantes por dia">
          <LineArea data={d.serie.map((p) => ({ x: p.dia.slice(5).split("-").reverse().join("/"), y: p.visitantes }))} />
        </Card>
      )}
      <p className="text-xs text-muted">Contagem anônima, sem rastreadores de terceiros. Respeitamos “Do Not Track” e a recusa no aviso de privacidade.</p>
    </div>
  );
}
