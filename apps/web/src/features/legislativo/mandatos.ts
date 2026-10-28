// Mandatos e tempo de casa. Puro: datas ISO (AAAA-MM-DD), sem fuso.

export interface Periodo { inicio: string; fim: string }
export interface Legislatura { id: number; dataInicio: string; dataFim: string }

export interface Mandato {
  /** chave estável: legislatura (Câmara) ou código do mandato (Senado) */
  codigo: string;
  casa: "camara" | "senado";
  legislatura?: number;
  rotulo: string;
  inicio: string;
  fim: string;
  /** períodos efetivos de exercício */
  periodos: Periodo[];
  atual: boolean;
  /** true quando a fonte não registra entradas/saídas e assumimos a legislatura inteira */
  estimado: boolean;
  participacao?: string;
  uf?: string;
}

const DIA = 86_400_000;
const ms = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const min = (a: string, b: string) => (a < b ? a : b);
const max = (a: string, b: string) => (a > b ? a : b);
export const hojeISO = () => new Date().toISOString().slice(0, 10);

export function dentro(data: string, p: Periodo): boolean {
  const d = data.slice(0, 10);
  return d >= p.inicio && d <= p.fim;
}

/** Ordena e une períodos sobrepostos ou contíguos (dia seguinte). */
export function mesclarPeriodos(ps: Periodo[]): Periodo[] {
  const s = ps.filter((p) => p.inicio && p.fim && p.inicio <= p.fim).slice().sort((a, b) => a.inicio.localeCompare(b.inicio));
  const out: Periodo[] = [];
  for (const p of s) {
    const last = out[out.length - 1];
    if (last && ms(p.inicio) <= ms(last.fim) + DIA) last.fim = max(last.fim, p.fim);
    else out.push({ ...p });
  }
  return out;
}

/** Dias corridos (inclusivos) cobertos pelos períodos, sem contar sobreposição. */
export function duracaoDias(ps: Periodo[]): number {
  return mesclarPeriodos(ps).reduce((n, p) => n + Math.round((ms(p.fim) - ms(p.inicio)) / DIA) + 1, 0);
}

/** "12 anos e 3 meses". Ano = 365 dias, mês = 30 dias (aproximação legível). */
export function formatDuracao(dias: number): string {
  const anos = Math.floor(dias / 365);
  const meses = Math.floor((dias - anos * 365) / 30);
  const a = anos ? `${anos} ${anos === 1 ? "ano" : "anos"}` : "";
  const m = meses ? `${meses} ${meses === 1 ? "mês" : "meses"}` : "";
  if (!a && !m) return "menos de 1 mês";
  return a && m ? `${a} e ${m}` : a || m;
}

// ---------- Câmara ----------
export interface HistoricoItem {
  idLegislatura: number;
  dataHora: string;
  situacao: string | null;
  descricaoStatus: string | null;
}

const SAIDA = /^sa[ií]da/i;
const FORA = new Set(["afastado", "licença", "licenca", "vacância", "vacancia", "fim_mandato", "fim de mandato", "suplência", "suplencia", "convocado"]);

/** Agrupa o histórico da Câmara em mandatos (um por legislatura) com períodos de exercício. */
export function mandatosCamara(hist: HistoricoItem[], legislaturas: Legislatura[], hoje = hojeISO()): Mandato[] {
  const legs = new Map(legislaturas.map((l) => [l.id, l]));
  const porLeg = new Map<number, HistoricoItem[]>();
  for (const h of hist) (porLeg.get(h.idLegislatura) ?? porLeg.set(h.idLegislatura, []).get(h.idLegislatura)!).push(h);
  const out: Mandato[] = [];
  for (const [id, itens] of porLeg) {
    const leg = legs.get(id);
    if (!leg) continue;
    const lim = min(leg.dataFim, hoje);
    const s = itens.slice().sort((a, b) => a.dataHora.localeCompare(b.dataHora));
    const periodos: Periodo[] = [];
    let aberto: string | null = null;
    let viuExercicio = false;
    for (const h of s) {
      const d = h.dataHora.slice(0, 10);
      const sit = (h.situacao ?? "").toLowerCase();
      const saida = SAIDA.test(h.descricaoStatus ?? "") || FORA.has(sit);
      if (sit === "exercício" || sit === "exercicio") {
        viuExercicio = true;
        if (!aberto) aberto = max(d, leg.dataInicio);
      } else if (saida && aberto) {
        periodos.push({ inicio: aberto, fim: min(d, lim) });
        aberto = null;
      }
    }
    if (aberto) periodos.push({ inicio: aberto, fim: lim });
    const estimado = !viuExercicio;
    const ps = estimado ? (leg.dataInicio <= hoje ? [{ inicio: leg.dataInicio, fim: lim }] : []) : mesclarPeriodos(periodos);
    const ultimo = s[s.length - 1];
    out.push({
      codigo: String(id), casa: "camara", legislatura: id, rotulo: `${id}ª legislatura (${leg.dataInicio.slice(0, 4)}–${leg.dataFim.slice(0, 4)})`,
      inicio: leg.dataInicio, fim: leg.dataFim, periodos: ps, estimado,
      atual: !estimado && !!aberto && hoje <= leg.dataFim && !!ultimo,
    });
  }
  return out.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

export const periodosCamara = (ms_: Mandato[]) => mesclarPeriodos(ms_.flatMap((m) => m.periodos));

// ---------- Senado ----------
interface LegSenado { NumeroLegislatura?: string; DataInicio?: string; DataFim?: string }
export interface MandatoSenadoRaw {
  CodigoMandato?: string;
  UfParlamentar?: string;
  DescricaoParticipacao?: string;
  PrimeiraLegislaturaDoMandato?: LegSenado;
  SegundaLegislaturaDoMandato?: LegSenado;
  Exercicios?: { Exercicio?: unknown };
}
const lista = <T,>(x: T | T[] | undefined | null): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);

/** Mandatos do Senado (8 anos = 2 legislaturas) com exercícios efetivos. */
export function periodosSenado(raw: MandatoSenadoRaw[], hoje = hojeISO()): Mandato[] {
  return raw
    .map((m) => {
      const inicio = m.PrimeiraLegislaturaDoMandato?.DataInicio ?? "";
      const fim = m.SegundaLegislaturaDoMandato?.DataFim ?? m.PrimeiraLegislaturaDoMandato?.DataFim ?? "";
      const ex = lista(m.Exercicios?.Exercicio as { DataInicio?: string; DataFim?: string } | { DataInicio?: string; DataFim?: string }[]);
      const abertos = ex.filter((e) => e.DataInicio && !e.DataFim);
      const periodos = mesclarPeriodos(
        ex.filter((e) => e.DataInicio && e.DataInicio <= hoje).map((e) => ({ inicio: e.DataInicio!, fim: min(e.DataFim ?? min(fim || hoje, hoje), hoje) })),
      );
      const l1 = m.PrimeiraLegislaturaDoMandato?.NumeroLegislatura;
      const l2 = m.SegundaLegislaturaDoMandato?.NumeroLegislatura;
      return {
        codigo: m.CodigoMandato ?? `${inicio}`, casa: "senado" as const, legislatura: l1 ? Number(l1) : undefined,
        rotulo: `Mandato ${inicio.slice(0, 4)}–${fim.slice(0, 4)}${l1 ? ` (legislaturas ${l1}${l2 ? ` e ${l2}` : ""})` : ""}`,
        inicio, fim, periodos, estimado: false, participacao: m.DescricaoParticipacao, uf: m.UfParlamentar,
        atual: abertos.length > 0 && inicio <= hoje && hoje <= (fim || hoje),
      };
    })
    .filter((m) => m.inicio)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

// ---------- Estimativa a partir de listas por legislatura ----------
export function contarLegislaturas(rows: { id: number; idLegislatura: number }[]): Map<number, Set<number>> {
  const m = new Map<number, Set<number>>();
  for (const r of rows) (m.get(r.id) ?? m.set(r.id, new Set()).get(r.id)!).add(r.idLegislatura);
  return m;
}

/** Tempo (dias) somando legislaturas inteiras em que a pessoa aparece — estimativa para listas. */
export function tempoEstimadoLegislaturas(ids: Set<number>, legislaturas: Legislatura[], hoje = hojeISO()): number {
  return duracaoDias(
    legislaturas.filter((l) => ids.has(l.id) && l.dataInicio <= hoje).map((l) => ({ inicio: l.dataInicio, fim: min(l.dataFim, hoje) })),
  );
}

// ---------- Janelas para consultas ----------
export interface Janela extends Periodo { rotulo: string }

/** Trimestres civis do período (a API de votações aceita no máximo 3 meses). Mais recente primeiro. */
export function trimestres(p: Periodo, hoje = hojeISO()): Janela[] {
  const out: Janela[] = [];
  const fim = min(p.fim, hoje);
  let y = Number(fim.slice(0, 4));
  let q = Math.floor((Number(fim.slice(5, 7)) - 1) / 3);
  for (;;) {
    const ini = `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`;
    const endMonth = q * 3 + 3;
    const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
    const end = `${y}-${String(endMonth).padStart(2, "0")}-${lastDay}`;
    if (end < p.inicio) break;
    out.push({ inicio: max(ini, p.inicio), fim: min(end, fim), rotulo: `${q + 1}º trim. ${y}` });
    if (--q < 0) { q = 3; y--; }
  }
  return out;
}

export function anosDoPeriodo(p: Periodo, hoje = hojeISO(), minimo = 0): number[] {
  const a0 = Math.max(Number(p.inicio.slice(0, 4)), minimo);
  const a1 = Number(min(p.fim, hoje).slice(0, 4));
  const out: number[] = [];
  for (let a = a1; a >= a0; a--) out.push(a);
  return out;
}
