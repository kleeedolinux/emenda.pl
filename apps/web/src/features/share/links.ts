// Contrato de compartilhamento: dados da entidade -> mensagens pt-BR -> URLs de rede social.
import { formatBRL } from "@emenda/contracts";
import { graphemeCount, truncate, truncateWeighted, tweetWeight, URL_WEIGHT } from "./text";

export type ShareKind =
  | "proposicao" | "votacao" | "voto" | "emenda" | "municipio" | "uf"
  | "deputado" | "senador" | "autor" | "partido" | "pix" | "pagina";

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
    case "pix":
      return v ? `⚡ Emenda Pix: ${t} — ${v} transferidos direto, sem convênio. Confira:` : `⚡ Emenda Pix: ${t}. Confira para onde foi o dinheiro:`;
    case "emenda":
      return v ? `💸 ${t}: ${v}. Veja quem indicou e quem recebeu:` : `💸 ${t}. Veja quem indicou e quem recebeu:`;
    default:
      return `${t}${v ? ` — ${v}` : ""}. Dados públicos no ${SITE_NAME}:`;
  }
}

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
  proposicao: "proposicao", votacao: "votacao", voto: "votacao", partido: "partido",
};

export function ogImagePath(d: ShareData): string {
  if (d.image) return d.image;
  const k = OG_KINDS[d.kind];
  return k && d.ogId ? `/og/${k}/${encodeURIComponent(d.ogId)}.png` : "/og/default.png";
}

/** Nome de arquivo seguro: "emenda-online-municipio-campinas". */
export function fileSlug(d: ShareData): string {
  const s = d.title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return `emenda-online-${d.kind}${s ? `-${s}` : ""}`;
}

