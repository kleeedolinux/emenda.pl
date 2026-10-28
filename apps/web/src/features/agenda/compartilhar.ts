// Agenda -> dados de compartilhamento (puros). Arte e diálogo vêm de @/features/share.
import { agendaEventoUrl, quandoLabel, type ShareData } from "@/features/share/links";
import { placarDaDescricao } from "@/features/legislativo/votacao";
import { diaSP, type AgendaEvento, type Materia } from "./agenda";
import type { CamaraVotacao } from "./useAgenda";

const dias = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);

/** Contagem regressiva em destaque na arte. */
export function contagem(ev: AgendaEvento, agora = Date.now()): string {
  if (ev.status === "em-andamento") return "AO VIVO AGORA";
  if (ev.status === "cancelada") return "CANCELADA";
  if (ev.status === "encerrada") return "ENCERRADA";
  const d = dias(ev.dia, diaSP(new Date(agora)));
  if (d < 0) return "ENCERRADA";
  if (d === 0) return `HOJE · ${ev.hora}`;
  if (d === 1) return `AMANHÃ · ${ev.hora}`;
  return `EM ${d} DIAS`;
}

export function casaDe(ev: AgendaEvento): string {
  if (ev.ambito === "plenario") return ev.orgaoSigla === "CN" ? "Congresso Nacional" : ev.casa === "camara" ? "Plenário da Câmara" : "Plenário do Senado";
  return ev.orgaoSigla && ev.orgaoSigla !== ev.orgao ? `${ev.orgao} (${ev.orgaoSigla})` : ev.orgao;
}

const itens = (ms: Materia[]) => ms.map((m) => ({ hora: "", sigla: m.sigla, titulo: m.ementa ?? "" }));

export function eventoShare(ev: AgendaEvento, agora = Date.now(), materias: Materia[] = ev.materias): ShareData {
  return {
    kind: "agenda",
    title: ev.titulo,
    subtitle: ev.descricao,
    url: agendaEventoUrl(ev.dia, ev.id),
    ogId: ev.dia,
    quando: quandoLabel(ev.dia, diaSP(new Date(agora))),
    casa: casaDe(ev),
    destaque: contagem(ev, agora),
    items: materias.length ? itens(materias).map((i) => ({ ...i, hora: ev.hora })) : undefined,
  };
}

/** Um item da pauta: "Hoje o Plenário da Câmara vota o PL 2630/2020 (Fake News)". */
export function materiaShare(ev: AgendaEvento, m: Materia, agora = Date.now(), apelido?: string): ShareData {
  return {
    ...eventoShare(ev, agora, [m]),
    title: apelido ? `${m.sigla} (${apelido})` : m.sigla,
    subtitle: m.ementa,
    items: [{ hora: ev.hora, sigla: m.sigla, titulo: m.ementa ?? "" }],
  };
}

export function resultadoShare(v: Pick<CamaraVotacao, "id" | "descricao" | "aprovacao" | "proposicaoObjeto">): ShareData {
  const p = placarDaDescricao(v.descricao);
  const resultado = v.aprovacao === 1 ? "aprovada" : v.aprovacao === 0 ? "rejeitada" : undefined;
  const desc = (v.descricao ?? "").split(/\s*Sim:/i)[0]!.trim();
  const base: ShareData = {
    kind: "resultado",
    title: v.proposicaoObjeto?.trim() || desc.replace(/\.$/, "") || `Votação ${v.id}`,
    subtitle: desc,
    url: `/votacao/${v.id}`,
    ogId: v.id,
    resultado,
    votes: p ? { sim: p.sim, nao: p.nao, outros: Math.max(0, p.total - p.sim - p.nao) } : undefined,
  };
  // A descrição já diz o resultado ("Rejeitado o Requerimento."): evita "… rejeitada".
  if (!v.proposicaoObjeto && /^(aprovad|rejeitad)/i.test(desc) && !p) {
    base.text = `${resultado === "rejeitada" ? "❌" : "✅"} Resultado: ${desc.replace(/\.$/, "")}. Veja como cada deputado votou:`;
  }
  return base;
}

export function semanaShare(votarao: AgendaEvento[], _inicio: string): ShareData {
  const n = votarao.filter((e) => e.ambito === "plenario" && e.deliberativa).length;
  return {
    kind: "agenda",
    title: "Agenda do Congresso",
    url: "/agenda",
    ogId: "hoje",
    quando: "Nesta semana",
    casa: "Congresso",
    destaque: `${n} ${n === 1 ? "SESSÃO" : "SESSÕES"} COM VOTAÇÃO`,
    text: `🗳️ Agenda do Congresso nesta semana: ${n} ${n === 1 ? "sessão" : "sessões"} com votação no Plenário. Veja o que será votado:`,
    items: votarao.slice(0, 8).map((e) => ({ hora: e.hora, sigla: `${e.casa === "camara" ? "Câmara" : "Senado"} · ${e.dia.slice(8)}/${e.dia.slice(5, 7)}`, titulo: e.titulo })),
  };
}
