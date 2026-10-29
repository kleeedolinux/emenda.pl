// Enriquecimento viral (puro): dados da página -> rostos de quem mandou, número grande, gancho e mensagem.
// Fotos same-origin via /og-img (sem redirect: o canvas não fica "tainted").
// Linguagem: emenda = "dinheiro mandado por políticos"; Pix = "sem dizer para quê"; RP9 = "orçamento secreto".
import { dataPath, formatBRL, UFS } from "@emenda/contracts";
import type { ShareData } from "./links";

export interface Rosto { nome: string; detalhe?: string; foto?: string }

/** Igual a `chaveNome` do Worker: maiúsculas, sem acento, só letras. */
export function chaveNome(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]+/g, " ").trim();
}

export const fotoPorNome = (nome: string) => `/og-img/nome/${chaveNome(nome).replace(/ /g, "-")}`;

const NAO_PESSOA = ["BANCADA", "COM ", "COMISSAO", "RELATOR", "LIDERANCA", "MESA ", "SEM AUTOR", "PRESIDENCIA"];
export const pessoa = (nome: string) => { const c = chaveNome(nome); return c !== "" && !NAO_PESSOA.some((p) => c.startsWith(p)); };

const PREP: Record<string, string> = {
  AC: "no", AP: "no", AM: "no", BA: "na", CE: "no", DF: "no", ES: "no", MA: "no", PA: "no", PB: "na", PR: "no",
  PI: "no", RJ: "no", RN: "no", RS: "no", TO: "no",
};
/** "na Bahia", "em São Paulo", "no Rio de Janeiro". */
export const naUf = (uf: string) => `${PREP[uf] ?? "em"} ${UFS[uf as keyof typeof UFS] ?? uf}`;

/** JSON que enriquece a arte; null quando não há. */
export function fonteDe(d: ShareData): string | null {
  const id = d.ogId ?? "";
  if (d.kind === "municipio" && /^\d{7}$/.test(id)) return dataPath.municipio(id);
  if (d.kind === "uf" && /^[A-Za-z]{2}$/.test(id)) return dataPath.uf(id);
  if (d.url === "/pix") return dataPath.pix();
  return null;
}

/** Foto grande (same-origin) para a arte. */
export function retratoDe(d: ShareData): string | undefined {
  const id = d.ogId ?? "";
  switch (d.kind) {
    case "deputado": return /^\d+$/.test(id) ? `/og-img/deputado/${id}` : undefined;
    case "senador": return /^\d+$/.test(id) ? `/og-img/senador/${id}` : undefined;
    case "voto": { const dep = id.split("/")[1]; return dep && /^\d+$/.test(dep) ? `/og-img/deputado/${dep}` : undefined; }
    case "autor": return pessoa(d.title) ? fotoPorNome(d.title) : undefined;
    default: return undefined;
  }
}

const GANCHO: Partial<Record<ShareData["kind"], string>> = {
  deputado: "Para onde foi esse dinheiro?", senador: "Para onde foi esse dinheiro?", autor: "Para onde foi esse dinheiro?",
  voto: "Veja como votou cada um", votacao: "Veja como votou cada deputado", partido: "Quem mandou mais?",
};

/** Retrato e gancho padrão, sem buscar nada. */
export function basico(d: ShareData): ShareData {
  return { ...d, retrato: d.retrato ?? retratoDe(d), gancho: d.gancho ?? GANCHO[d.kind] };
}

type J = Record<string, unknown>;
const obj = (x: unknown): J | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as J) : null);
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const arr = (x: unknown): J[] => (Array.isArray(x) ? x.map(obj).filter((v): v is J => v !== null) : []);
const chegou = (t: J | null) => (t ? num(t.pago) + num(t.rapPago) : 0);

const titulo = (s: string) => (/[a-z]/.test(s) ? s : s.toLowerCase().split(/\s+/).map((w, i) =>
  i > 0 && ["de", "da", "do", "das", "dos", "e"].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" "));

function rostos(autores: J[]): Rosto[] {
  return autores
    .filter((a) => typeof a.nome === "string" && pessoa(String(a.chave ?? a.nome)))
    .sort((a, b) => num(b.pago) - num(a.pago))
    .slice(0, 3)
    .map((a) => ({ nome: titulo(String(a.nome)), detalhe: num(a.pago) > 0 ? formatBRL(num(a.pago), true) : undefined, foto: fotoPorNome(String(a.chave ?? a.nome)) }));
}

function alerta(j: J, total: number): string | null {
  const tipo = (t: string) => arr(j.porTipo).filter((x) => x.tipo === t).reduce((s, x) => s + chegou(x), 0);
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  const p = pct(tipo("pix"));
  if (p >= 1) return `${p}% sem dizer para quê`;
  const r = pct(tipo("relator"));
  return r >= 1 ? `${r}% pelo orçamento secreto` : null;
}

const politicos = (k: number) => (k === 1 ? "1 político" : `${k} políticos`);

/** Junta o JSON da página aos dados de compartilhamento. Nunca lança. Com dados, a mensagem viral substitui o texto da página. */
export function enriquecer(d: ShareData, json: unknown): ShareData {
  const j = obj(json);
  if (!j) return d;
  const total = chegou(obj(j.totais));
  const autores = arr(j.autores);
  const out: ShareData = { ...d, rostos: rostos(autores) };
  const n = autores.filter((a) => pessoa(String(a.chave ?? a.nome ?? ""))).length;
  const al = alerta(j, total);
  const v = formatBRL(total, true);
  let lugar: string | null = null;
  if (d.kind === "municipio" && typeof j.nome === "string") lugar = `em ${j.nome}${typeof j.uf === "string" ? ` (${j.uf})` : ""}`;
  if (d.kind === "uf" && typeof j.uf === "string") lugar = naUf(j.uf);
  if (lugar && total > 0) {
    out.metric = { value: total, format: "brl", label: `chegaram ${lugar}` };
    out.gancho = `${al ? `${al}. ` : ""}Quem mandou?`;
    out.text = `💸 ${v} chegaram ${lugar}${n ? `, mandados por ${politicos(n)}` : ""}. ${out.gancho} 👇`;
  } else if (d.url === "/pix" && total > 0) {
    out.metric = { value: total, format: "brl", label: "mandados sem dizer para quê" };
    out.gancho = "Direto no caixa das prefeituras. Sua cidade recebeu?";
    out.text = `⚡ ${v} mandados por políticos direto para prefeituras, sem dizer para quê. Sua cidade recebeu? 👇`;
  }
  return out;
}
