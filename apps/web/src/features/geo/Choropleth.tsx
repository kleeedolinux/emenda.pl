import { geoMercator, geoPath } from "d3-geo";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useApi } from "@/lib/data";
import { sequentialScale } from "@/lib/colors";
import { formatNumber } from "@/lib/format";
import { ErrorState, Skeleton } from "@/ui/primitives";

export interface GeoFeature { type: "Feature"; properties: { codarea: string }; geometry: { type: string; coordinates: unknown } }
export interface GeoFC { type: "FeatureCollection"; features: GeoFeature[] }

export interface ChoroplethProps {
  /** URL de malha GeoJSON do IBGE (properties.codarea). */
  url: string;
  values: Record<string, number | undefined>;
  label: (codarea: string) => string;
  href?: (codarea: string) => string | null;
  format?: (n: number) => string;
  /** Linha extra no tooltip. */
  detail?: (codarea: string) => ReactNode;
  ariaLabel: string;
  height?: number;
}

const W = 640;

export function Choropleth({ url, values, label, href, format = (n) => formatNumber(n), detail, ariaLabel, height = 560 }: ChoroplethProps) {
  const q = useApi<GeoFC>(url);
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);

  const paths = useMemo(() => {
    if (!q.data?.features?.length) return [];
    const fc = q.data as unknown as Parameters<ReturnType<typeof geoMercator>["fitSize"]>[1];
    const proj = geoMercator().fitSize([W, height], fc);
    const gp = geoPath(proj);
    return q.data.features.map((f) => {
      const g = f as unknown as Parameters<typeof gp>[0];
      return { code: String(f.properties.codarea), d: gp(g) ?? "" };
    });
  }, [q.data, height]);

  const nums = Object.values(values).filter((v): v is number => typeof v === "number");
  const max = nums.length ? Math.max(...nums) : 0;
  const color = sequentialScale([0, max]);

  if (q.isPending) return <Skeleton className="aspect-[640/560] w-full rounded-2xl" />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;

  const go = (code: string) => { const h = href?.(code); if (h) nav(h); };
  const cur = hover?.code;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="group" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {paths.map((p, i) => {
          const v = values[p.code];
          const name = label(p.code);
          return (
            <motion.path
              key={p.code}
              d={p.d}
              fill={color(v ?? null)}
              stroke="var(--color-surface)"
              strokeWidth={paths.length > 200 ? 0.3 : 0.8}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: cur && cur !== p.code ? 0.75 : 1 }}
              transition={{ duration: 0.4, delay: reduce ? 0 : Math.min(i * 0.004, 0.5) }}
              className={href ? "cursor-pointer outline-none focus-visible:stroke-[var(--color-ring)] focus-visible:[stroke-width:2]" : ""}
              style={cur === p.code ? { stroke: "var(--color-amarelo)", strokeWidth: 2 } : undefined}
              tabIndex={href ? 0 : -1}
              role={href ? "link" : undefined}
              aria-label={`${name}: ${v !== undefined ? format(v) : "sem dados"}`}
              onMouseMove={(e) => {
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({ code: p.code, x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onFocus={(e) => {
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                const b = e.currentTarget.getBoundingClientRect();
                setHover({ code: p.code, x: b.left - r.left + b.width / 2, y: b.top - r.top + b.height / 2 });
              }}
              onBlur={() => setHover(null)}
              onClick={() => go(p.code)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go(p.code))}
            />
          );
        })}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 min-w-40 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-xl border border-line glass px-3 py-2 text-sm shadow-xl"
          style={{ left: hover.x, top: hover.y }}
          role="status"
        >
          <p className="font-semibold">{label(hover.code)}</p>
          <p className="tabular">{values[hover.code] !== undefined ? format(values[hover.code]!) : "Sem dados"}</p>
          {detail?.(hover.code)}
        </div>
      )}
      <Legend max={max} format={format} />
    </div>
  );
}

function Legend({ max, format }: { max: number; format: (n: number) => string }) {
  const c = sequentialScale([0, max]);
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => c(t * max));
  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-muted" aria-hidden>
      <span className="tabular">{format(0)}</span>
      <span className="h-2 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }} />
      <span className="tabular">{format(max)}</span>
      <span className="ml-2 inline-flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: "var(--color-mapa-vazio)" }} />sem dados</span>
    </div>
  );
}
