import { useMemo } from "react";
import { Card, ErrorState, ExternalLink, PageHeader, Section, Skeleton } from "@/ui";
import { Code } from "@/features/apidocs/Code";
import { agruparPorTag, API_ORIGEM } from "@/features/apidocs/docs";
import { Operacao } from "@/features/apidocs/Operacao";
import { Changelog, Limites, Mcp, Rss, WebMcp } from "@/features/apidocs/Secoes";
import { TryIt } from "@/features/apidocs/TryIt";
import { useSpec } from "@/features/apidocs/useSpec";
import type { Spec } from "@/features/apidocs/spec";

const ENVELOPE = `{
  "data": …,
  "meta": {
    "fonte": ["https://portaldatransparencia.gov.br/…"],
    "atualizado": "2026-10-28T20:01:50Z",
    "licenca": "…",
    "docs": "https://emenda.online/api",
    "paginacao": { "total": 120, "limit": 50, "offset": 0, "proximo": "/v1/…?offset=50" }
  }
}`;

const ERRO = `{ "error": "município não encontrado", "status": 404, "docs": "https://emenda.online/api" }`;

const CITACAO = "Fonte: emenda.online (https://emenda.online), com dados do Portal da Transparência (CGU), da Câmara dos Deputados e do Senado Federal. Acesso em AAAA-MM-DD.";

const SUGESTOES = ["/v1/meta", "/v1/ufs", "/v1/autores?q=silva&limit=5", "/v1/deputados/204379", "/v1/votacoes/2236186-60"];

function Intro({ spec }: { spec?: Spec }) {
  return (
    <>
      <Section title="Como funciona" id="intro">
        {spec?.info.description && <p className="mb-3 whitespace-pre-line text-pretty leading-relaxed">{spec.info.description}</p>}
        <p className="text-pretty leading-relaxed">
          API REST somente leitura, aberta e sem chave. Endereço base: <code>{API_ORIGEM}/v1</code> (o mesmo prefixo <code>/v1</code> funciona
          em <code>https://emenda.online/v1</code>). Respostas JSON vêm sempre no mesmo envelope:
        </p>
        <div className="mt-3"><Code text={ENVELOPE} label="envelope" /></div>
        <p className="mt-3 text-sm text-muted">
          Valores monetários em <b>centavos inteiros</b>. Erros (400, 404, 405, 429, 502): <code>{ERRO}</code>
        </p>
        {spec && <p className="mt-2 text-sm text-muted">Especificação OpenAPI {spec.openapi ?? "3.1"}, versão <code>{spec.info.version}</code>: <a className="link" href="/v1/openapi.json">/v1/openapi.json</a></p>}
      </Section>

      <Section title="Licença e atribuição" id="atribuicao">
        <p className="leading-relaxed">
          Código GPL-3.0; dados públicos. <b>Cite emenda.online e as fontes originais</b>:{" "}
          <ExternalLink href="https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares">Portal da Transparência</ExternalLink>,{" "}
          <ExternalLink href="https://dadosabertos.camara.leg.br">Dados Abertos da Câmara</ExternalLink> e{" "}
          <ExternalLink href="https://legis.senado.leg.br/dadosabertos">Dados Abertos do Senado</ExternalLink>. Cada resposta traz as URLs de origem em <code>meta.fonte</code>.
        </p>
        <div className="mt-3"><Code text={CITACAO} label="citação sugerida" /></div>
        <p className="mt-2 text-sm text-muted">O cruzamento de parlamentares com emendas usa o nome normalizado e pode falhar em homônimos; confira nos links oficiais.</p>
      </Section>
    </>
  );
}

function Carregando() {
  return (
    <div className="mt-12 space-y-3" aria-busy="true" aria-label="Carregando especificação">
      <Skeleton className="h-7 w-48" />
      {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );
}

function Endpoints({ spec }: { spec: Spec }) {
  const grupos = useMemo(() => agruparPorTag(spec), [spec]);
  const total = grupos.reduce((s, g) => s + g.ops.length, 0);
  return (
    <>
      <Section title="Índice" id="indice">
        <nav aria-label="Índice da API">
          <ul className="flex flex-wrap gap-1.5 text-sm">
            {[["#limites", "Limites e cache"], ["#experimente", "Experimente"], ["#mcp", "MCP"], ["#webmcp", "WebMCP"], ["#rss", "RSS"], ["#mudancas", "Mudanças"]].map(([h, t]) => (
              <li key={h}><a href={h} className="inline-block rounded-full border border-line px-3 py-1 hover:bg-surface-2">{t}</a></li>
            ))}
          </ul>
          <p className="mb-2 mt-4 text-sm text-muted">{total} endpoints por assunto:</p>
          <ul className="flex flex-wrap gap-1.5 text-sm">
            {grupos.map((g) => (
              <li key={g.id}><a href={`#${g.id}`} className="inline-block rounded-full bg-surface-2 px-3 py-1 hover:text-verde">{g.tag} <span className="text-muted">{g.ops.length}</span></a></li>
            ))}
          </ul>
        </nav>
      </Section>

      <Limites spec={spec} />

      <Section title="Experimente" id="experimente">
        <Card><TryIt inicial="/v1/meta" sugestoes={SUGESTOES} /></Card>
      </Section>

      {grupos.map((g) => (
        <Section key={g.id} title={g.tag} id={g.id}>
          {g.descricao && <p className="mb-3 text-sm text-muted">{g.descricao}</p>}
          <div className="space-y-2">{g.ops.map((o) => <Operacao key={o.id} item={o} />)}</div>
        </Section>
      ))}

      <Mcp spec={spec} />
      <WebMcp />
      <Rss spec={spec} />
      <Changelog spec={spec} />
    </>
  );
}

export default function ApiDocsPage() {
  const q = useSpec();
  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Dados abertos"
        title="API pública, MCP e RSS"
        subtitle="Os mesmos dados do site em JSON, CSV, MCP e RSS: versionados, com cache e sem cadastro. Use em pesquisas, reportagens, bots, assistentes de IA e aplicativos."
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "API" }]}
      />
      <Intro spec={q.data} />
      {q.isPending ? <Carregando /> : q.isError ? <div className="mt-12"><ErrorState error={q.error} retry={() => q.refetch()} /></div> : <Endpoints spec={q.data} />}
    </div>
  );
}
