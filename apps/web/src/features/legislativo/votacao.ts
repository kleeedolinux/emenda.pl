// Agregações de votações nominais (Câmara e Senado). Puro.
import { semAcento } from "@emenda/contracts";
import type { Seat } from "@/ui";
import { partyColor } from "@/lib/colors";

export interface ParlamentarVoto { id: number; nome: string; siglaPartido: string; siglaUf: string; urlFoto: string }
export interface VotoCamara { tipoVoto: string; dataRegistroVoto: string; deputado_: ParlamentarVoto }
export interface Orientacao { orientacaoVoto: string; codTipoLideranca: string; siglaPartidoBloco: string; codPartidoBloco: number | null }

export type VotoCat = "sim" | "nao" | "abstencao" | "obstrucao" | "outro";
export const CATS: VotoCat[] = ["sim", "nao", "abstencao", "obstrucao", "outro"];
export const VOTO_LABEL: Record<VotoCat | "ausente", string> = {
  sim: "Sim", nao: "Não", abstencao: "Abstenção", obstrucao: "Obstrução", outro: "Outros", ausente: "Ausente / sem registro",
};
export const VOTO_COR: Record<VotoCat | "ausente", string> = {
  sim: "#16a34a", nao: "#dc2626", abstencao: "#eab308", obstrucao: "#2563eb", outro: "#a855f7", ausente: "#94a3b8",
};
export const AUSENTE = VOTO_LABEL.ausente;

const k = (s: string) => semAcento(s).toLowerCase().trim();
export const normPartido = (s: string) => semAcento(s).toUpperCase().replace(/[^A-Z0-9]/g, "");

export function categoriaVoto(tipo: string): VotoCat {
  const t = k(tipo);
  if (t === "sim") return "sim";
  if (t === "nao") return "nao";
  if (t.startsWith("absten")) return "abstencao";
  if (t.startsWith("obstru")) return "obstrucao";
  return "outro";
}

export type Placar = Record<VotoCat, number> & { total: number };
export function placar(votos: VotoCamara[]): Placar {
  const p: Placar = { sim: 0, nao: 0, abstencao: 0, obstrucao: 0, outro: 0, total: 0 };
  for (const v of votos) { p[categoriaVoto(v.tipoVoto)]++; p.total++; }
  return p;
}

const GERAIS = new Set(["governo", "maioria", "minoria", "oposicao"]);
/** Orientação por partido (direta "P" tem prioridade; federações "Fdr A-B-C" expandidas) + lideranças gerais. */
export function mapaOrientacoes(os: Orientacao[]) {
  const partidos = new Map<string, string>();
  const gerais: { lideranca: string; orientacao: string }[] = [];
  for (const o of os) {
    const sig = o.siglaPartidoBloco ?? "";
    if (o.codTipoLideranca === "G" || GERAIS.has(k(sig))) { gerais.push({ lideranca: sig, orientacao: o.orientacaoVoto }); continue; }
    if (o.codTipoLideranca === "P") partidos.set(normPartido(sig), o.orientacaoVoto);
  }
  for (const o of os) {
    const m = /^fdr\s+(.+)$/i.exec(o.siglaPartidoBloco ?? "");
    if (!m) continue;
    for (const p of m[1]!.split("-")) if (!partidos.has(normPartido(p))) partidos.set(normPartido(p), o.orientacaoVoto);
  }
  return { partidos, gerais };
}

export interface LinhaGrupo extends Placar {
  grupo: string;
  orientacao: string | null;
  contra: number;
  contraIds: number[];
}

function agrupar(votos: VotoCamara[], chave: (v: VotoCamara) => string, orient?: Map<string, string>): LinhaGrupo[] {
  const m = new Map<string, LinhaGrupo>();
  for (const v of votos) {
    const g = chave(v);
    let r = m.get(g);
    if (!r) {
      const o = orient?.get(normPartido(g)) ?? null;
      r = { grupo: g, sim: 0, nao: 0, abstencao: 0, obstrucao: 0, outro: 0, total: 0, orientacao: o, contra: 0, contraIds: [] };
      m.set(g, r);
    }
    const c = categoriaVoto(v.tipoVoto);
    r[c]++; r.total++;
    if (r.orientacao && c !== "outro") {
      const oc = categoriaVoto(r.orientacao);
      if (oc !== "outro" && oc !== c) { r.contra++; r.contraIds.push(v.deputado_.id); }
    }
  }
  return [...m.values()];
}

const porTotal = (a: LinhaGrupo, b: LinhaGrupo) => b.total - a.total || a.grupo.localeCompare(b.grupo, "pt-BR");

export function porPartido(votos: VotoCamara[], orientacoes: Orientacao[] = []): LinhaGrupo[] {
  const { partidos } = mapaOrientacoes(orientacoes);
  return agrupar(votos, (v) => v.deputado_.siglaPartido || "S/PART", partidos).sort(porTotal);
}

export function porUf(votos: VotoCamara[]): LinhaGrupo[] {
  return agrupar(votos, (v) => v.deputado_.siglaUf || "—").sort(porTotal);
}

/** Assentos do hemiciclo: ordenados por partido (maior primeiro) e voto; ausentes completam até `cadeiras`. */
export function assentosVotacao(votos: VotoCamara[], modo: "voto" | "partido", cadeiras = 513): Seat[] {
  const tam = new Map<string, number>();
  for (const v of votos) tam.set(v.deputado_.siglaPartido, (tam.get(v.deputado_.siglaPartido) ?? 0) + 1);
  const ord = votos.slice().sort((a, b) => {
    const pa = a.deputado_.siglaPartido, pb = b.deputado_.siglaPartido;
    return (tam.get(pb)! - tam.get(pa)!) || pa.localeCompare(pb) ||
      CATS.indexOf(categoriaVoto(a.tipoVoto)) - CATS.indexOf(categoriaVoto(b.tipoVoto)) || a.deputado_.nome.localeCompare(b.deputado_.nome, "pt-BR");
  });
  const seats: Seat[] = ord.map((v) => {
    const c = categoriaVoto(v.tipoVoto);
    const d = v.deputado_;
    const p = d.siglaPartido || "S/PART";
    return {
      key: String(d.id),
      color: modo === "voto" ? VOTO_COR[c] : partyColor(p),
      group: modo === "voto" ? VOTO_LABEL[c] : p,
      label: `${d.nome} (${p}-${d.siglaUf}): ${v.tipoVoto || "—"}`,
    };
  });
  for (let i = seats.length; i < cadeiras; i++) seats.push({ key: `ausente-${i}`, color: VOTO_COR.ausente, group: AUSENTE, label: "Sem voto registrado (ausente, licença ou vaga)" });
  return seats;
}

/** Placar escrito na descrição da Câmara ("Sim: 307; não: 166; abstenção: 5; total: 478"). */
export function placarDaDescricao(desc: string | null | undefined): { sim: number; nao: number; abstencao: number; total: number } | null {
  const t = semAcento(desc ?? "").toLowerCase();
  const n = (re: RegExp) => Number(re.exec(t)?.[1] ?? 0);
  if (!/sim:\s*\d+/.test(t)) return null;
  return { sim: n(/sim:\s*(\d+)/), nao: n(/nao:\s*(\d+)/), abstencao: n(/abstencao:\s*(\d+)/), total: n(/total:\s*(\d+)/) };
}

// ---------- Senado ----------
export interface VotoSenadoRaw {
  codigoParlamentar: number; nomeParlamentar: string; siglaPartidoParlamentar: string; siglaUFParlamentar: string; siglaVotoParlamentar: string;
}
export const fotoSenador = (codigo: string | number) => `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${codigo}.jpg`;

/** Normaliza votos do Senado para a forma da Câmara (reaproveita agregações). */
export function votosSenado(vs: VotoSenadoRaw[]): VotoCamara[] {
  return vs.map((v) => ({
    tipoVoto: v.siglaVotoParlamentar ?? "", dataRegistroVoto: "",
    deputado_: { id: v.codigoParlamentar, nome: v.nomeParlamentar, siglaPartido: v.siglaPartidoParlamentar, siglaUf: v.siglaUFParlamentar, urlFoto: fotoSenador(v.codigoParlamentar) },
  }));
}

export function ladosFotos(votos: VotoCamara[]) {
  const favor: VotoCamara[] = [], contra: VotoCamara[] = [], outros: VotoCamara[] = [];
  for (const v of votos) {
    const c = categoriaVoto(v.tipoVoto);
    (c === "sim" ? favor : c === "nao" ? contra : outros).push(v);
  }
  const byName = (a: VotoCamara, b: VotoCamara) => a.deputado_.nome.localeCompare(b.deputado_.nome, "pt-BR");
  return { favor: favor.sort(byName), contra: contra.sort(byName), outros: outros.sort(byName) };
}
