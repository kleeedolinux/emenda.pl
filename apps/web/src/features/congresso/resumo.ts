// "Resumo de PLs": parágrafo em linguagem simples montado SÓ com campos oficiais da proposição
// (ementa, explicação da ementa, palavras-chave, temas, autores, regime, situação). Nada é inventado.
// `Resumidor` é a interface plugável: outro resumidor (ex.: modelo de linguagem) pode ser adicionado
// depois, desde que devolva `ResumoPL` e preserve `fonte` para rotular a origem do texto. Puro.
import { semAcento } from "@emenda/contracts";

export interface AutorEntrada { nome: string; tipo?: string; partido?: string; uf?: string }
export interface EntradaResumo {
  id: number; siglaTipo: string; numero: number; ano: number; ementa: string;
  explicacao?: string | null; keywords?: string | null; temas?: string[]; autores?: AutorEntrada[];
  regime?: string | null; situacao?: string | null; orgao?: string | null; dataApresentacao?: string | null;
}

export type IconeTema =
  | "saude" | "educacao" | "seguranca" | "economia" | "trabalho" | "ambiente" | "cidades" | "transporte" | "social"
  | "direitos" | "campo" | "cultura" | "tecnologia" | "politica" | "outros";

export interface ResumoPL {
  id: number; titulo: string; tipo: string; tema: string; icone: IconeTema; texto: string; palavras: string[]; href: string;
  /** origem do texto: "modelo" = montado por regras a partir dos campos oficiais */
  fonte: string;
}

export interface Resumidor { id: string; resumir(e: EntradaResumo): ResumoPL | Promise<ResumoPL> }

const TIPOS: Record<string, [string, "o" | "a"]> = {
  PL: ["Projeto de lei", "o"], PLP: ["Projeto de lei complementar", "o"], PEC: ["Proposta de emenda à Constituição", "a"],
  MPV: ["Medida provisória", "a"], PDL: ["Projeto de decreto legislativo", "o"], PLV: ["Projeto de lei de conversão", "o"],
  PLN: ["Projeto de lei do Congresso", "o"], PRC: ["Projeto de resolução", "o"],
};

// Tema canônico <- temas oficiais da Câmara e palavras do texto (ordem importa: o primeiro que casar vence).
const REGRAS: Array<[string, IconeTema, RegExp]> = [
  ["Saúde", "saude", /saude|sus\b|medic|hospital|vacina|doenca|sanitar/],
  ["Educação", "educacao", /educa|escola|ensino|universidad|estudant|professor/],
  ["Segurança pública", "seguranca", /seguranca|penal|crime|policia|prisional|arma|violencia(?! contra a mulher)/],
  ["Mulheres e direitos", "direitos", /mulher|direitos humanos|igualdade|racial|deficiencia|indigena|minorias|crianca|idoso/],
  ["Impostos e economia", "economia", /imposto|tribut|fiscal|financ|economi|orcament|alíquota|aliquota|credito|banco/],
  ["Trabalho e previdência", "trabalho", /trabalh|emprego|previd|aposentad|salari/],
  ["Meio ambiente", "ambiente", /ambient|clima|florest|animal|animais|agua|energia/],
  ["Cidades e moradia", "cidades", /urban|cidade|moradia|habitac|saneamento/],
  ["Transporte", "transporte", /transporte|transito|rodovi|aviacao|ferrovi/],
  ["Assistência social", "social", /assistencia social|famil|pobreza|fome|beneficio/],
  ["Campo e agricultura", "campo", /agricult|agro|rural|pecuar|pesca/],
  ["Cultura, esporte e turismo", "cultura", /cultur|esporte|turismo|arte|patrimonio/],
  ["Tecnologia e comunicação", "tecnologia", /tecnolog|internet|digital|comunicac|dados pessoais|ciencia/],
  ["Política e Estado", "politica", /eleit|partid|administracao publica|servidor|legislativo|estrutura fundiaria|politica/],
];

const k = (s: string) => semAcento(s).toLowerCase();

export function temaDe(temas: readonly string[] = [], keywords = "", ementa = ""): { tema: string; icone: IconeTema } {
  for (const fonte of [temas.join(" | "), `${keywords} ${ementa}`]) {
    const t = k(fonte);
    if (!t.trim()) continue;
    const r = REGRAS.find(([, , re]) => re.test(t));
    if (r) return { tema: r[0], icone: r[1] };
  }
  return { tema: "Outros", icone: "outros" };
}

const data = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null);
const frase = (s: string) => { const t = s.replace(/\s+/g, " ").trim(); return !t ? "" : /[.!?]$/.test(t) ? t : `${t}.`; };
const minusc = (s: string) => s.toLowerCase();

function autoria(as: readonly AutorEntrada[], genero: "o" | "a"): string {
  const ap = genero === "a" ? "apresentada" : "apresentado";
  if (!as.length) return ap;
  const a = as[0]!;
  if (/executivo/i.test(`${a.tipo ?? ""} ${a.nome}`)) return `${ap} pelo Poder Executivo`;
  const sigla = a.partido ? ` (${a.partido}${a.uf ? `-${a.uf}` : ""})` : "";
  const mais = as.length > 1 ? ` e mais ${as.length - 1} ${as.length === 2 ? "autor" : "autores"}` : "";
  return `${ap} por ${a.nome}${sigla}${mais}`;
}

/** Resumo determinístico (template) a partir dos campos oficiais. */
export function resumir(e: EntradaResumo): ResumoPL {
  const [tipo, g] = TIPOS[e.siglaTipo] ?? [e.siglaTipo, "o"];
  const quando = data(e.dataApresentacao);
  const partes = [`${tipo} ${autoria(e.autores ?? [], g)}${quando ? ` em ${quando}` : ""}.`, frase(e.ementa)];
  if (e.explicacao?.trim()) partes.push(`Em resumo, segundo a Câmara: ${frase(e.explicacao)}`);
  const regime = e.regime?.replace(/\s*\(.*\)\s*$/, "").trim().replace(/^[^\p{L}]*$/u, "");
  const sit = [regime ? `Tramita em regime ${regime.toLowerCase()}.` : "", e.situacao?.trim() ? `Situação: ${minusc(e.situacao.trim())}${e.orgao ? ` (${e.orgao})` : ""}.` : ""]
    .filter(Boolean).join(" ");
  if (sit) partes.push(sit);
  const { tema, icone } = temaDe(e.temas, e.keywords ?? "", e.ementa);
  return {
    id: e.id, titulo: `${e.siglaTipo} ${e.numero}/${e.ano}`, tipo, tema, icone, texto: partes.join(" "),
    palavras: (e.keywords ?? "").split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 6),
    href: `/proposicao/${e.id}`, fonte: "modelo",
  };
}

export const resumidorModelo: Resumidor = { id: "modelo", resumir };

/** Grupos por tema (maior primeiro; empate: nome), itens na ordem recebida. */
export function agruparPorTema(rs: readonly ResumoPL[]) {
  const m = new Map<string, { tema: string; icone: IconeTema; itens: ResumoPL[] }>();
  for (const r of rs) (m.get(r.tema) ?? m.set(r.tema, { tema: r.tema, icone: r.icone, itens: [] }).get(r.tema)!).itens.push(r);
  return [...m.values()].sort((a, b) => b.itens.length - a.itens.length || a.tema.localeCompare(b.tema, "pt-BR"));
}
