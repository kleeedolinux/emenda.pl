import { useEffect, useState, type ReactNode } from "react";
import { creditoMunicipio, emblemasMunicipio, precisaCredito } from "@/lib/cdn";

interface Credito { licenca?: string | null; autor?: string | null; pagina?: string | null }

/** Bandeira do município -> brasão -> bandeira da UF (espelho); `fallback` se nenhuma carregar. */
export function EmblemaMunicipio({ ibge, uf, nome, size = 48, credito = false, fallback = null }: {
  ibge: string; uf: string; nome: string; size?: number; credito?: boolean; fallback?: ReactNode;
}) {
  const srcs = emblemasMunicipio(ibge, uf, size > 64 ? 256 : 64);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [ibge, uf]);
  if (!uf || i >= srcs.length) return <>{fallback}</>;
  const alt = i === 0 ? `Bandeira de ${nome}` : i === 1 ? `Brasão de ${nome}` : `Bandeira de ${uf}`;
  return (
    <span className="inline-flex shrink-0 flex-col items-start gap-1">
      <img key={srcs[i]} src={srcs[i]} alt={alt} title={alt} loading="lazy" decoding="async" onError={() => setI(i + 1)}
        style={{ height: size }} className="w-auto max-w-[8rem] rounded-md object-contain shadow ring-1 ring-line" />
      {credito && i < 2 && <CreditoCommons ibge={ibge} tipo={i === 0 ? "bandeira" : "brasao"} />}
    </span>
  );
}

function CreditoCommons({ ibge, tipo }: { ibge: string; tipo: "bandeira" | "brasao" }) {
  const [c, setC] = useState<Credito | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(creditoMunicipio(ibge)).then((r) => (r.ok ? r.json() : null)).then((j) => vivo && setC(j?.[tipo] ?? null)).catch(() => {});
    return () => { vivo = false; };
  }, [ibge, tipo]);
  if (!c || !precisaCredito(c.licenca)) return null;
  const txt = `${tipo === "bandeira" ? "Bandeira" : "Brasão"}: ${c.autor || "Wikimedia Commons"} · ${c.licenca ?? "ver licença"}`;
  return c.pagina
    ? <a href={c.pagina} target="_blank" rel="noopener noreferrer" className="max-w-[12rem] truncate text-[10px] text-muted hover:underline">{txt}</a>
    : <span className="max-w-[12rem] truncate text-[10px] text-muted">{txt}</span>;
}
