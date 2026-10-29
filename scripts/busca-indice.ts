#!/usr/bin/env bun
// Gera v1/busca.json (índice da busca universal) a partir do JSON v1 já gerado + listas da Câmara/Senado.
// Uso: bun scripts/busca-indice.ts [--out data/out]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { montarIndiceBusca, type AutorResumo, type Municipio, type Uf } from "../packages/contracts/src/index";

const args = process.argv.slice(2);
const out = args[args.indexOf("--out") + 1] && args.includes("--out") ? args[args.indexOf("--out") + 1]! : "data/out";
const raiz = join(import.meta.dir, "..");
const v1 = join(out.startsWith("/") ? out : join(raiz, out), "v1");
const ler = <T,>(p: string) => JSON.parse(readFileSync(p, "utf8")) as T;

async function json<T>(url: string): Promise<T> {
  for (let t = 0; ; t++) {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (r.ok) return (await r.json()) as T;
    if (t >= 2) throw new Error(`${r.status} ${url}`);
    await Bun.sleep(1500 * (t + 1));
  }
}

async function deputados() {
  const todos: Array<{ id: number; nome: string; siglaPartido: string; siglaUf: string }> = [];
  for (let p = 1; ; p++) {
    const r = await json<{ dados: typeof todos }>(`https://dadosabertos.camara.leg.br/api/v2/deputados?idLegislatura=57&itens=100&pagina=${p}&ordem=ASC&ordenarPor=nome`);
    todos.push(...r.dados);
    if (r.dados.length < 100) return todos;
  }
}

type Ident = { CodigoParlamentar: string; NomeParlamentar: string; NomeCompletoParlamentar?: string; SiglaPartidoParlamentar?: string; UfParlamentar?: string };
async function senadores() {
  const r = await json<{ ListaParlamentarEmExercicio: { Parlamentares: { Parlamentar: Array<{ IdentificacaoParlamentar: Ident }> } } }>("https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json");
  return r.ListaParlamentarEmExercicio.Parlamentares.Parlamentar.map(({ IdentificacaoParlamentar: i }) => ({
    codigo: i.CodigoParlamentar, nome: i.NomeParlamentar, nomeCompleto: i.NomeCompletoParlamentar, partido: i.SiglaPartidoParlamentar ?? "", uf: i.UfParlamentar ?? "",
  }));
}

async function partidos() {
  const r = await json<{ dados: Array<{ sigla: string; nome: string }> }>("https://dadosabertos.camara.leg.br/api/v2/partidos?idLegislatura=57&itens=100&ordem=ASC&ordenarPor=sigla");
  return r.dados;
}

const ufs = readdirSync(join(v1, "uf")).filter((f) => f.endsWith(".json")).map((f) => ler<Uf>(join(v1, "uf", f)));
// Prefeito(a) eleito(a) em 2024 de cada cidade (v1/municipio/<ibge>.json), para achar a cidade pelo nome do prefeito.
const prefeitos = readdirSync(join(v1, "municipio")).filter((f) => f.endsWith(".json")).flatMap((f) => {
  const m = ler<Municipio>(join(v1, "municipio", f));
  return m.prefeito ? [{ ibge: m.ibge, nome: m.prefeito.nome, partido: m.prefeito.partido }] : [];
});
const indice = montarIndiceBusca({
  prefeitos,
  geradoEm: new Date().toISOString(),
  municipios: ler<Array<[number, string, string]>>(join(raiz, "apps/web/public/geo/municipios.json")),
  ufs,
  deputados: await deputados(),
  senadores: await senadores(),
  partidos: await partidos(),
  autores: ler<AutorResumo[]>(join(v1, "autores.json")),
});
writeFileSync(join(v1, "busca.json"), JSON.stringify(indice));
console.log(`ok: ${join(v1, "busca.json")} (${indice.cidades.length} cidades, ${indice.deputados.length} deputados, ${indice.senadores.length} senadores, ${prefeitos.length} prefeitos)`);
