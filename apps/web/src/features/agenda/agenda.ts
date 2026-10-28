// Agenda do Congresso: normalização de eventos (Câmara + Senado), semanas em
// America/Sao_Paulo e geração de .ics. Funções puras.

export type Casa = "camara" | "senado";
export type Ambito = "plenario" | "comissao";
export type Status = "agendada" | "em-andamento" | "encerrada" | "cancelada";

export interface Materia {
  id: string;
  sigla: string;
  ementa?: string;
  apreciacao?: string;
  relator?: string;
  regime?: string;
  /** Rota interna (/proposicao/:id) ou URL externa. */
  href?: string;
}

export interface AgendaEvento {
  id: string;
  casa: Casa;
  ambito: Ambito;
  titulo: string;
  descricao?: string;
  orgao: string;
  orgaoSigla: string;
  dia: string; // YYYY-MM-DD (horário de Brasília)
  hora: string; // HH:mm
  inicio: string; // YYYY-MM-DDTHH:mm (horário de Brasília)
  fim?: string;
  status: Status;
  deliberativa: boolean;
  local?: string;
  fonte: string;
  video?: string;
  pautaUrl?: string;
  materias: Materia[];
  camaraId?: number;
}

export const TZ = "America/Sao_Paulo";
const SP_OFFSET = "-03:00"; // sem horário de verão desde 2019

// ---------- datas ----------
const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Data civil em Brasília (YYYY-MM-DD). */
export const diaSP = (d: Date): string => fmtDia.format(d);

export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface Semana { inicio: string; fim: string; dias: string[] }

/** Semana (segunda a domingo) que contém `ref` em Brasília, deslocada `offset` semanas. */
export function semanaSP(ref: Date, offset = 0): Semana {
  const hoje = diaSP(ref);
  const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const inicio = somarDias(hoje, -((dow + 6) % 7) + offset * 7);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
  return { inicio, fim: dias[6]!, dias };
}

/** Datas (YYYYMMDD) para /plenario/agenda/mes/{data}: uma por mês tocado pela semana. */
export function mesesDaSemana(s: Semana): string[] {
  const out = [s.inicio];
  for (const d of s.dias) if (d.slice(0, 7) !== out[out.length - 1]!.slice(0, 7)) out.push(d);
  return out.map((d) => d.replaceAll("-", ""));
}

// ---------- helpers ----------
const arr = <T>(x: T | T[] | null | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const limpa = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
const titleCase = (s: string) =>
  limpa(s).toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());

function statusDe(s: string): Status {
  const t = s.toLowerCase();
  if (/cancel|anulad|não realizad|nao realizad|adiad/.test(t)) return "cancelada";
  if (/andamento|aberta|em curso/.test(t)) return "em-andamento";
  if (/encerrad|realizad|finaliz/.test(t)) return "encerrada";
  return "agendada";
}

// ---------- Câmara ----------
export interface CamaraEvento {
  id: number;
  dataHoraInicio: string;
  dataHoraFim?: string | null;
  situacao?: string;
  descricaoTipo?: string;
  descricao?: string;
  localExterno?: string | null;
  localCamara?: { nome?: string | null } | null;
  orgaos?: { sigla?: string; nome?: string; apelido?: string; codTipoOrgao?: number; tipoOrgao?: string }[];
  urlRegistro?: string | null;
}

export function fromCamara(e: CamaraEvento): AgendaEvento {
  const o = e.orgaos?.[0];
  const sigla = o?.sigla ?? "";
  const plen = sigla === "PLEN" || /plen[aá]rio/i.test(o?.tipoOrgao ?? "") || e.orgaos?.some((x) => x.sigla === "PLEN") === true;
  const inicio = e.dataHoraInicio.slice(0, 16);
  return {
    id: `camara-${e.id}`,
    camaraId: e.id,
    casa: "camara",
    ambito: plen ? "plenario" : "comissao",
    titulo: limpa(e.descricaoTipo) || "Evento",
    descricao: limpa(e.descricao) || undefined,
    orgao: limpa(o?.nome) || "Câmara dos Deputados",
    orgaoSigla: sigla,
    dia: inicio.slice(0, 10),
    hora: inicio.slice(11, 16),
    inicio,
    fim: e.dataHoraFim ? e.dataHoraFim.slice(0, 16) : undefined,
    status: statusDe(e.situacao ?? ""),
    deliberativa: /deliberativ/i.test(e.descricaoTipo ?? ""),
    local: limpa(e.localCamara?.nome) || limpa(e.localExterno) || undefined,
    fonte: `https://www.camara.leg.br/evento-legislativo/${e.id}`,
    video: e.urlRegistro || undefined,
    materias: [],
  };
}

export interface CamaraPautaItem {
  ordem?: number;
  regime?: string | null;
  titulo?: string;
  situacaoItem?: string | null;
  proposicao_?: { id: number; siglaTipo?: string; numero?: number | string; ano?: number | string; ementa?: string } | null;
  proposicaoRelacionada_?: { id: number; siglaTipo?: string; numero?: number | string; ano?: number | string; ementa?: string } | null;
  relator?: { id: number; nome: string; siglaPartido?: string; siglaUf?: string } | null;
}

/** Item de pauta da Câmara → matéria. Prefere a proposição principal quando o item é um requerimento sobre ela. */
export function materiaCamara(p: CamaraPautaItem): Materia {
  const prop = p.proposicao_;
  const rel = p.proposicaoRelacionada_;
  const sigla = prop ? `${prop.siglaTipo} ${prop.numero}/${prop.ano}` : limpa(p.titulo);
  return {
    id: String(prop?.id ?? p.ordem ?? sigla),
    sigla,
    ementa: limpa(prop?.ementa) || undefined,
    apreciacao: rel ? `Sobre ${rel.siglaTipo} ${rel.numero}/${rel.ano}` : undefined,
    relator: p.relator ? `${p.relator.nome}${p.relator.siglaPartido ? ` (${p.relator.siglaPartido}-${p.relator.siglaUf})` : ""}` : undefined,
    regime: limpa(p.regime) || undefined,
    href: prop ? `/proposicao/${prop.id}` : undefined,
  };
}

// ---------- Senado ----------
export interface SenadoMateria {
  CodigoMateria?: string;
  DescricaoIdentificacaoMateria?: string;
  Identificacao?: string;
  Ementa?: string;
  Apreciacao?: string;
  Parecer?: string;
}
export interface SenadoSessao {
  Data: string;
  Hora?: string;
  CodigoSessao: string;
  TipoSessao?: string;
  NumeroSessao?: string;
  LocalSessao?: string;
  SituacaoSessao?: string;
  Casa?: string;
  Materias?: { Materia?: SenadoMateria | SenadoMateria[] };
  Evento?: { DescricaoEvento?: string };
}

const materiaSenadoUrl = (cod: string) => `https://www25.senado.leg.br/web/atividade/materias/-/materia/${cod}`;

export function fromSenadoSessao(s: SenadoSessao): AgendaEvento {
  const hora = (s.Hora ?? "00:00").slice(0, 5);
  const tipo = titleCase(s.TipoSessao ?? "Sessão");
  const num = limpa(s.NumeroSessao).replace(/\s*sess[aã]o$/i, "");
  const cn = s.Casa === "CN";
  return {
    id: `senado-${s.CodigoSessao}`,
    casa: "senado",
    ambito: "plenario",
    titulo: num ? `${num} ${tipo}` : tipo,
    descricao: limpa(s.Evento?.DescricaoEvento) || undefined,
    orgao: cn ? "Congresso Nacional" : "Plenário do Senado",
    orgaoSigla: cn ? "CN" : "PLEN",
    dia: s.Data,
    hora,
    inicio: `${s.Data}T${hora}`,
    status: statusDe(s.SituacaoSessao ?? ""),
    deliberativa: /deliberativ/i.test(s.TipoSessao ?? "") && !/n[aã]o deliberativ/i.test(s.TipoSessao ?? ""),
    local: limpa(s.LocalSessao) || undefined,
    fonte: `https://www25.senado.leg.br/web/atividade/sessao-plenaria/-/pauta/${s.CodigoSessao}`,
    materias: arr(s.Materias?.Materia).map((m) => ({
      id: m.CodigoMateria ?? limpa(m.Identificacao),
      sigla: limpa(m.DescricaoIdentificacaoMateria ?? m.Identificacao),
      ementa: limpa(m.Ementa) || undefined,
      apreciacao: limpa(m.Apreciacao) || undefined,
      relator: limpa(m.Parecer) || undefined,
      href: m.CodigoMateria ? materiaSenadoUrl(m.CodigoMateria) : undefined,
    })),
  };
}

export interface SenadoReuniao {
  codigo: string;
  titulo?: string;
  dataInicio: string;
  situacao?: string;
  realizada?: string;
  local?: string;
  colegiadoCriador?: { sigla?: string; nome?: string };
  urlUltimaPautaSimplesPublicada?: string;
  partes?: SenadoParte | SenadoParte[];
}
interface SenadoParte { descricaoTipo?: string; isDeliberativa?: string; evento?: { finalidade?: string } }

export function fromSenadoReuniao(r: SenadoReuniao): AgendaEvento {
  const inicio = r.dataInicio.slice(0, 16);
  const partes = arr(r.partes);
  const st = r.realizada === "true" ? "encerrada" : statusDe(r.situacao ?? "");
  return {
    id: `senado-r${r.codigo}`,
    casa: "senado",
    ambito: "comissao",
    titulo: limpa(r.titulo) || "Reunião",
    descricao: partes.map((p) => limpa(p.evento?.finalidade)).filter(Boolean).join(" · ") || undefined,
    orgao: limpa(r.colegiadoCriador?.nome) || "Comissão do Senado",
    orgaoSigla: r.colegiadoCriador?.sigla ?? "",
    dia: inicio.slice(0, 10),
    hora: inicio.slice(11, 16),
    inicio,
    status: st,
    deliberativa: partes.some((p) => p.isDeliberativa === "true"),
    local: limpa(r.local) || undefined,
    fonte: `https://legis.senado.leg.br/comissoes/reuniao?reuniao=${r.codigo}`,
    pautaUrl: r.urlUltimaPautaSimplesPublicada || undefined,
    materias: [],
  };
}

export const ordenar = (a: AgendaEvento, b: AgendaEvento) => a.inicio.localeCompare(b.inicio) || a.casa.localeCompare(b.casa);

// ---------- ICS (RFC 5545) ----------
const icsEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const spToDate = (local: string) => new Date(`${local}:00${SP_OFFSET}`);

/** Dobra linhas em 75 octetos (UTF-8) sem partir caracteres. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const lim = out.length === 0 ? 75 : 74; // continuação começa com espaço
    if (size + n > lim) { out.push(cur); cur = ""; size = 0; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const CASA_NOME: Record<Casa, string> = { camara: "Câmara", senado: "Senado" };

export function toICS(ev: AgendaEvento, now = new Date()): string {
  const ini = spToDate(ev.inicio);
  const fim = ev.fim ? spToDate(ev.fim) : new Date(ini.getTime() + 2 * 3600_000);
  const desc = [ev.orgao, ev.descricao, ...ev.materias.map((m) => `• ${m.sigla}${m.ementa ? ` — ${m.ementa}` : ""}`), `Fonte: ${ev.fonte}`]
    .filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//emenda.pl//Agenda do Congresso//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.id}@emenda.pl`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsUtc(ini)}`,
    `DTEND:${icsUtc(fim)}`,
    `SUMMARY:${icsEsc(`[${CASA_NOME[ev.casa]}] ${ev.titulo}`)}`,
    `DESCRIPTION:${icsEsc(desc)}`,
    ...(ev.local ? [`LOCATION:${icsEsc(ev.local)}`] : []),
    `URL:${ev.fonte}`,
    ...(ev.status === "cancelada" ? ["STATUS:CANCELLED"] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export const icsFilename = (ev: AgendaEvento) => `${ev.casa}-${ev.ambito}-${ev.dia}.ics`;
