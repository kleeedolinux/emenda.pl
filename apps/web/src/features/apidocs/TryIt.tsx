import { useId, useState, type FormEvent } from "react";
import { Play } from "lucide-react";
import { Badge } from "@/ui";
import { Code } from "./Code";

const LIMITE_TELA = 60_000;

interface Estado { status?: number; cache?: string | null; ms?: number; body?: string; error?: string; loading?: boolean }

function normalizar(p: string): string {
  const t = p.trim();
  if (/^\/(v1|rss|mcp)(\/|$|\?)/.test(t)) return t;
  return `/v1${t.startsWith("/") ? "" : "/"}${t}`;
}

/** Chamada ao vivo, same-origin (/v1 é servido em qualquer host). */
export function TryIt({ inicial, sugestoes, compacto }: { inicial: string; sugestoes?: string[]; compacto?: boolean }) {
  const [path, setPath] = useState(inicial);
  const [st, setSt] = useState<Estado>({});
  const id = useId();

  const run = async (e?: FormEvent) => {
    e?.preventDefault();
    const p = normalizar(path);
    setSt({ loading: true });
    const t0 = performance.now();
    try {
      const res = await fetch(p, { headers: { accept: "application/json" } });
      const text = await res.text();
      let body = text;
      try { body = JSON.stringify(JSON.parse(text), null, 2); } catch { /* não-JSON (CSV, RSS) */ }
      if (body.length > LIMITE_TELA) body = `${body.slice(0, LIMITE_TELA)}\n… (resposta truncada na tela)`;
      setSt({ status: res.status, cache: res.headers.get("x-emenda-cache"), ms: Math.round(performance.now() - t0), body });
    } catch (err) {
      setSt({ error: err instanceof Error ? err.message : "Falha na requisição" });
    }
  };

  return (
    <div>
      <form onSubmit={run} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={id} className="sr-only">Caminho da requisição</label>
        <input
          id={id}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm"
          placeholder="/v1/ufs/SP"
        />
        <button type="submit" disabled={st.loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-verde px-4 py-2 text-sm font-semibold text-white hover:bg-verde-700 disabled:opacity-60">
          <Play size={14} aria-hidden /> {st.loading ? "Buscando…" : compacto ? "Testar" : "Enviar"}
        </button>
      </form>
      {sugestoes && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {sugestoes.map((ex) => (
            <button key={ex} type="button" onClick={() => setPath(ex)} className="rounded-full border border-line px-2 py-0.5 font-mono text-muted hover:text-fg">{ex}</button>
          ))}
        </div>
      )}
      <div className="mt-3 space-y-2 empty:hidden" aria-live="polite">
        {st.error && <Badge tone="vermelho">{st.error}</Badge>}
        {st.status !== undefined && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone={st.status < 300 ? "verde" : st.status === 429 ? "amarelo" : "vermelho"}>HTTP {st.status}</Badge>
            {st.cache && <Badge tone="azul">cache {st.cache}</Badge>}
            <Badge>{st.ms} ms</Badge>
          </div>
        )}
        {st.body !== undefined && <Code text={st.body} label="resposta" />}
      </div>
    </div>
  );
}
