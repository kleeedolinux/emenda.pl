// "Audite seu candidato": indicadores factuais e regras transparentes. Puro.
// Nada aqui atribui nota à pessoa: cada regra compara um número público com um limite explícito.
import { semAcento, type CasaGastos, type GastosRanking } from "@emenda/contracts";
import { categoriaVoto } from "@/features/legislativo/votacao";
import { contraOrientacao } from "@/features/legislativo/painelVotos";

// ---------- produção legislativa ----------
export type Desfecho = "lei" | "avancou" | "arquivada" | "tramitando";
export const DESFECHO_LABEL: Record<Desfecho, string> = {
  lei: "Virou lei ou norma",
  avancou: "Aprovada numa etapa (enviada à outra Casa, à sanção ou vetada)",
  arquivada: "Arquivada, retirada, rejeitada ou prejudicada",
  tramitando: "Ainda em discussão",
};
/** Tipos que mudam leis (os demais são requerimentos, indicações etc.). */
export const TIPOS_CAMARA = ["PL", "PLP", "PEC", "PDL"] as const;
export const TIPOS_SENADO = new Set(["PL", "PLS", "PLP", "PEC", "PDL", "PDS", "PRS"]);

const n = (s: string | null | undefined) => semAcento(s ?? "").toLowerCase();

/** `statusProposicao.descricaoSituacao` da Câmara -> desfecho. */
export function classificarSituacao(desc: string | null | undefined): Desfecho {
  const t = n(desc);
  if (/transformad[oa] em norma/.test(t)) return "lei";
  if (/aguardando (sancao|promulgacao|remessa a sancao|autografos|envio ao executivo|envio ao senado|apreciacao pelo senado|apreciacao do veto)|enviada ao (senado|congresso)|vetad/.test(t)) return "avancou";
  if (/arquivad|enviada ao arquivo|remessa ao arquivo|retirad|devolvid|perdeu a eficacia|prejudicad|recusad/.test(t)) return "arquivada";
  return "tramitando";
}

/** Item de /processo do Senado -> desfecho. */
export function classificarProcessoSenado(p: { normaGerada?: string | null; tramitando?: string | null; situacaoAtual?: string | null }): Desfecho {
  if (p.normaGerada) return "lei";
  const t = n(p.situacaoAtual);
  if (/norma juridica|sancionad|promulgad/.test(t)) return "lei";
  if (/aprovad|remetid|enviad|aguardando sancao|vetad/.test(t)) return "avancou";
  if (p.tramitando === "Sim") return "tramitando";
  return "arquivada";
}

export interface Producao { total: number; porTipo: Array<{ tipo: string; n: number }>; lei: number; avancou: number; arquivada: number; tramitando: number }
export function producao(xs: ReadonlyArray<{ tipo: string; desfecho: Desfecho }>): Producao {
  const r: Producao = { total: 0, porTipo: [], lei: 0, avancou: 0, arquivada: 0, tramitando: 0 };
  const m = new Map<string, number>();
  for (const x of xs) { r.total++; r[x.desfecho]++; m.set(x.tipo, (m.get(x.tipo) ?? 0) + 1); }
  r.porTipo = [...m].map(([tipo, n_]) => ({ tipo, n: n_ })).sort((a, b) => b.n - a.n || a.tipo.localeCompare(b.tipo));
  return r;
}

// ---------- presença e orientação ----------
export interface Presenca { presente: number; total: number; pct: number | null }
/** Câmara: `null` = sem voto registrado numa votação em que estava no exercício do mandato. */
export function presenca(votos: ReadonlyArray<string | null>): Presenca {
  const presente = votos.filter((v) => v != null && v !== "" && v !== "Sem registro").length;
  return { presente, total: votos.length, pct: votos.length ? presente / votos.length : null };
}

const PRESENTE_SENADO = new Set(["sim", "nao", "abstencao", "obstrucao", "p-nrv", "votou", "presidente"]);
const NAO_COMPARECEU = new Set(["ncom"]);
export interface PresencaSenado extends Presenca { justificada: number; semJustificativa: number }
/** Senado: siglas oficiais. Licenças (LS, LP...), missão (MIS) e AP contam como ausência justificada; NCom, sem justificativa. */
export function presencaSenado(siglas: ReadonlyArray<string>): PresencaSenado {
  let presente = 0, justificada = 0, semJustificativa = 0;
  for (const s of siglas) {
    const k = n(s).trim();
    if (PRESENTE_SENADO.has(k) || k.startsWith("presidente")) presente++;
    else if (NAO_COMPARECEU.has(k)) semJustificativa++;
    else justificada++;
  }
  const total = siglas.length;
  return { presente, justificada, semJustificativa, total, pct: total ? presente / total : null };
}

export interface Alinhamento { seguiu: number; contra: number; total: number; pctContra: number | null }
/** Conta só votações com orientação Sim/Não/Abstenção/Obstrução e voto nessas categorias ("Liberado" e "Art. 17" ficam fora). */
export function alinhamento(xs: ReadonlyArray<{ voto: string; orientacao: string | null }>): Alinhamento {
  let seguiu = 0, contra = 0;
  for (const x of xs) {
    if (!x.orientacao) continue;
    if (categoriaVoto(x.voto) === "outro" || categoriaVoto(x.orientacao) === "outro") continue;
    if (contraOrientacao(x.voto, x.orientacao)) contra++; else seguiu++;
  }
  const total = seguiu + contra;
  return { seguiu, contra, total, pctContra: total ? contra / total : null };
}

// ---------- gastos e emendas ----------
export interface CompGastos { valor: number; media: number; n: number; posicao: number }
/** Cota na legislatura corrente vs. média dos parlamentares em exercício na mesma casa (ranking.json). */
export function comparaGastos(r: Pick<GastosRanking, "parlamentares">, casa: CasaGastos, id: string | number): CompGastos | null {
  const ps = r.parlamentares.filter((p) => p.casa === casa);
  const eu = ps.find((p) => p.id === String(id));
  if (!eu) return null;
  const ativos = ps.filter((p) => p.emExercicio);
  const media = ativos.length ? ativos.reduce((s, p) => s + p.mandato, 0) / ativos.length : 0;
  const lista = eu.emExercicio ? ativos : [...ativos, eu];
  const posicao = lista.filter((p) => p.mandato > eu.mandato).length + 1;
  return { valor: eu.mandato, media, n: lista.length, posicao };
}

export interface IndEmendas { pago: number; pctPix: number; pctForaUf: number | null }
/** Pago (+ restos a pagar pagos), % via Pix e % enviada a outra UF (entre emendas com UF conhecida). */
export function emendasIndicadores(es: ReadonlyArray<{ tipo: string; pago: number; rapPago: number; uf: string | null }>, uf: string): IndEmendas {
  let pago = 0, pix = 0, comUf = 0, fora = 0;
  for (const e of es) {
    const v = e.pago + e.rapPago;
    if (v <= 0) continue;
    pago += v;
    if (e.tipo === "pix") pix += v;
    if (e.uf) { comUf += v; if (e.uf !== uf) fora += v; }
  }
  return { pago, pctPix: pago ? pix / pago : 0, pctForaUf: comUf ? fora / comUf : null };
}

// ---------- pontos de atenção ----------
export const LIMITES = { contraPartido: 0.1, pix: 0.5, presenca: 0.8, foraUf: 0.1 } as const;

export interface Indicadores {
  casa: CasaGastos;
  trocas: number | null;
  presenca: Presenca | null;
  alinhamento: Alinhamento | null;
  emendas: IndEmendas | null;
  gastos: CompGastos | null;
}
export type StatusPonto = "atencao" | "ok" | "sem-dados";
export interface Ponto { id: string; titulo: string; status: StatusPonto; texto: string; formula: string }

const pct = (x: number) => `${Math.round(x * 100)}%`;
const nomeCasa = (c: CasaGastos) => (c === "camara" ? "Câmara" : "Senado");

export function pontosDeAtencao(i: Indicadores): Ponto[] {
  const out: Ponto[] = [];
  const casa = nomeCasa(i.casa);

  const g = i.gastos;
  out.push({
    id: "gastos", titulo: "Gastos do gabinete",
    status: !g || g.valor <= 0 ? "sem-dados" : g.valor > g.media ? "atencao" : "ok",
    texto: !g ? "Sem dados de gastos do gabinete neste mandato."
      : g.valor <= 0 ? "Nenhum gasto do gabinete registrado no mandato atual."
      : g.valor > g.media ? `Gastou ${pct(g.valor / g.media - 1)} acima da média da ${casa} com o gabinete (${g.posicao}º de ${g.n}).`
      : `Gastou ${g.media ? pct(1 - g.valor / g.media) : "0%"} abaixo da média da ${casa} com o gabinete (${g.posicao}º de ${g.n}).`,
    formula: `Oficialmente: cota parlamentar (CEAP). Total na legislatura atual comparado à média de todos os parlamentares em exercício na ${casa}. Atenção se for maior que a média.`,
  });

  const a = i.alinhamento;
  out.push({
    id: "orientacao", titulo: "Votos contra a orientação do próprio partido",
    status: !a || a.pctContra == null ? "sem-dados" : a.pctContra >= LIMITES.contraPartido ? "atencao" : "ok",
    texto: !a || a.pctContra == null
      ? (i.casa === "senado" ? "O Senado não publica a orientação de cada partido por votação em dados abertos." : "Sem orientação própria do partido na amostra (o partido orientou por meio de bloco parlamentar, cujo nome a Câmara publica abreviado, ou liberou a bancada).")
      : `Votou contra a orientação do partido em ${pct(a.pctContra)} das ${a.total} votações analisadas (${a.contra} vezes).`,
    formula: `Votos diferentes da orientação do líder do partido ÷ votações com orientação Sim/Não/Abstenção/Obstrução. “Liberado” não conta. Atenção a partir de ${pct(LIMITES.contraPartido)}.`,
  });

  out.push({
    id: "trocas", titulo: "Troca de partido",
    status: i.trocas == null ? "sem-dados" : i.trocas >= 1 ? "atencao" : "ok",
    texto: i.trocas == null ? "Sem histórico de filiação disponível."
      : i.trocas === 0 ? "Não trocou de partido no período registrado."
      : `Trocou de partido ${i.trocas} ${i.trocas === 1 ? "vez" : "vezes"} no período registrado.`,
    formula: "Mudanças de sigla no histórico oficial (Câmara: /deputados/{id}/historico; Senado: filiações nos mandatos). Atenção a partir de 1 troca.",
  });

  const e = i.emendas;
  out.push({
    id: "pix", titulo: "Dinheiro mandado sem dizer para quê",
    status: !e || e.pago <= 0 ? "sem-dados" : e.pctPix >= LIMITES.pix ? "atencao" : "ok",
    texto: !e || e.pago <= 0 ? "Nenhum dinheiro mandado por este político foi pago, segundo o Portal da Transparência."
      : `${pct(e.pctPix)} do dinheiro que mandou foi sem dizer para quê.`,
    formula: `Oficialmente: emenda Pix (transferência especial). Valor pago via transferência especial ÷ valor pago total (inclui restos a pagar). A Emenda Pix cai direto no caixa do ente, sem convênio prévio. Atenção a partir de ${pct(LIMITES.pix)}.`,
  });

  const p = i.presenca;
  out.push({
    id: "presenca", titulo: "Presença nas votações",
    status: !p || p.pct == null ? "sem-dados" : p.pct < LIMITES.presenca ? "atencao" : "ok",
    texto: !p || p.pct == null ? "Sem votações com voto registrado de cada um na amostra." : `Registrou presença em ${pct(p.pct)} das ${p.total} votações analisadas.`,
    formula: `Votações com voto registrado ÷ votações nominais do plenário no período em exercício. Licenças e missões contam como ausência. Atenção abaixo de ${pct(LIMITES.presenca)}.`,
  });

  out.push({
    id: "fora-uf", titulo: "Dinheiro mandado para outros estados",
    status: !e || e.pctForaUf == null ? "sem-dados" : e.pctForaUf >= LIMITES.foraUf ? "atencao" : "ok",
    texto: !e || e.pctForaUf == null ? "Sem dinheiro pago com estado de destino conhecido."
      : `${pct(e.pctForaUf)} do dinheiro (com estado conhecido) foi para outro estado.`,
    formula: `Valor pago com destino em outra UF ÷ valor pago com UF de destino identificada. Emendas nacionais (sem UF) ficam fora. Atenção a partir de ${pct(LIMITES.foraUf)}.`,
  });
  return out;
}

// ---------- modo comparar ----------
export type CasaParam = "deputado" | "senador";
export interface Alvo { casa: CasaParam; id: string }
export const MAX_COMPARAR = 3;

export function parseComparar(s: string | null | undefined): Alvo[] {
  const out: Alvo[] = [];
  for (const parte of (s ?? "").split(",")) {
    const m = /^(deputado|senador):(\d+)$/.exec(parte.trim());
    if (!m) continue;
    const a = { casa: m[1] as CasaParam, id: m[2]! };
    if (!out.some((x) => x.casa === a.casa && x.id === a.id)) out.push(a);
    if (out.length === MAX_COMPARAR) break;
  }
  return out;
}
export const serializarComparar = (as: readonly Alvo[]) => as.map((a) => `${a.casa}:${a.id}`).join(",");
