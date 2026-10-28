import { useState } from "react";
import { Badge, ExternalLink } from "@/ui";
import { CodeTabs } from "./Code";
import { humanizarTtl, restricoes, snippetCurl, snippetJs, snippetPython, tipoParam, type OpItem } from "./docs";
import { TryIt } from "./TryIt";

const TOM_METODO = { get: "verde", post: "azul" } as const;

function Parametros({ op }: { op: OpItem["op"] }) {
  const ps = op.parameters ?? [];
  if (!ps.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="sr-only">Parâmetros</caption>
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th scope="col" className="py-1.5 pr-3 font-semibold">Nome</th>
            <th scope="col" className="py-1.5 pr-3 font-semibold">Onde</th>
            <th scope="col" className="py-1.5 pr-3 font-semibold">Tipo</th>
            <th scope="col" className="py-1.5 pr-3 font-semibold">Regras</th>
            <th scope="col" className="py-1.5 font-semibold">Descrição</th>
          </tr>
        </thead>
        <tbody>
          {ps.map((p) => (
            <tr key={`${p.in}-${p.name}`} className="border-b border-line/60 align-top">
              <td className="py-1.5 pr-3 font-mono text-xs">
                {p.name}{p.required && <span className="text-vermelho" title="obrigatório"> *</span>}
                {p.required && <span className="sr-only"> (obrigatório)</span>}
              </td>
              <td className="py-1.5 pr-3 text-xs text-muted">{p.in === "path" ? "caminho" : p.in === "query" ? "query" : p.in}</td>
              <td className="py-1.5 pr-3 text-xs">{tipoParam(p.schema)}</td>
              <td className="py-1.5 pr-3 text-xs text-muted">{restricoes(p.schema).join(" · ") || "—"}</td>
              <td className="py-1.5 text-xs">{p.description}{p.example !== undefined && <span className="text-muted"> Ex.: <code>{String(p.example)}</code></span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Corpo({ item }: { item: OpItem }) {
  const { op } = item;
  const ex = op["x-exemplo"];
  const respostas = Object.entries(op.responses ?? {});
  return (
    <div className="space-y-4 border-t border-line p-4">
      {op.description && <p className="whitespace-pre-line text-sm leading-relaxed">{op.description}</p>}
      <Parametros op={op} />
      {op["x-lista"] && (
        <p className="text-xs text-muted">
          Lista: aceita <code>limit</code>, <code>offset</code>, <code>ordem</code>, <code>campos</code> e <code>formato=csv</code>.
          {op["x-ordem"]?.length ? <> Ordenável por: {op["x-ordem"].map((c) => <code key={c} className="mr-1">{c}</code>)} (prefixo <code>-</code> = decrescente).</> : null}
        </p>
      )}
      {respostas.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Respostas:</span>
          {respostas.map(([cod, r]) => (
            <span key={cod} title={r.description}><Badge tone={cod.startsWith("2") ? "verde" : cod === "429" ? "amarelo" : "neutro"}>{cod}</Badge></span>
          ))}
          {respostas.flatMap(([, r]) => Object.keys(r.content ?? {})).filter((v, i, a) => a.indexOf(v) === i).map((ct) => (
            <code key={ct} className="text-muted">{ct}</code>
          ))}
        </p>
      )}
      {op["x-fonte"]?.length ? (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span className="text-muted">Fontes:</span>
          {op["x-fonte"].map((f) => <ExternalLink key={f} href={f}>{new URL(f).hostname}</ExternalLink>)}
        </p>
      ) : null}
      {ex && item.metodo === "get" && (
        <>
          <CodeTabs
            label={`Exemplo ${item.path}`}
            tabs={[
              { id: "curl", titulo: "curl", texto: snippetCurl(ex) },
              { id: "js", titulo: "JavaScript", texto: snippetJs(ex) },
              { id: "python", titulo: "Python", texto: snippetPython(ex) },
            ]}
          />
          <TryIt inicial={ex} compacto />
        </>
      )}
    </div>
  );
}

/** Operação recolhida; o corpo só é montado quando aberto. */
export function Operacao({ item }: { item: OpItem }) {
  const [aberto, setAberto] = useState(() => typeof location !== "undefined" && location.hash === `#${item.id}`);
  const { op } = item;
  return (
    <details id={item.id} open={aberto} onToggle={(e) => setAberto(e.currentTarget.open)} className="scroll-mt-24 rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <Badge tone={TOM_METODO[item.metodo as keyof typeof TOM_METODO] ?? "neutro"} className="uppercase">{item.metodo}</Badge>
        <code className="break-all text-sm font-semibold">{item.path}</code>
        {op.summary && <span className="text-sm text-muted">{op.summary}</span>}
        <span className="ml-auto flex flex-wrap gap-1">
          {op["x-lista"] && <Badge tone="azul">lista · CSV</Badge>}
          {op["x-ttl"] !== undefined && <Badge>{`cache ${humanizarTtl(op["x-ttl"])}`}</Badge>}
        </span>
      </summary>
      {aberto && <Corpo item={item} />}
    </details>
  );
}
