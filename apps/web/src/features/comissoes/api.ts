// Comissões: paths same-origin + mapeadores puros (Câmara /orgaos, Senado /comissao e /votacaoComissao).
import { arr, qs } from "@/features/legislativo/api";
import type { CasaComissao, TipoComissao } from "./catalogo";

// ---------- paths ----------
export const camOrg = {
  lista: (codTipoOrgao: number, dataInicio?: string) => qs("/orgaos", { codTipoOrgao, dataInicio, itens: 100, ordem: "ASC", ordenarPor: "sigla" }),
  orgao: (id: number | string) => `/orgaos/${id}`,
  membros: (id: number | string) => qs(`/orgaos/${id}/membros`, { itens: 100 }),
  eventos: (id: number | string, dataInicio: string, dataFim: string) => qs(`/orgaos/${id}/eventos`, { dataInicio, dataFim, itens: 100, ordem: "ASC", ordenarPor: "dataHoraInicio" }),
  eventosTodos: (dataInicio: string, dataFim: string) => qs("/eventos", { dataInicio, dataFim, itens: 100, ordem: "ASC", ordenarPor: "dataHoraInicio" }),
  pauta: (idEvento: number | string) => `/eventos/${idEvento}/pauta`,
  votacoes: (id: number | string) => qs(`/orgaos/${id}/votacoes`, { itens: 30, ordem: "DESC", ordenarPor: "dataHoraRegistro" }),
};
export const senCom = {
  lista: (tipo: "permanente" | "cpi" | "temporaria") => `/comissao/lista/${tipo}`,
  mistas: () => "/comissao/lista/mistas",
  comissao: (codigo: number | string) => `/comissao/${codigo}`,
  agenda: (ini: string, fim: string) => `/comissao/agenda/${dataSenado(ini)}/${dataSenado(fim)}`,
  votacoes: (sigla: string, ini: string, fim: string) => qs(`/votacaoComissao/comissao/${encodeURIComponent(sigla)}`, { dataInicio: dataSenado(ini), dataFim: dataSenado(fim) }),
};
export const dataSenado = (iso: string) => iso.slice(0, 10).replace(/-/g, "");

// ---------- tipos ----------
export interface OrgaoCamara { id: number; sigla: string; nome: string; apelido?: string | null; codTipoOrgao: number; tipoOrgao: string; nomePublicacao?: string | null; nomeResumido?: string | null }
export interface OrgaoCamaraDetalhe extends OrgaoCamara { dataInicio: string | null; dataInstalacao: string | null; dataFim: string | null; sala: string | null; urlWebsite: string | null }
export interface MembroCamaraRaw { id: number; nome: string; siglaPartido: string; siglaUf: string; urlFoto: string; titulo: string; codTitulo: number | string; dataInicio: string | null; dataFim: string | null }
export interface EventoCamara {
  id: number; dataHoraInicio: string; dataHoraFim?: string | null; situacao: string; descricaoTipo: string; descricao: string;
  localCamara?: { nome: string | null } | null; orgaos: { id: number; sigla: string; nome?: string }[]; urlRegistro?: string | null;
}
export interface ItemPautaCamara {
  ordem: number; topico?: string; regime?: string | null; titulo: string; situacaoItem?: string | null; textoParecer?: string | null;
  relator?: { id: number; nome: string; siglaPartido: string; siglaUf: string } | null;
  proposicao_?: { id: number; siglaTipo: string; numero: number; ano: number; ementa: string } | null;
  proposicaoRelacionada_?: { id: number; siglaTipo: string; numero: number | string; ano: number | string; ementa: string } | null;
}

export interface Membro {
  nome: string; partido: string; uf: string; foto: string; href: string | null;
  casa: "camara" | "senado";
  /** "Presidente", "1º Vice-Presidente"... ou null */
  cargo: string | null;
  titular: boolean;
}

export const tipoCamara = (cod: number): TipoComissao =>
  cod === 2 ? "permanente" : cod === 3 ? "especial" : cod === 4 || cod === 20 ? "cpi" : cod === 6 || cod === 21 || cod === 9 ? "mista" : "temporaria";

// ---------- membros ----------
const fotoDeputado = (id: number | string) => `https://www.camara.leg.br/internet/deputado/bandep/${id}.jpg`;
const fotoSenador = (c: number | string) => `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${c}.jpg`;

/** "Senador Renan Calheiros" -> "Renan Calheiros". */
export const nomeLimpo = (s: string) => s.replace(/^(Senador|Senadora|Deputado|Deputada)\s+/i, "").trim();

/** Membros ativos (sem data de saída), um por deputado; cargos de mesa primeiro. */
export function mapMembrosCamara(ms: MembroCamaraRaw[]): Membro[] {
  const m = new Map<number, MembroCamaraRaw>();
  for (const x of ms) {
    if (x.dataFim) continue;
    const prev = m.get(x.id);
    if (!prev || Number(x.codTitulo) < Number(prev.codTitulo)) m.set(x.id, x);
  }
  return ordenarMembros([...m.values()].map((x) => {
    const cod = Number(x.codTitulo);
    return {
      nome: x.nome, partido: x.siglaPartido ?? "", uf: x.siglaUf ?? "", foto: x.urlFoto || fotoDeputado(x.id), href: `/deputado/${x.id}`, casa: "camara",
      cargo: cod < 100 ? x.titulo : null, titular: cod !== 102 && !/suplente/i.test(x.titulo),
    };
  }));
}

const ORDEM_CARGO = (c: string | null) => {
  if (!c) return 99;
  const t = c.toLowerCase();
  if (t.startsWith("presidente")) return 0;
  const n = /^(\d)º vice/.exec(t);
  if (n) return Number(n[1]);
  if (t.startsWith("vice")) return 1;
  return 10;
};
export function ordenarMembros(ms: Membro[]): Membro[] {
  return [...ms].sort((a, b) => ORDEM_CARGO(a.cargo) - ORDEM_CARGO(b.cargo) || Number(b.titular) - Number(a.titular) || a.nome.localeCompare(b.nome, "pt-BR"));
}
export const presidenteDe = (ms: Membro[]) => ms.find((m) => m.cargo?.toLowerCase().startsWith("presidente")) ?? null;

// ---------- Senado: composição ----------
interface MembroSenRaw { NomeParlamentar: string; CodigoParlamentar?: string; CodigoDeputadoNaCamara?: string; SiglaUf?: string; Partido?: string; TipoVaga?: string; OrigemParlamentar?: string }
interface CargoSenRaw { TipoCargo: string; NomeParlamentar: string; CodigoParlamentar?: string; CodigoDeputadoNaCamara?: string; Bancada?: string }

/** "2º VICE-PRESIDENTE" -> "2º Vice-Presidente". */
const cargoLegivel = (s: string) => s.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

function membroSen(r: MembroSenRaw, cargo: string | null = null): Membro | null {
  if (!r.NomeParlamentar || /^vago$/i.test(r.NomeParlamentar.trim())) return null;
  const camara = r.OrigemParlamentar === "Camara" || !!r.CodigoDeputadoNaCamara;
  const idDep = r.CodigoDeputadoNaCamara;
  return {
    nome: nomeLimpo(r.NomeParlamentar), partido: r.Partido ?? "", uf: r.SiglaUf ?? "", casa: camara ? "camara" : "senado",
    foto: camara ? (idDep ? fotoDeputado(idDep) : "") : r.CodigoParlamentar ? fotoSenador(r.CodigoParlamentar) : "",
    href: camara ? (idDep ? `/deputado/${idDep}` : null) : r.CodigoParlamentar ? `/senador/${r.CodigoParlamentar}` : null,
    cargo, titular: !/suplente/i.test(r.TipoVaga ?? ""),
  };
}

export interface ComissaoSenado {
  codigo: number; sigla: string; nome: string; finalidade: string | null; casa: CasaComissao; tipoDescricao: string | null;
  membros: Membro[]; cargos: Membro[]; local: string | null; email: string | null; agendaFixa: string | null;
  titulares: number | null; suplentes: number | null;
}

/** /comissao/{codigo}: comissões do Senado e mistas do Congresso (vagas de senadores e deputados). */
export function mapComissaoSenado(json: unknown): ComissaoSenado | null {
  const raiz = (json as { ComissoesCongressoNacional?: { Colegiados?: { Colegiado?: unknown } } }).ComissoesCongressoNacional;
  const c = arr(raiz?.Colegiados?.Colegiado as Record<string, never> | Record<string, never>[] | undefined)[0] as unknown as Record<string, any> | undefined;
  if (!c) return null;
  const sf: MembroSenRaw[] = arr(c.MembrosBlocoSF?.PartidoBloco).flatMap((b: any) => arr<MembroSenRaw>(b?.MembrosSF?.Membro));
  const cd: MembroSenRaw[] = arr(c.MembrosBlocoCD?.Membro).flatMap((b: any) => arr<MembroSenRaw>(b?.MembrosCD?.Membro));
  const cargosRaw = arr<CargoSenRaw>(c.Cargos?.Cargo);
  const cargos: Membro[] = cargosRaw.map((k) => {
    const b = /\(([^-)]+)-([A-Z]{2})\)/.exec(k.Bancada ?? "");
    return membroSen({
      NomeParlamentar: k.NomeParlamentar, CodigoParlamentar: k.CodigoParlamentar, CodigoDeputadoNaCamara: k.CodigoDeputadoNaCamara,
      Partido: b?.[1], SiglaUf: b?.[2], OrigemParlamentar: k.CodigoDeputadoNaCamara || /^deputad/i.test(k.NomeParlamentar) ? "Camara" : "Senado",
    }, cargoLegivel(k.TipoCargo));
  }).filter((x): x is Membro => !!x);
  const cargoDe = new Map(cargosRaw.map((k, i) => [k.CodigoParlamentar ?? "", cargos[i]?.cargo ?? null]));
  const membros = [...cd, ...sf].map((r) => membroSen(r, cargoDe.get(r.CodigoParlamentar ?? "-") ?? null)).filter((x): x is Membro => !!x);
  const sec = c.InformacoesSecretaria ?? {};
  const q = c.QuantidadesMembros ?? {};
  const siglaCasa = c.TipoColegiado?.SiglaCasa;
  return {
    codigo: Number(c.CodigoColegiado), sigla: c.SiglaColegiado ?? "", nome: c.NomeColegiado ?? "", finalidade: c.Finalidade || null,
    casa: siglaCasa === "CN" ? "cn" : "senado", tipoDescricao: c.TipoColegiado?.TipoColegiado ?? null,
    membros: ordenarMembros(membros), cargos, local: sec.LocalReuniao?.replace(/\s+/g, " ").trim() || null, email: sec.eMail || null, agendaFixa: sec.AgendaReuniao || null,
    titulares: q.Titulares ? Number(q.Titulares) : q.Distribuicao?.SenadoresTitulares ? Number(q.Distribuicao.SenadoresTitulares) : null,
    suplentes: q.Suplentes ? Number(q.Suplentes) : q.Distribuicao?.SenadoresSuplentes ? Number(q.Distribuicao.SenadoresSuplentes) : null,
  };
}

export interface ComissaoListaSen { codigo: number; sigla: string; nome: string; casa: CasaComissao; tipo: TipoComissao }

/** /comissao/lista/{tipo} (aninhado em colegiado.colegiados[].colegiado[]) e /comissao/lista/mistas. */
export function mapListaSenado(json: unknown, tipo: TipoComissao): ComissaoListaSen[] {
  const j = json as Record<string, any>;
  const itens: any[] = j.ComissoesMistasCongresso
    ? arr(j.ComissoesMistasCongresso.Colegiados?.Colegiado)
    : arr(j.ListaBasicaComissoes?.colegiado?.colegiados).flatMap((g: any) => arr(g?.colegiado));
  return itens.map((c) => ({
    codigo: Number(c.CodigoColegiado), sigla: c.SiglaColegiado, nome: c.NomeColegiado,
    casa: (j.ComissoesMistasCongresso || c.tipocolegiado?.SiglaCasa === "CN" ? "cn" : "senado") as CasaComissao, tipo,
  }));
}

// ---------- agenda ----------
const ATIVA = (s: string) => !/cancelad|encerrad|adiad|suspens|transferid/i.test(s);

/** Próxima reunião (não cancelada, a partir de `agora`) por id de órgão da Câmara. */
export function indexProximasCamara<E extends Pick<EventoCamara, "id" | "dataHoraInicio" | "situacao" | "orgaos">>(es: E[], agora: string) {
  const m = new Map<number, E>();
  for (const e of [...es].sort((a, b) => a.dataHoraInicio.localeCompare(b.dataHoraInicio))) {
    if (e.dataHoraInicio < agora.slice(0, 16) || !ATIVA(e.situacao)) continue;
    for (const o of e.orgaos) if (!m.has(o.id)) m.set(o.id, e);
  }
  return m;
}

export interface ReuniaoSenado { codigo: number; titulo: string; data: string; situacao: string; local: string | null; colegiado: number; sigla: string; itens: string[]; finalidade: string | null }
export function mapAgendaSenado(json: unknown): ReuniaoSenado[] {
  const rs = arr((json as any)?.AgendaReuniao?.reunioes?.reuniao);
  return rs.map((r: any) => {
    const partes = arr<any>(r.partes);
    return {
      codigo: Number(r.codigo), titulo: r.titulo ?? "", data: String(r.dataInicio ?? "").slice(0, 16), situacao: r.situacao ?? "", local: r.local ?? null,
      colegiado: Number(r.colegiadoCriador?.codigo), sigla: r.colegiadoCriador?.sigla ?? "",
      itens: partes.flatMap((p) => arr<any>(p?.itens).map((i) => String(i?.nome ?? "")).filter(Boolean)),
      finalidade: partes.map((p) => p?.evento?.finalidade).find(Boolean) ?? null,
    };
  });
}
export function indexProximasSenado(rs: ReuniaoSenado[], agora: string) {
  const m = new Map<number, ReuniaoSenado>();
  for (const r of [...rs].sort((a, b) => a.data.localeCompare(b.data))) {
    if (r.data < agora.slice(0, 16) || !ATIVA(r.situacao)) continue;
    if (!m.has(r.colegiado)) m.set(r.colegiado, r);
  }
  return m;
}

export interface VotacaoComissaoSen { codigo: number; data: string; materia: string; descricao: string; sim: number; nao: number; abstencao: number }
export function mapVotacoesSenado(json: unknown): VotacaoComissaoSen[] {
  return arr((json as any)?.VotacoesComissao?.Votacoes?.Votacao).map((v: any) => ({
    codigo: Number(v.CodigoVotacao), data: v.DataHoraInicioReuniao ?? "", materia: v.IdentificacaoMateria ?? "", descricao: v.DescricaoVotacao ?? "",
    sim: Number(v.TotalVotosSim) || 0, nao: Number(v.TotalVotosNao) || 0, abstencao: Number(v.TotalVotosAbstencao) || 0,
  }));
}

// ---------- agregações ----------
export function distribuicao(ms: Membro[], soTitulares = false) {
  const conta = (f: (m: Membro) => string) => {
    const c = new Map<string, number>();
    for (const m of ms) if (!soTitulares || m.titular) c.set(f(m) || "—", (c.get(f(m) || "—") ?? 0) + 1);
    return [...c].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"));
  };
  return { partidos: conta((m) => m.partido), ufs: conta((m) => m.uf) };
}

export const ORDEM_GRUPOS: TipoComissao[] = ["permanente", "cpi", "especial", "mista", "temporaria"];
export function agrupar<T extends { tipo: TipoComissao; sigla: string }>(xs: T[]): [TipoComissao, T[]][] {
  return ORDEM_GRUPOS.map((t) => [t, xs.filter((x) => x.tipo === t).sort((a, b) => a.sigla.localeCompare(b.sigla, "pt-BR"))] as [TipoComissao, T[]]).filter(([, v]) => v.length);
}
