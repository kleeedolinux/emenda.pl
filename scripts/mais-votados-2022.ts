// Lê o CSV do TSE (stdin, ';', aspas) e soma votos nominais por candidato eleito a Deputado Federal / Senador (1º turno 2022).
const dec = new TextDecoder(); let buf = ""; let head: string[] | null = null;
const acc = new Map<string, { nome: string; partido: string; uf: string; cargo: string; situacao: string; votos: number }>();
const col = (r: string[], k: string) => r[head!.indexOf(k)]?.replace(/^"|"$/g, "") ?? "";
function linha(l: string) {
  const r = l.split(";");
  if (!head) { head = r.map((s) => s.replace(/^"|"$/g, "")); return; }
  const cargo = col(r, "DS_CARGO").toUpperCase();
  if (cargo !== "DEPUTADO FEDERAL" && cargo !== "SENADOR") return;
  const sit = col(r, "DS_SIT_TOT_TURNO").toUpperCase();
  if (!sit.startsWith("ELEITO")) return;
  const k = col(r, "SQ_CANDIDATO");
  const a = acc.get(k) ?? { nome: col(r, "NM_URNA_CANDIDATO"), partido: col(r, "SG_PARTIDO"), uf: col(r, "SG_UF"), cargo: cargo === "SENADOR" ? "senador" : "deputado", situacao: sit, votos: 0 };
  a.votos += Number(col(r, "QT_VOTOS_NOMINAIS") || col(r, "QT_VOTOS_NOMINAIS_VALIDOS") || 0); acc.set(k, a);
}
for await (const chunk of Bun.stdin.stream()) {
  buf += dec.decode(chunk, { stream: true });
  let i; while ((i = buf.indexOf("\n")) >= 0) { linha(buf.slice(0, i).replace(/\r$/, "")); buf = buf.slice(i + 1); }
}
if (buf) linha(buf);
const todos = [...acc.entries()].map(([sq, v]) => ({ sq, ...v })).sort((a, b) => b.votos - a.votos);
console.log(JSON.stringify({ fonte: "https://dadosabertos.tse.jus.br/dataset/resultados-2022", eleicao: 2022, deputados: todos.filter((c) => c.cargo === "deputado"), senadores: todos.filter((c) => c.cargo === "senador") }));
