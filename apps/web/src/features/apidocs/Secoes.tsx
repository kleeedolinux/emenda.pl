import { Card, ExternalLink, KeyValue, Section } from "@/ui";
import { Code, CodeTabs, CopyButton } from "./Code";
import { API_ORIGEM, feedLinks, humanizarTtl, mcpCurl, paramsDoTool } from "./docs";
import type { Spec } from "./spec";

export function Limites({ spec }: { spec: Spec }) {
  const l = spec["x-limites"] ?? {};
  const max = l.limitMax;
  return (
    <Section title="Limites e cache" id="limites">
      <KeyValue
        items={[
          ["Requisições", `${l.geral ?? "300 req/60s por IP"} (inclui respostas do cache)`],
          ["Fora do cache", l.foraDoCache ?? "60 req/10s por IP"],
          ["Ao exceder", <>HTTP 429 com <code>Retry-After</code> (segundos). Toda resposta traz <code>X-RateLimit-Limit</code>.</>],
          ["Consulta", <>query até {l.query ?? 512} caracteres; parâmetros desconhecidos são ignorados</>],
          ["Cache de borda", <>por endpoint (ver selo <b>cache</b> em cada um); navegador até 5 min; <code>stale-while-revalidate</code> de 24 h</>],
          ["x-emenda-cache", <><code>HIT</code>, <code>MISS</code> ou <code>BYPASS</code></>],
          ["Revalidação", <>envie <code>If-None-Match</code> com o <code>ETag</code> recebido → <code>304</code> sem corpo</>],
          ["CORS", <><code>Access-Control-Allow-Origin: *</code> — funciona direto do navegador</>],
        ]}
      />
      <h3 className="mb-2 mt-6 font-semibold">Parâmetros comuns das listas</h3>
      <KeyValue
        items={[
          [<code key="l">limit</code>, max ? `itens por página (máx. ${max})` : "itens por página"],
          [<code key="o">offset</code>, "quantos itens pular"],
          [<code key="r">ordem</code>, <>campo de ordenação; <code>-campo</code> = decrescente (ex.: <code>ordem=-pago</code>)</>],
          [<code key="c">campos</code>, <>só estes campos (ex.: <code>campos=ano,pago</code>)</>],
          [<code key="f">formato=csv</code>, "mesma lista em CSV (UTF-8)"],
        ]}
      />
      <p className="mt-3 text-sm text-muted">
        A paginação vem em <code>meta.paginacao</code>: <code>{`{ total, limit, offset, proximo }`}</code>. Siga <code>proximo</code> até ser <code>null</code>.
      </p>
    </Section>
  );
}

export function Mcp({ spec }: { spec: Spec }) {
  const mcp = spec["x-mcp"];
  const url = mcp?.url ?? `${API_ORIGEM}/mcp`;
  const desktop = JSON.stringify({ mcpServers: { emenda: { command: "npx", args: ["-y", "mcp-remote", url] } } }, null, 2);
  const remoto = JSON.stringify({ mcpServers: { emenda: { type: "http", url } } }, null, 2);
  return (
    <Section title="MCP (assistentes de IA)" id="mcp">
      <p className="text-pretty leading-relaxed">
        Servidor MCP remoto, sem cadastro: assistentes como Claude consultam emendas, parlamentares, votações e gastos usando as mesmas
        rotas desta API. Transporte HTTP (Streamable HTTP), sem estado, JSON-RPC 2.0{mcp?.protocolo ? <>, protocolo <code>{mcp.protocolo}</code></> : null}. Mesmos limites da API.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">{url}</code>
        <CopyButton text={url} label="URL do MCP" />
      </div>
      <div className="mt-4">
        <CodeTabs
          label="Configuração MCP"
          tabs={[
            { id: "claude-code", titulo: "Claude Code", texto: `claude mcp add --transport http emenda ${url}` },
            { id: "claude-desktop", titulo: "Claude Desktop", texto: `// claude_desktop_config.json\n${desktop}` },
            { id: "mcp-json", titulo: ".mcp.json / remoto", texto: remoto },
            { id: "curl", titulo: "curl (JSON-RPC)", texto: mcpCurl(url, mcp?.protocolo) },
          ]}
        />
      </div>
      {mcp?.tools.length ? (
        <>
          <h3 className="mb-2 mt-6 font-semibold">Ferramentas ({mcp.tools.length})</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {mcp.tools.map((t) => {
              const ps = paramsDoTool(t.inputSchema);
              return (
                <div key={t.name} className="rounded-xl border border-line bg-surface p-3">
                  <p className="font-mono text-sm font-semibold">{t.name}</p>
                  {t.title && <p className="text-sm font-medium">{t.title}</p>}
                  {t.description && <p className="mt-1 text-sm text-muted">{t.description}</p>}
                  {ps.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs">
                      {ps.map((p) => (
                        <li key={p.nome}>
                          <code>{p.nome}</code>{p.obrigatorio && <span className="text-vermelho"> *</span>} <span className="text-muted">{p.tipo}{p.restricoes.length ? ` · ${p.restricoes.join(" · ")}` : ""}{p.descricao ? ` — ${p.descricao}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted"><span className="text-vermelho">*</span> obrigatório. O resultado traz o JSON em texto e o envelope <code>/v1</code> em <code>structuredContent</code>.</p>
        </>
      ) : null}
    </Section>
  );
}

const WEBMCP = `// O site registra as ferramentas quando o navegador expõe WebMCP:
if ("modelContext" in navigator) {
  navigator.modelContext.registerTool({
    name: "dados_desta_pagina",
    description: "Dados da entidade desta página (JSON /v1)",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    async execute() { /* GET /v1/deputados/204379, por exemplo */ },
  });
}`;

export function WebMcp() {
  return (
    <Section title="WebMCP (no navegador)" id="webmcp">
      <p className="text-pretty leading-relaxed">
        Em qualquer página do emenda.online, navegadores e agentes que implementam WebMCP (<code>navigator.modelContext</code>) recebem as
        mesmas ferramentas do MCP, mais <code>dados_desta_pagina</code>: devolve os dados de quem está na tela (deputado, município, votação…).
        Somente leitura, sem cadastro. Sem WebMCP, nada é carregado.
      </p>
      <div className="mt-3"><Code text={WEBMCP} label="exemplo WebMCP" /></div>
    </Section>
  );
}

export function Rss({ spec }: { spec: Spec }) {
  const feeds = spec["x-rss"] ?? [];
  if (!feeds.length) return null;
  return (
    <Section title="RSS e Atom" id="rss">
      <p className="mb-3 text-sm text-muted">Assine em qualquer leitor de feeds. Cada feed existe em RSS 2.0 (<code>.xml</code>) e Atom (<code>.atom</code>).</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {feeds.map((f) => {
          const l = feedLinks(f);
          return (
            <li key={f.path} className="rounded-xl border border-line bg-surface p-3">
              <p className="font-semibold">{f.titulo}</p>
              {f.descricao && <p className="text-sm text-muted">{f.descricao}</p>}
              {l.modelo && <p className="mt-1 text-xs text-muted">Modelo: <code>{l.modelo}</code> — exemplo abaixo.</p>}
              <div className="mt-2 space-y-1 text-sm">
                {([["RSS", l.rss], ["Atom", l.atom]] as const).map(([nome, href]) => (
                  <div key={nome} className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-xs text-muted">{nome}</span>
                    <a className="link min-w-0 flex-1 truncate font-mono text-xs" href={href}>{href.replace(/^https:\/\//, "")}</a>
                    <CopyButton text={href} label={`feed ${nome} ${f.titulo}`} />
                  </div>
                ))}
              </div>
              {f.ttl !== undefined && <p className="mt-1 text-xs text-muted">Atualiza a cada {humanizarTtl(f.ttl)}.</p>}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function Changelog({ spec }: { spec: Spec }) {
  const cl = spec["x-changelog"] ?? [];
  if (!cl.length) return null;
  return (
    <Section title="Mudanças" id="mudancas">
      <div className="space-y-3">
        {cl.map((v) => (
          <Card key={`${v.versao}-${v.data}`} title={<span><code>{v.versao}</code> <span className="text-sm font-normal text-muted">{v.data}</span></span>}>
            <ul className="list-disc space-y-1 pl-5 text-sm">{v.itens.map((i) => <li key={i}>{i}</li>)}</ul>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">Mudanças incompatíveis só em uma nova versão (<code>/v2</code>). Código: <ExternalLink href="https://github.com/kleeedolinux/emenda.pl">repositório</ExternalLink>.</p>
    </Section>
  );
}
