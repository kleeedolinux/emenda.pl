// Clientes tipados (paths same-origin via Worker) + mapeadores puros do módulo legislativo.
// Câmara: /api/camara/* -> https://dadosabertos.camara.leg.br/api/v2/*
// Senado: /api/senado/* -> https://legis.senado.leg.br/dadosabertos/*
import { chaveNome, semAcento, type AutorResumo, type EmendaItem } from "@emenda/contracts";
import type { MandatoSenadoRaw, Periodo } from "./mandatos";

// ---------- utilitários ----------
type QV = string | number | boolean | null | undefined | Array<string | number>;
/** Monta query string: ignora vazios, repete arrays, codifica valores. */
export function qs(base: string, params: Record<string, QV>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    for (const x of Array.isArray(v) ? v : [v]) parts.push(`${k}=${encodeURIComponent(String(x))}`);
  }
  return parts.length ? `${base}?${parts.join("&")}` : base;
}

export interface Link { rel: string; href: string }
export interface Pagina<T> { dados: T[]; links?: Link[] }

export function lastPage(links?: Link[]): number {
  const h = links?.find((l) => l.rel === "last")?.href;
  const n = h ? Number(/[?&]pagina=(\d+)/.exec(h)?.[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** XML->JSON do Senado devolve objeto quando há um item só. */
export const arr = <T,>(x: T | T[] | null | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
export const centavos = (reais: number) => Math.round((Number(reais) || 0) * 100);
const busca = (s: string) => semAcento(s).toLowerCase();
const https = (u?: string | null) => (u ? u.replace(/^http:\/\//, "https://") : "");

// ---------- Câmara: tipos ----------
export interface DeputadoLista {
  id: number; nome: string; siglaPartido: string; siglaUf: string; urlFoto: string; idLegislatura: number; email: string | null;
}
export interface DeputadoDetalhe {
  id: number; nomeCivil: string; cpf?: string; sexo: string; urlWebsite: string | null; redeSocial: string[];
  dataNascimento: string | null; dataFalecimento: string | null; ufNascimento: string | null; municipioNascimento: string | null; escolaridade: string | null;
  ultimoStatus: DeputadoLista & {
    nomeEleitoral: string; situacao: string | null; condicaoEleitoral: string | null; descricaoStatus: string | null; data: string | null;
    gabinete: { nome: string | null; predio: string | null; sala: string | null; andar: string | null; telefone: string | null; email: string | null };
  };
}
export interface Despesa {
  ano: number; mes: number; tipoDespesa: string; codDocumento?: number; tipoDocumento?: string; dataDocumento?: string | null;
  numDocumento?: string; valorDocumento?: number; urlDocumento?: string | null; nomeFornecedor?: string; cnpjCpfFornecedor?: string;
  valorLiquido: number; valorGlosa?: number;
}
export interface ProposicaoLista { id: number; siglaTipo: string; codTipo: number; numero: number; ano: number; ementa: string; dataApresentacao?: string }
export interface ProposicaoDetalhe extends ProposicaoLista {
  descricaoTipo: string; ementaDetalhada: string; keywords: string; urlInteiroTeor: string | null; justificativa?: string | null; texto?: string | null;
  uriPropPrincipal?: string | null; uriPropAnterior?: string | null; uriPropPosterior?: string | null; urnFinal?: string | null;
  statusProposicao: {
    dataHora: string; siglaOrgao: string; regime: string; descricaoTramitacao: string; descricaoSituacao: string | null;
    despacho: string; url: string | null; ambito: string; apreciacao: string; uriUltimoRelator?: string | null;
  };
}
export interface Autor { uri: string; nome: string; codTipo: number; tipo: string; ordemAssinatura: number; proponente: number }
export interface Tramitacao {
  dataHora: string; sequencia: number; siglaOrgao: string; descricaoTramitacao: string; descricaoSituacao: string | null; despacho: string; url: string | null; regime?: string;
}
export interface VotacaoLista {
  id: string; data: string; dataHoraRegistro: string; siglaOrgao: string; descricao: string; aprovacao: number | null; proposicaoObjeto?: string | null;
}
export interface VotacaoDetalhe extends VotacaoLista {
  idOrgao: number; idEvento: number; descUltimaAberturaVotacao: string | null;
  objetosPossiveis?: ProposicaoLista[]; proposicoesAfetadas?: ProposicaoLista[];
  ultimaApresentacaoProposicao?: { descricao: string; uriProposicaoCitada: string | null } | null;
}
export interface Partido { id: number; sigla: string; nome: string; uri?: string }
export interface PartidoDetalhe extends Partido {
  status: {
    data: string; idLegislatura: string; situacao: string; totalPosse: string; totalMembros: string;
    lider?: { uri: string; nome: string; siglaPartido: string; uf: string; urlFoto: string } | null;
  };
  numeroEleitoral: string | null; urlLogo: string | null; urlWebSite: string | null; urlFacebook: string | null;
}
export interface HistoricoDeputado {
  id: number; nome: string; nomeEleitoral: string; siglaPartido: string; siglaUf: string; idLegislatura: number; dataHora: string;
  situacao: string | null; condicaoEleitoral: string | null; descricaoStatus: string | null;
}
export interface Frente { id: number; titulo: string; idLegislatura: number }
export interface OrgaoDeputado { idOrgao: number; siglaOrgao: string; nomeOrgao: string; nomePublicacao: string; titulo: string; dataInicio: string; dataFim: string | null }
export interface Profissao { dataHora: string; codTipoProfissao: number; titulo: string }
export interface Ocupacao { titulo: string | null; entidade: string | null; entidadeUF: string | null; entidadePais: string | null; anoInicio: number | null; anoFim: number | null }
export interface LegislaturaApi { id: number; dataInicio: string; dataFim: string }
export interface Tema { codTema: number; tema: string; relevancia: number }
export interface Referencia { cod: string; sigla: string; nome: string; descricao: string }

// ---------- Câmara: paths ----------
export const cam = {
  deputados: (p: { idLegislatura?: number | number[]; pagina?: number; itens?: number; siglaUf?: string; siglaPartido?: string; nome?: string; id?: number[] } = {}) =>
    qs("/deputados", { id: p.id, idLegislatura: p.idLegislatura, siglaUf: p.siglaUf, siglaPartido: p.siglaPartido, nome: p.nome, pagina: p.pagina, itens: p.itens, ordem: "ASC", ordenarPor: "nome" }),
  deputado: (id: number | string) => `/deputados/${id}`,
  despesas: (id: number | string, ano: number, pagina = 1) => qs(`/deputados/${id}/despesas`, { ano, pagina, itens: 100, ordem: "DESC", ordenarPor: "dataDocumento" }),
  frentes: (id: number | string) => `/deputados/${id}/frentes`,
  orgaos: (id: number | string) => qs(`/deputados/${id}/orgaos`, { itens: 100, ordem: "DESC", ordenarPor: "dataInicio" }),
  historico: (id: number | string) => `/deputados/${id}/historico`,
  profissoes: (id: number | string) => `/deputados/${id}/profissoes`,
  ocupacoes: (id: number | string) => `/deputados/${id}/ocupacoes`,
  proposicoesAutor: (id: number | string, pagina = 1, desde?: string, ate?: string) =>
    qs("/proposicoes", { idDeputadoAutor: id, dataApresentacaoInicio: desde, dataApresentacaoFim: ate, ordem: "DESC", ordenarPor: "id", pagina, itens: 50 }),
  proposicao: (id: number | string) => `/proposicoes/${id}`,
  autores: (id: number | string) => `/proposicoes/${id}/autores`,
  tramitacoes: (id: number | string) => `/proposicoes/${id}/tramitacoes`,
  temas: (id: number | string) => `/proposicoes/${id}/temas`,
  relacionadas: (id: number | string) => `/proposicoes/${id}/relacionadas`,
  votacoesProposicao: (id: number | string) => `/proposicoes/${id}/votacoes`,
  buscaProposicao: (sigla: string, numero: number | string, ano: number | string) => qs("/proposicoes", { siglaTipo: sigla, numero, ano }),
  votacao: (id: string) => `/votacoes/${id}`,
  votos: (id: string) => `/votacoes/${id}/votos`,
  orientacoes: (id: string) => `/votacoes/${id}/orientacoes`,
  partidos: (idLegislatura = 57) => qs("/partidos", { idLegislatura, itens: 100, ordem: "ASC", ordenarPor: "sigla" }),
  partidoPorSigla: (sigla: string) => qs("/partidos", { sigla, itens: 100 }),
  partido: (id: number | string) => `/partidos/${id}`,
  membros: (id: number | string) => qs(`/partidos/${id}/membros`, { itens: 100 }),
  legislaturas: () => qs("/legislaturas", { itens: 100 }),
  tiposProposicao: () => "/referencias/proposicoes/siglaTipo",
  temasRef: () => "/referencias/proposicoes/codTema",
};

// ---------- Senado: paths ----------
export const sen = {
  listaAtual: () => "/senador/lista/atual",
  listaLegislatura: (ini: number, fim: number) => `/senador/lista/legislatura/${ini}/${fim}`,
  senador: (c: string | number) => `/senador/${c}`,
  mandatos: (c: string | number) => `/senador/${c}/mandatos`,
  comissoes: (c: string | number) => `/senador/${c}/comissoes`,
  votacoes: (c: string | number, dataInicio: string, dataFim?: string) => qs("/votacao", { codigoParlamentar: c, dataInicio, dataFim }),
  autorias: (c: string | number) => qs("/processo", { codigoParlamentarAutor: c }),
  processoBusca: (sigla: string, numero: number | string, ano: number | string) => qs("/processo", { sigla, numero, ano }),
  processo: (id: number | string) => `/processo/${id}`,
  votacoesProcesso: (id: number | string) => qs("/votacao", { idProcesso: id }),
};

// ---------- Fontes originais (upstream + páginas humanas) ----------
export interface Fonte { label: string; href: string }
const CAM_API = "https://dadosabertos.camara.leg.br/api/v2";
const SEN_API = "https://legis.senado.leg.br/dadosabertos";
export const fontes = {
  camaraApi: (p: string) => `${CAM_API}${p}`,
  senadoApi: (p: string) => `${SEN_API}${p}`,
  proposicao: (id: number | string): Fonte[] => [
    { label: "API da Câmara (JSON)", href: `${CAM_API}/proposicoes/${id}` },
    { label: "Ficha de tramitação na Câmara", href: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${id}` },
  ],
  materiaSenado: (codigo: number | string): Fonte[] => [
    { label: "Matéria no site do Senado", href: `https://www25.senado.leg.br/web/atividade/materias/-/materia/${codigo}` },
  ],
  deputado: (id: number | string): Fonte[] => [
    { label: "API da Câmara (JSON)", href: `${CAM_API}/deputados/${id}` },
    { label: "Perfil no site da Câmara", href: `https://www.camara.leg.br/deputados/${id}` },
  ],
  senador: (c: number | string): Fonte[] => [
    { label: "API do Senado (JSON)", href: `${SEN_API}/senador/${c}` },
    { label: "Perfil no site do Senado", href: `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${c}` },
  ],
  votacao: (id: string): Fonte[] => [
    { label: "Votação na API da Câmara", href: `${CAM_API}/votacoes/${id}` },
    { label: "Votos individuais (JSON)", href: `${CAM_API}/votacoes/${id}/votos` },
    { label: "Orientações de bancada (JSON)", href: `${CAM_API}/votacoes/${id}/orientacoes` },
  ],
  partido: (id: number | string): Fonte[] => [{ label: "API da Câmara (JSON)", href: `${CAM_API}/partidos/${id}` }],
  emendas: (): Fonte[] => [{ label: "Portal da Transparência — emendas parlamentares", href: "https://portaldatransparencia.gov.br/emendas" }],
};

// ---------- Deputados ----------
/** Lista da Câmara repete o deputado por mudança de partido; fica o último registro. Ordena por nome. */
export function dedupeDeputados(ds: DeputadoLista[]): DeputadoLista[] {
  const m = new Map<number, DeputadoLista>();
  for (const d of ds) m.set(d.id, d);
  return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function filtrarDeputados(
  ds: DeputadoLista[],
  f: { q?: string; uf?: string; partido?: string; sexo?: string; sexoPorId?: Map<number, string> },
): DeputadoLista[] {
  const q = busca(f.q ?? "").trim();
  return ds.filter((d) =>
    (!q || busca(d.nome).includes(q)) && (!f.uf || d.siglaUf === f.uf) && (!f.partido || d.siglaPartido === f.partido) &&
    (!f.sexo || f.sexoPorId?.get(d.id) === f.sexo));
}

// ---------- Cruzamento com emendas ----------
export type IndiceAutores = Map<string, AutorResumo>;
export function indexAutores(as: AutorResumo[]): IndiceAutores {
  const m: IndiceAutores = new Map();
  for (const a of as) if (!m.has(a.chave)) m.set(a.chave, a);
  return m;
}
const TITULOS = /^(DEP|DEPUTADO|DEPUTADA|SEN|SENADOR|SENADORA)\s+/;
/** Tenta cada nome (eleitoral, parlamentar, civil...) com e sem pronome de tratamento. */
export function encontrarAutor(idx: IndiceAutores, nomes: Array<string | null | undefined>): AutorResumo | null {
  for (const n of nomes) {
    if (!n) continue;
    const c = chaveNome(n);
    if (!c) continue;
    const hit = idx.get(c) ?? idx.get(c.replace(TITULOS, ""));
    if (hit) return hit;
  }
  return null;
}

export function emendasPorAno(es: Pick<EmendaItem, "ano" | "pago">[], janela?: Periodo) {
  const a0 = janela ? Number(janela.inicio.slice(0, 4)) : -Infinity;
  const a1 = janela ? Number(janela.fim.slice(0, 4)) : Infinity;
  const m = new Map<number, { ano: number; pago: number; n: number }>();
  for (const e of es) {
    if (e.ano < a0 || e.ano > a1) continue;
    const r = m.get(e.ano) ?? m.set(e.ano, { ano: e.ano, pago: 0, n: 0 }).get(e.ano)!;
    r.pago += e.pago; r.n++;
  }
  return [...m.values()].sort((a, b) => a.ano - b.ano);
}

// ---------- CEAP ----------
export function despesasPorTipo(ds: Pick<Despesa, "tipoDespesa" | "valorLiquido">[]) {
  const m = new Map<string, number>();
  for (const d of ds) m.set(d.tipoDespesa, (m.get(d.tipoDespesa) ?? 0) + centavos(d.valorLiquido));
  return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}
export const totalDespesas = (ds: Pick<Despesa, "valorLiquido">[]) => ds.reduce((s, d) => s + centavos(d.valorLiquido), 0);

// ---------- Busca de proposições ----------
export const ORDENAR_POR = ["id", "ano", "numero", "siglaTipo", "codTipo"] as const;
export const DESDE_PADRAO = "2022-01-01";
export interface FiltrosProposicoes {
  tipos: string[]; numero: string; ano: string; desde: string; q: string; autor: string; tema: string;
  ordenarPor: (typeof ORDENAR_POR)[number]; ordem: "ASC" | "DESC"; pagina: number;
}

export function parseFiltrosProposicoes(sp: URLSearchParams): FiltrosProposicoes {
  const ob = sp.get("ordenarPor") as FiltrosProposicoes["ordenarPor"];
  return {
    tipos: (sp.get("tipo") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
    numero: (sp.get("numero") ?? "").replace(/\D/g, ""),
    ano: (sp.get("ano") ?? "").replace(/\D/g, ""),
    desde: sp.get("desde") || DESDE_PADRAO,
    q: sp.get("q") ?? "",
    autor: sp.get("autor") ?? "",
    tema: sp.get("tema") ?? "",
    ordenarPor: ORDENAR_POR.includes(ob) ? ob : "id",
    ordem: sp.get("ordem") === "ASC" ? "ASC" : "DESC",
    pagina: Math.max(1, Number(sp.get("pagina")) || 1),
  };
}

export function filtrosToSearch(f: FiltrosProposicoes): URLSearchParams {
  const s = new URLSearchParams();
  const put = (k: string, v: string, def = "") => { if (v && v !== def) s.set(k, v); };
  put("tipo", f.tipos.join(","));
  put("ano", f.ano);
  put("desde", f.desde, DESDE_PADRAO);
  put("q", f.q);
  put("autor", f.autor);
  put("tema", f.tema);
  put("numero", f.numero);
  put("ordenarPor", f.ordenarPor, "id");
  put("ordem", f.ordem, "DESC");
  put("pagina", String(f.pagina), "1");
  return s;
}

/** Sem ano/número a API só devolve os últimos 30 dias; por isso usamos `dataApresentacaoInicio`. */
export function filtrosToApi(f: FiltrosProposicoes, itens = 50): string {
  return qs("/proposicoes", {
    siglaTipo: f.tipos.join(","), numero: f.numero, ano: f.ano, keywords: f.q, autor: f.autor, codTema: f.tema,
    dataApresentacaoInicio: f.ano || f.numero ? undefined : f.desde,
    ordem: f.ordem, ordenarPor: f.ordenarPor, pagina: f.pagina, itens,
  });
}

// ---------- Senado ----------
export interface SenadorResumo {
  codigo: string; nome: string; nomeCompleto: string; sexo: "M" | "F" | ""; foto: string; pagina: string; email: string;
  partido: string; uf: string; bloco: string; mandatos: MandatoSenadoRaw[];
}
interface IdentSenado {
  CodigoParlamentar: string; NomeParlamentar: string; NomeCompletoParlamentar?: string; SexoParlamentar?: string; UrlFotoParlamentar?: string;
  UrlPaginaParlamentar?: string; EmailParlamentar?: string; SiglaPartidoParlamentar?: string; UfParlamentar?: string; Bloco?: { NomeBloco?: string };
}
interface ParlSenadoRaw { IdentificacaoParlamentar: IdentSenado; Mandato?: MandatoSenadoRaw; Mandatos?: { Mandato?: MandatoSenadoRaw | MandatoSenadoRaw[] } }

const sexo = (s?: string): SenadorResumo["sexo"] => (s?.startsWith("F") ? "F" : s?.startsWith("M") ? "M" : "");
function ident(i: IdentSenado) {
  return {
    codigo: i.CodigoParlamentar, nome: i.NomeParlamentar, nomeCompleto: i.NomeCompletoParlamentar ?? i.NomeParlamentar, sexo: sexo(i.SexoParlamentar),
    foto: https(i.UrlFotoParlamentar), pagina: https(i.UrlPaginaParlamentar), email: i.EmailParlamentar ?? "",
    partido: i.SiglaPartidoParlamentar ?? "", uf: i.UfParlamentar ?? "", bloco: i.Bloco?.NomeBloco ?? "",
  };
}

/** Aceita `ListaParlamentarEmExercicio` (lista atual) e `ListaParlamentarLegislatura`. */
export function mapSenadores(json: unknown): SenadorResumo[] {
  const j = json as Record<string, { Parlamentares?: { Parlamentar?: ParlSenadoRaw | ParlSenadoRaw[] } }>;
  const raiz = j.ListaParlamentarEmExercicio ?? j.ListaParlamentarLegislatura;
  return arr(raiz?.Parlamentares?.Parlamentar)
    .map((p) => ({ ...ident(p.IdentificacaoParlamentar), mandatos: p.Mandatos ? arr(p.Mandatos.Mandato) : arr(p.Mandato) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

const fone = (n: string) => { const d = n.replace(/\D/g, ""); return d.length === 8 ? `(61) ${d.slice(0, 4)}-${d.slice(4)}` : n; };
export function mapSenadorDetalhe(json: unknown) {
  const p = (json as { DetalheParlamentar?: { Parlamentar?: Record<string, never> } }).DetalheParlamentar?.Parlamentar as unknown as {
    IdentificacaoParlamentar: IdentSenado;
    DadosBasicosParlamentar?: { DataNascimento?: string; Naturalidade?: string; UfNaturalidade?: string; EnderecoParlamentar?: string };
    Telefones?: { Telefone?: { NumeroTelefone: string } | { NumeroTelefone: string }[] };
  } | undefined;
  if (!p) return null;
  const b = p.DadosBasicosParlamentar ?? {};
  return {
    ...ident(p.IdentificacaoParlamentar),
    nascimento: b.DataNascimento ?? null,
    naturalidade: b.Naturalidade ? `${b.Naturalidade}${b.UfNaturalidade ? `/${b.UfNaturalidade}` : ""}` : null,
    endereco: b.EnderecoParlamentar?.replace(/\s+/g, " ").trim() ?? null,
    telefones: arr(p.Telefones?.Telefone).map((t) => fone(t.NumeroTelefone)),
  };
}
export type SenadorDetalhe = NonNullable<ReturnType<typeof mapSenadorDetalhe>>;

/** Item de /processo (lista). */
export interface ProcessoSenado {
  id: number; codigoMateria: number; identificacao: string; ementa: string; dataApresentacao: string; situacaoAtual?: string; tramitando?: string;
  normaGerada?: string; urlDocumento?: string; tipoDocumento?: string; autoria?: string; casaIdentificadora?: string; dataSituacaoAtual?: string; objetivo?: string;
}
/** Votação do Senado (endpoint /votacao). */
export interface VotacaoSenado {
  codigoSessaoVotacao: number; dataSessao: string; descricaoVotacao: string; identificacao: string; ementa: string; resultadoVotacao: string | null;
  codigoMateria: number; idProcesso: number; votacaoSecreta: string; totalVotosSim: number | null; totalVotosNao: number | null; totalVotosAbstencao: number | null;
  votos?: import("./votacao").VotoSenadoRaw[];
}
