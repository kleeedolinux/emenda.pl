// Aba "Emendas" de deputados e senadores: cruza com /data/v1/autor/<codigo>.json.
import { Link } from "react-router";
import { Bars, Card, EmptyState, ErrorState, Money, Skeleton, Stat, StatGrid, formatNumber } from "@/ui";
import { EmendasTable } from "@/features/emendas/tables";
import { formatBRL } from "@/lib/format";
import { emendasPorAno, fontes } from "./api";
import { useAutor } from "./hooks";
import type { Periodo } from "./mandatos";
import { Fontes } from "./components";

export function EmendasAutor({ autorCodigo, carregando, janela, nomes }: { autorCodigo?: string; carregando: boolean; janela: Periodo | null; nomes: Array<string | undefined> }) {
  const autor = useAutor(autorCodigo);
  if (carregando || (autorCodigo && autor.isPending)) return <Skeleton className="h-40" />;
  if (!autorCodigo) return <EmptyState title="Não encontramos emendas com este nome no Portal da Transparência." hint={`Procuramos por: ${nomes.filter(Boolean).join(" / ")}. O Portal usa o nome parlamentar; grafias diferentes podem impedir o cruzamento.`} />;
  if (autor.isError) return <ErrorState error={autor.error} retry={() => autor.refetch()} />;
  const a = autor.data!;
  const es = janela ? a.emendas.filter((e) => e.ano >= Number(janela.inicio.slice(0, 4)) && e.ano <= Number(janela.fim.slice(0, 4))) : a.emendas;
  const anos = emendasPorAno(es);
  const pix = es.filter((e) => e.tipo === "pix");
  const soma = (k: "pago" | "empenhado") => es.reduce((s, e) => s + e[k], 0);
  return (
    <div className="space-y-6">
      <StatGrid>
        <Stat label="Empenhado" tip="empenhado" value={<Money centavos={soma("empenhado")} compact />} />
        <Stat label="Pago" tip="pago" value={<Money centavos={soma("pago")} compact />} />
        <Stat label="Emendas Pix" tip="emenda pix" value={<Money centavos={pix.reduce((s, e) => s + e.pago, 0)} compact />} hint={`${formatNumber(pix.length)} emendas sem finalidade definida`} />
        <Stat label="Emendas" value={formatNumber(es.length)} hint={<Link className="link" to={`/autor/${a.codigo}`}>página completa do autor</Link>} />
      </StatGrid>
      <Card title="Pago por ano" tip="pago"><Bars data={anos.map((x) => ({ label: String(x.ano), value: x.pago }))} format={(n) => formatBRL(n, true)} /></Card>
      <Card title="Emendas" tip="Cada linha é uma emenda. Clique no município para ver tudo o que ele recebeu. Emendas Pix ficam destacadas no tipo.">
        <EmendasTable rows={es} exportName={`emendas-${a.codigo}`} showLocal showAutor={false} />
      </Card>
      <Fontes items={[...fontes.emendas()]} />
    </div>
  );
}

