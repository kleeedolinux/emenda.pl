import { useState, type FormEvent } from "react";
import { Check, Copy, Play } from "lucide-react";
import { Badge, Card, ExternalLink, KeyValue, PageHeader, Section, toast } from "@/ui";

const BASE = "https://api.emenda.online/v1";

interface Endpoint {
  path: string;
  desc: string;
  example: string;
  response: string;
  note?: string;
}

const META = `"meta": { "fonte": ["https://portaldatransparencia.gov.br/..."], "atualizado": "2026-10-28T20:01:50Z", "licenca": "GPL-3.0 (código) / dados públicos", "docs": "https://emenda.online/api" }`;

const GRUPOS: Array<{ titulo: string; itens: Endpoint[] }> = [
  {
    titulo: "Emendas (dados consolidados)",
    itens: [
      { path: "/v1", desc: "Índice: lista de endpoints, limites e links.", example: "/v1", response: `{ "data": { "nome": "API aberta emenda.online", "versao": "v1", "endpoints": [ { "path": "/v1/meta", "descricao": "…", "exemplo": "/v1/meta" }, … ] }, "meta": { … } }` },
      { path: "/v1/meta", desc: "Metadados do conjunto: anos cobertos, totais e data de geração.", example: "/v1/meta", response: `{ "data": { "version": "v1", "generatedAt": "2026-10-28T20:01:50Z", "anos": [2014, …, 2026], "totais": { "n": 94755, "empenhado": 34279109498583, "pago": 19455707030175 } }, ${META} }` },
      { path: "/v1/brasil", desc: "Totais nacionais por ano, tipo, função orçamentária e UF.", example: "/v1/brasil", response: `{ "data": { "totais": { … }, "porAno": [ { "ano": 2024, "n": 9871, "pago": … } ], "porTipo": [ … ], "porFuncao": [ … ], "porUf": [ … ], "fluxo": [ … ] }, "meta": { … } }` },
      { path: "/v1/ufs", desc: "UFs com totais (n, empenhado, liquidado, pago).", example: "/v1/ufs", response: `{ "data": [ { "uf": "SP", "nome": "São Paulo", "n": 11150, "empenhado": 2273819790899, "pago": 1425969623818, "url": "/v1/ufs/SP" }, … ], "meta": { … } }` },
      { path: "/v1/ufs/{UF}", desc: "Emendas destinadas a uma UF: totais, por ano, por tipo, municípios e autores.", example: "/v1/ufs/SP", response: `{ "data": { "uf": "SP", "nome": "São Paulo", "totais": { … }, "porTipo": [ … ], "porAno": [ … ], "municipios": [ … ], "autores": [ … ] }, "meta": { … } }` },
      { path: "/v1/municipios/{ibge}", desc: "Emendas recebidas por um município (código IBGE de 7 dígitos).", example: "/v1/municipios/3550308", response: `{ "data": { "ibge": "3550308", "nome": "São Paulo", "uf": "SP", "prefeito": { … }, "totais": { … }, "emendas": [ … ], "favorecidos": [ … ] }, "meta": { … } }` },
      { path: "/v1/autores", desc: "Autores de emendas. Filtro ?q= (nome sem acento/caixa, ou código exato), paginação ?limit=1..500 (padrão 50) e ?offset=0..10000.", example: "/v1/autores?q=bancada&limit=2", response: `{ "data": { "total": 27, "limit": 2, "offset": 0, "itens": [ { "codigo": "7107", "nome": "BANCADA DO CEARA", "n": 84, "pago": 217707603873, "empenhado": 250664792488, "url": "/v1/autores/7107" }, … ] }, "meta": { … } }` },
      { path: "/v1/autores/{codigo}", desc: "Emendas de um autor: totais, por ano, UF e tipo, lista de emendas e favorecidos.", example: "/v1/autores/8100", response: `{ "data": { "codigo": "8100", "nome": "RELATOR GERAL", "totais": { … }, "porAno": [ … ], "porUf": [ … ], "emendas": [ … ] }, "meta": { … } }` },
    ],
  },
  {
    titulo: "Emendas Pix, feed e emendas em aberto",
    itens: [
      { path: "/v1/pix", desc: "Emendas Pix (transferências especiais).", example: "/v1/pix", response: `{ "data": { … }, "meta": { … } }`, note: "Pode responder 404 até o conjunto ser publicado." },
      { path: "/v1/pix/{ano}", desc: "Emendas Pix de um ano.", example: "/v1/pix/2024", response: `{ "data": { … }, "meta": { … } }`, note: "Pode responder 404 até o conjunto ser publicado." },
      { path: "/v1/feed", desc: "Últimas movimentações (empenhos e pagamentos).", example: "/v1/feed", response: `{ "data": [ … ], "meta": { … } }`, note: "Pode responder 404 até o conjunto ser publicado." },
      { path: "/v1/feed/{YYYYMM}", desc: "Movimentações de um mês.", example: "/v1/feed/202410", response: `{ "data": [ … ], "meta": { … } }`, note: "Pode responder 404 até o conjunto ser publicado." },
      { path: "/v1/abertas", desc: "Emendas empenhadas ainda não pagas.", example: "/v1/abertas", response: `{ "data": [ … ], "meta": { … } }`, note: "Pode responder 404 até o conjunto ser publicado." },
    ],
  },
  {
    titulo: "Parlamentares (ao vivo + emendas)",
    itens: [
      { path: "/v1/deputados", desc: "Deputados em exercício (Câmara) com o resumo de emendas cruzado pelo nome.", example: "/v1/deputados", response: `{ "data": [ { "id": 204379, "nome": "Acácio Favacho", "partido": "MDB", "uf": "AP", "foto": "https://…", "email": "…", "emendas": { "codigo": "3897", "n": 39, "pago": 13704036595, "empenhado": 18440955500, "url": "/v1/autores/3897" }, "url": "/v1/deputados/204379" }, … ], "meta": { … } }` },
      { path: "/v1/deputados/{id}", desc: "Deputado: dados cadastrais, gabinete, nascimento, redes, emendas e links.", example: "/v1/deputados/204379", response: `{ "data": { "id": 204379, "nome": "Acácio Favacho", "nomeCivil": "…", "partido": "MDB", "uf": "AP", "situacao": "Exercício", "nascimento": { "data": "1983-09-28", "municipio": "Macapá", "uf": "AP" }, "emendas": { … }, "links": { "camara": "…", "site": "…" } }, "meta": { … } }` },
      { path: "/v1/senadores", desc: "Senadores em exercício (Senado) com o resumo de emendas.", example: "/v1/senadores", response: `{ "data": [ { "codigo": "5012", "nome": "Randolfe Rodrigues", "partido": "PT", "uf": "AP", "foto": "https://…", "emendas": { … }, "url": "/v1/senadores/5012" }, … ], "meta": { … } }` },
      { path: "/v1/senadores/{codigo}", desc: "Senador: dados, nascimento, emendas e links.", example: "/v1/senadores/5012", response: `{ "data": { "codigo": "5012", "nome": "Randolfe Rodrigues", "nomeCompleto": "…", "nascimento": { … }, "emendas": { … }, "links": { "senado": "…", "site": "…" } }, "meta": { … } }` },
    ],
  },
  {
    titulo: "Proposições e votações (Câmara)",
    itens: [
      { path: "/v1/proposicoes/{id}", desc: "Proposição normalizada: sigla, ementa, situação, palavras-chave e autores.", example: "/v1/proposicoes/2270800", response: `{ "data": { "id": 2270800, "sigla": "PEC 3/2021", "ementa": "Altera os arts. 14, 27, 53…", "situacao": { "descricao": "Arquivada", "orgao": "MESA", … }, "keywords": [ … ], "autores": [ { "nome": "…", "tipo": "Deputado(a)", "proponente": true, "deputadoId": 74537 } ] }, "meta": { … } }` },
      { path: "/v1/votacoes/{id}", desc: "Votação: placar, placar por partido, orientações de bancada e voto de cada deputado.", example: "/v1/votacoes/2236186-60", response: `{ "data": { "id": "2236186-60", "aprovada": false, "placar": { "sim": 252, "nao": 176, "abstencao": 0, "obstrucao": 0, "outros": 0, "total": 428 }, "porPartido": [ { "partido": "PL", "sim": …, "nao": …, "total": … } ], "orientacoes": [ { "bancada": "Governo", "orientacao": "Não" } ], "votos": [ { "deputadoId": 220588, "nome": "Roberto Duarte", "partido": "REPUBLICANOS", "uf": "AC", "voto": "Sim" } ] }, "meta": { … } }` },
    ],
  },
];

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      toast("Copiado");
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
    } catch {
      toast("Não foi possível copiar");
    }
  };
  return { copied, copy };
}

function Code({ text, label }: { text: string; label: string }) {
  const { copied, copy } = useCopy();
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 pr-12 text-xs leading-relaxed"><code>{text}</code></pre>
      <button
        type="button"
        onClick={() => copy(text)}
        aria-label={`Copiar ${label}`}
        className="absolute right-2 top-2 rounded-md border border-line bg-surface p-1.5 text-muted hover:text-fg"
      >
        {copied === text ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      </button>
    </div>
  );
}

const curl = (example: string) => `curl -s "${BASE}${example.replace(/^\/v1/, "")}"`;

function TryIt() {
  const [path, setPath] = useState("/v1/meta");
  const [state, setState] = useState<{ status?: number; cache?: string | null; ms?: number; body?: string; error?: string; loading?: boolean }>({});

  const run = async (e?: FormEvent) => {
    e?.preventDefault();
    const p = path.trim().startsWith("/v1") ? path.trim() : `/v1${path.trim().startsWith("/") ? "" : "/"}${path.trim()}`;
    setState({ loading: true });
    const t0 = performance.now();
    try {
      // Same-origin: /v1 é servido pelo mesmo Worker em qualquer host.
      const res = await fetch(p, { headers: { accept: "application/json" } });
      const text = await res.text();
      let body = text;
      try { body = JSON.stringify(JSON.parse(text), null, 2); } catch { /* não-JSON */ }
      if (body.length > 60_000) body = `${body.slice(0, 60_000)}\n… (resposta truncada na tela)`;
      setState({ status: res.status, cache: res.headers.get("x-emenda-cache"), ms: Math.round(performance.now() - t0), body });
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : "Falha na requisição" });
    }
  };

  return (
    <Card title="Experimente">
      <form onSubmit={run} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="api-try" className="sr-only">Caminho</label>
        <input
          id="api-try"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm"
          placeholder="/v1/ufs/SP"
        />
        <button type="submit" disabled={state.loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-verde px-4 py-2 text-sm font-semibold text-white hover:bg-verde-700 disabled:opacity-60">
          <Play size={14} aria-hidden /> {state.loading ? "Buscando…" : "Enviar"}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {["/v1/meta", "/v1/ufs", "/v1/autores?q=silva&limit=5", "/v1/deputados/204379", "/v1/votacoes/2236186-60"].map((ex) => (
          <button key={ex} type="button" onClick={() => setPath(ex)} className="rounded-full border border-line px-2 py-0.5 font-mono text-muted hover:text-fg">{ex}</button>
        ))}
      </div>
      {(state.status !== undefined || state.error) && (
        <div className="mt-3 space-y-2" aria-live="polite">
          {state.error ? (
            <Badge tone="vermelho">{state.error}</Badge>
          ) : (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone={state.status! < 300 ? "verde" : state.status === 429 ? "amarelo" : "vermelho"}>HTTP {state.status}</Badge>
              {state.cache && <Badge tone="azul">cache {state.cache}</Badge>}
              <Badge>{state.ms} ms</Badge>
            </div>
          )}
          {state.body && <Code text={state.body} label="resposta" />}
        </div>
      )}
    </Card>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Dados abertos"
        title="API pública"
        subtitle="Os mesmos dados do site em JSON, versionados, com cache e sem cadastro. Use em pesquisas, reportagens, bots e aplicativos."
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "API" }]}
      />

      <Section title="O que é">
        <p className="text-pretty leading-relaxed">
          Uma API REST somente leitura, aberta (sem chave), com as emendas parlamentares consolidadas a partir do Portal da Transparência
          e dados vivos da Câmara e do Senado já normalizados e cruzados. Todas as respostas são JSON com o mesmo envelope:
        </p>
        <div className="mt-3"><Code text={`{\n  "data": …,\n  ${META}\n}`} label="envelope" /></div>
        <p className="mt-3 text-sm text-muted">Valores monetários estão sempre em <b>centavos inteiros</b>. Erros: <code>{`{ "error": "…", "status": 404, "docs": "…" }`}</code>.</p>
      </Section>

      <Section title="Endereço base">
        <Code text={BASE} label="endereço base" />
        <p className="mt-2 text-sm text-muted">O prefixo <code>/v1</code> também funciona em <code>https://emenda.online/v1/…</code>. Mudanças incompatíveis só em uma nova versão (<code>/v2</code>).</p>
      </Section>

      <Section title="Limites e cache">
        <KeyValue
          items={[
            ["Requisições", "300 a cada 60 s por IP (inclui respostas do cache)"],
            ["Fora do cache", "60 a cada 10 s por IP"],
            ["Ao exceder", <>HTTP 429 com <code>Retry-After</code> (segundos) e <code>X-RateLimit-Limit</code></>],
            ["Consultas", "query até 512 caracteres; q até 64; limit até 500; offset até 10000; parâmetros desconhecidos são ignorados"],
            ["Cache de borda", "dados consolidados 6–24 h; dados vivos 1–12 h; stale-while-revalidate de 24 h"],
            ["Revalidação", <>Envie <code>If-None-Match</code> com o <code>ETag</code> recebido para obter 304 sem corpo</>],
            ["CORS", <><code>Access-Control-Allow-Origin: *</code> — pode ser chamada do navegador</>],
            ["Métodos", "GET, HEAD e OPTIONS"],
          ]}
        />
        <p className="mt-3 text-sm text-muted">O cabeçalho <code>x-emenda-cache</code> indica <code>HIT</code> ou <code>MISS</code>. Prefira guardar respostas localmente e respeitar o <code>Cache-Control</code>.</p>
      </Section>

      <Section title="Experimente" id="experimente">
        <TryIt />
      </Section>

      {GRUPOS.map((g) => (
        <Section key={g.titulo} title={g.titulo}>
          <div className="space-y-4">
            {g.itens.map((e) => (
              <Card key={e.path} title={<code className="text-base">GET {e.path}</code>}>
                <p className="text-sm leading-relaxed">{e.desc}</p>
                {e.note && <p className="mt-1"><Badge tone="amarelo">{e.note}</Badge></p>}
                <div className="mt-3 space-y-2">
                  <Code text={curl(e.example)} label={`exemplo ${e.path}`} />
                  <details>
                    <summary className="cursor-pointer text-sm text-muted hover:text-fg">Exemplo de resposta (resumido)</summary>
                    <div className="mt-2"><Code text={e.response} label={`resposta ${e.path}`} /></div>
                  </details>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      ))}

      <Section title="Licença e atribuição">
        <p className="leading-relaxed">
          O código é GPL-3.0; os dados são públicos. Ao usar, <b>cite o emenda.online e as fontes originais</b>:{" "}
          <ExternalLink href="https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares">Portal da Transparência</ExternalLink>,{" "}
          <ExternalLink href="https://dadosabertos.camara.leg.br">Dados Abertos da Câmara</ExternalLink> e{" "}
          <ExternalLink href="https://legis.senado.leg.br/dadosabertos">Dados Abertos do Senado</ExternalLink>. Cada resposta traz as URLs de origem em <code>meta.fonte</code>.
        </p>
        <p className="mt-2 text-sm text-muted">O cruzamento de parlamentares com emendas é feito pelo nome normalizado e pode falhar em homônimos; confira nos links oficiais.</p>
      </Section>
    </div>
  );
}
