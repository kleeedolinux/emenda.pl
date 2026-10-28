// Contrato de compartilhamento: dados da entidade -> mensagens pt-BR -> URLs de rede social.
import { formatBRL } from "@emenda/contracts";
import { graphemeCount, truncate, truncateWeighted, tweetWeight, URL_WEIGHT } from "./text";

export type ShareKind =
  | "proposicao" | "votacao" | "voto" | "emenda" | "municipio" | "uf"
  | "deputado" | "senador" | "autor" | "partido" | "pix" | "pagina"
  | "agenda" | "resultado";

export interface ShareItem { hora: string; sigla: string; titulo: string }

export interface ShareMetric {
  /** centavos quando `format` = "brl" */
  value: number;
  format: "brl" | "int";
  label: string;
}

export interface ShareData {
  kind: ShareKind;
  /** Nome da entidade (deputado, município, proposição...). */
  title: string;
  /** Caminho (/uf/SP) ou URL absoluta. */
  url: string;
  /** Mensagem pronta; substitui o modelo. */
  text?: string;
  subtitle?: string;
  /** Imagem 1200x630 explícita; senão /og/<kind>/<ogId>.png. */
  image?: string;
  ogId?: string;
  metric?: ShareMetric;
  /** Até 5 barras para imagem/reel (valores na mesma unidade da métrica). */
  bars?: Array<{ label: string; value: number }>;
  votes?: { sim: number; nao: number; outros: number };
  /** kind "voto": quem votou e como. */
  pessoa?: string;
  voto?: string;
  /** agenda: "Hoje", "Amanhã", "Na sexta-feira (30/10)". */
  quando?: string;
  /** agenda: "Plenário da Câmara". */
  casa?: string;
  /** agenda: itens em pauta (lista na arte). */
  items?: ShareItem[];
  /** agenda: contagem regressiva em destaque ("HOJE · 13:55", "EM 2 DIAS"). */
  destaque?: string;
  /** resultado de votação. */
  resultado?: "aprovada" | "rejeitada";
}

export const SITE_NAME = "emenda.online";
export const HASHTAG = "emendaonline";
export const DEFAULT_ORIGIN = "https://emenda.online";
const X_MAX = 280;
const BLUESKY_MAX = 300;

export const siteOrigin = () => (typeof location !== "undefined" && /^https?:$/.test(location.protocol) ? location.origin : DEFAULT_ORIGIN);

export function absoluteUrl(path: string, origin = siteOrigin()): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${origin}/${path.replace(/^\/+/, "")}`;
}

export function formatMetric(m: ShareMetric): string {
  return m.format === "brl" ? formatBRL(m.value, true) : new Intl.NumberFormat("pt-BR").format(m.value);
}

const n = (x: number) => new Intl.NumberFormat("pt-BR").format(x);

/** Mensagem curta em pt-BR, sem URL. */
export function buildMessage(d: ShareData): string {
  if (d.text) return d.text;
  const v = d.metric ? formatMetric(d.metric) : "";
  const t = truncate(d.title, 120);
  switch (d.kind) {
    case "votacao":
      return d.votes
        ? `🗳️ ${t}: ${n(d.votes.sim)} Sim × ${n(d.votes.nao)} Não. Veja como cada deputado votou:`
        : `🗳️ ${t}. Veja como cada deputado votou:`;
    case "voto":
      return `🗳️ ${d.pessoa ?? "Este deputado"} votou ${d.voto ?? "—"} em “${t}”.${d.votes ? ` Placar: ${n(d.votes.sim)} Sim × ${n(d.votes.nao)} Não.` : ""} Veja como o seu votou:`;
    case "proposicao":
      return `📜 ${t}${d.subtitle ? ` — ${truncate(d.subtitle, 140)}` : ""}. Acompanhe a tramitação e as votações:`;
    case "municipio":
      return v ? `💰 ${t} recebeu ${v} em emendas parlamentares. Veja quem mandou e para onde foi:` : `💰 Emendas parlamentares para ${t}. Veja quem mandou e para onde foi:`;
    case "uf":
      return v ? `💰 ${t}: ${v} em emendas parlamentares pagas. Veja cada município:` : `💰 Emendas parlamentares em ${t}. Veja cada município:`;
    case "deputado": case "senador": case "autor":
      return v ? `🔎 ${t} indicou ${v} em emendas ${d.metric!.label || "pagas"}. Para onde foi o dinheiro?` : `🔎 ${t}: emendas, votos e gastos públicos. Confira:`;
    case "partido":
      return v ? `🏛️ ${t}: ${v} em emendas pagas pelos parlamentares do partido. Confira:` : `🏛️ ${t}: bancada, votos e emendas. Confira:`;
    case "agenda": {
      const quem = `${d.quando ?? "Nesta semana"} o ${d.casa ?? "Congresso"}`;
      const its = d.items ?? [];
      if (its.length > 1) {
        const head = its.slice(0, 3).map((i) => i.sigla).join(", ");
        return `🗳️ ${quem} vota: ${head}${its.length > 3 ? ` e mais ${its.length - 3}` : ""}. Acompanhe:`;
      }
      const alvo = its[0]?.sigla && !d.title.startsWith(its[0].sigla) ? `${its[0].sigla} — ${t}` : t;
      return `🗳️ ${quem} vota ${artigo(alvo)}${alvo}. Acompanhe:`;
    }
    case "resultado": {
      const placar = d.votes ? ` ${d.votes.sim}×${d.votes.nao}` : "";
      const st = d.resultado ?? "votada";
      return `${d.resultado === "rejeitada" ? "❌" : "✅"} Resultado: ${t} ${st}${placar}. Veja como cada deputado votou:`;
    }
    case "pix":
      return v ? `⚡ Emenda Pix: ${t} — ${v} transferidos direto, sem convênio. Confira:` : `⚡ Emenda Pix: ${t}. Confira para onde foi o dinheiro:`;
    case "emenda":
      return v ? `💸 ${t}: ${v}. Veja quem indicou e quem recebeu:` : `💸 ${t}. Veja quem indicou e quem recebeu:`;
    default:
      return `${t}${v ? ` — ${v}` : ""}. Dados públicos no ${SITE_NAME}:`;
  }
}

/** Artigo para siglas de proposição: "a PEC", "o PL"; vazio se não for sigla. */
function artigo(t: string): string {
  const sig = /^([A-Z]{2,5})\s+\d/.exec(t)?.[1];
  if (!sig) return "";
  return ["PEC", "MPV", "MP", "EMC"].includes(sig) ? "a " : "o ";
}

const SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const diaUTC = (d: string) => new Date(`${d}T12:00:00Z`);

/** "Hoje", "Amanhã", "Ontem" ou "Na sexta-feira (30/10)". Datas YYYY-MM-DD (Brasília). */
export function quandoLabel(dia: string, hoje: string): string {
  const diff = Math.round((diaUTC(dia).getTime() - diaUTC(hoje).getTime()) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  const wd = diaUTC(dia).getUTCDay();
  const dm = `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  return `${wd === 0 || wd === 6 ? "No" : "Na"} ${SEMANA[wd]} (${dm})`;
}

export const agendaEventoUrl = (dia: string, evento: string) => `/agenda?${new URLSearchParams({ dia, evento })}`;

const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

export function xIntent(d: ShareData, origin?: string): string {
  const url = absoluteUrl(d.url, origin);
  const room = X_MAX - 1 - URL_WEIGHT - ` #${HASHTAG}`.length;
  const text = truncateWeighted(buildMessage(d), room, tweetWeight);
  return `https://x.com/intent/post?${q({ text, url, hashtags: HASHTAG })}`;
}

export type ShareTargetId = "whatsapp" | "x" | "telegram" | "facebook" | "linkedin" | "bluesky";
export interface ShareTarget { id: ShareTargetId; label: string; href: string; color: string }

export function shareTargets(d: ShareData, origin?: string): ShareTarget[] {
  const url = absoluteUrl(d.url, origin);
  const msg = buildMessage(d);
  const bsky = `${truncate(msg, BLUESKY_MAX - graphemeCount(url) - 2)}\n\n${url}`;
  return [
    { id: "whatsapp", label: "WhatsApp", color: "#25D366", href: `https://wa.me/?${q({ text: `${msg}\n\n${url}` })}` },
    { id: "x", label: "X", color: "#000000", href: xIntent(d, origin) },
    { id: "telegram", label: "Telegram", color: "#229ED9", href: `https://t.me/share/url?${q({ url, text: msg })}` },
    { id: "facebook", label: "Facebook", color: "#1877F2", href: `https://www.facebook.com/sharer/sharer.php?${q({ u: url })}` },
    { id: "linkedin", label: "LinkedIn", color: "#0A66C2", href: `https://www.linkedin.com/sharing/share-offsite/?${q({ url })}` },
    { id: "bluesky", label: "Bluesky", color: "#1185FE", href: `https://bsky.app/intent/compose?${q({ text: bsky })}` },
  ];
}

/** Tipos com imagem OG no servidor (crates/og). */
const OG_KINDS: Partial<Record<ShareKind, string>> = {
  deputado: "deputado", senador: "senador", municipio: "municipio", uf: "uf", autor: "autor",
  proposicao: "proposicao", votacao: "votacao", voto: "voto", partido: "partido",
  agenda: "agenda", resultado: "votacao",
};

export function ogImagePath(d: ShareData): string {
  if (d.image) return d.image;
  const k = OG_KINDS[d.kind];
  const segs = d.ogId?.split("/") ?? [];
  const ok = segs.length > 0 && segs.every((x) => /^[A-Za-z0-9-]+$/.test(x));
  return k && ok ? `/og/${k}/${segs.join("/")}.png` : "/og/default.png";
}

/** Nome de arquivo seguro: "emenda-online-municipio-campinas". */
export function fileSlug(d: ShareData): string {
  const s = d.title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return `emenda-online-${d.kind}${s ? `-${s}` : ""}`;
}

