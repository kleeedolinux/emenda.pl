import { afterEach, describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import Home from "./Home";

const brasil = {
  totais: { pago: 194_600_000_000_00 },
  porTipo: [{ tipo: "individual", pago: 100_000_000_000_00 }, { tipo: "pix", pago: 40_000_000_000_00 }, { tipo: "relator", pago: 30_000_000_000_00 }],
  porUf: [{ uf: "BA", nome: "Bahia", pago: 9_000_000_000_00 }],
  fluxo: [],
};
const meta = { anos: [2014, 2026], generatedAt: "2026-10-27T00:00:00Z", fonte: "https://portaldatransparencia.gov.br" };
const rankings = { janelas: [{ janela: "1m", ate: "2026-10", valor: 5_000_000_00, tipos: [{ tipo: "pix", valor: 1_000_000_00 }], autores: [{ codigo: "1", nome: "FULANO DE TAL", valor: 1_000_000_00 }], ufs: [], municipios: [] }] };
const beneficiados = {
  totais: { empresas: 30_000_000_000, entidades: 10_000_000_000, fundos: 5_000_000_000 },
  empresas: [{ documento: "1", nome: "CONSTRUTORA Y LTDA", tipo: "Pessoa Jurídica", valor: 20_000_000_000, uf: "MG", municipio: "BETIM" }],
  entidades: [],
  fundos: [{ documento: "3", nome: "FUNDO ESTADUAL DE SAUDE", tipo: "Pessoa Jurídica", valor: 5_000_000_000, uf: "SP", municipio: "SAO PAULO" }],
};
const fornecedores = { grupos: [
  { grupo: "passagens", valor: 300_000_000_00, fornecedores: [{ cnpjCpf: "1", nome: "Cia Aérea - TAM", valor: 165_000_000_00, n: 9, parlamentares: 1037, contratantes: [] }] },
  { grupo: "divulgacao", valor: 100_000_000_00, fornecedores: [{ cnpjCpf: "2", nome: "GRAFICA X LTDA", valor: 5_000_000_00, n: 3, parlamentares: 12, contratantes: [] }] },
] };
const dados: Record<string, unknown> = { "fornecedores.json": fornecedores, "brasil.json": brasil, "meta.json": meta, "rankings.json": rankings, "autores.json": [], "beneficiados.json": beneficiados };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; (window as { fetch: typeof fetch }).fetch = realFetch; localStorage.clear(); });

function montar() {
  globalThis.fetch = (async (u: string) => {
    const k = Object.keys(dados).find((x) => String(u).endsWith(`/${x}`));
    return k ? Response.json(dados[k]) : new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  (window as { fetch: typeof fetch }).fetch = globalThis.fetch;
  const r = createMemoryRouter([{ path: "/", element: <Home /> }], { initialEntries: ["/"] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={r} /></QueryClientProvider>);
}

describe("Home", () => {
  test("ação principal: busca da cidade no hero", async () => {
    montar();
    const hero = screen.getByRole("region", { name: /já mandaram/ });
    expect(within(hero).getByRole("combobox").getAttribute("placeholder")).toMatch(/cidade/i);
  });

  test("seções em ordem, um trabalho cada", async () => {
    montar();
    const h2 = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual(["Perto de você", "Por onde começar", "Quem mais recebe", "Empresas que os políticos contratam", "Novidades", "Como funciona"]);
  });

  test("quem mais recebe: empresas e entidades privadas separadas dos fundos públicos", async () => {
    montar();
    const sec = screen.getByRole("region", { name: "Quem mais recebe" });
    expect(await within(sec).findByText(/Construtora Y/i)).toBeTruthy();
    expect(within(sec).getByText(/Fundo Estadual de Sa/i)).toBeTruthy();
    expect(within(sec).getByRole("heading", { name: /Empresas e entidades privadas/ })).toBeTruthy();
    expect(within(sec).getByRole("heading", { name: /Fundos públicos/ })).toBeTruthy();
    expect(within(sec).getAllByRole("link").some((a) => a.getAttribute("href") === "/quem-recebe")).toBe(true);
  });

  test("empresas contratadas: a maior de cada tipo de gasto, com link para o tipo", async () => {
    montar();
    const sec = screen.getByRole("region", { name: "Empresas que os políticos contratam" });
    const tam = await within(sec).findByRole("link", { name: /Cia Aérea - TAM/ });
    expect(tam.getAttribute("href")).toBe("/empresas-contratadas?tipo=passagens");
    expect(within(sec).getByText(/Propaganda e marketing/)).toBeTruthy();
  });

  test("hero na língua do dia a dia: rótulo, número grande que é link e frase", async () => {
    montar();
    const hero = screen.getByRole("region", { name: /já mandaram/ });
    const n = await within(hero).findByRole("link", { name: /R\$\s194,6\sbilhões/ });
    expect(hero.textContent).toMatch(/Dinheiro público · desde 2014/i);
    expect(n.getAttribute("href")).toBe("/dinheiro");
    expect(hero.textContent).toContain("para cidades e estados de todo o Brasil. Veja quanto chegou na sua — e quem mandou.");
    expect(within(hero).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(expect.arrayContaining(["/pix", "/orcamento-secreto"]));
  });

  test("com estado salvo, o número grande vira 'chegaram em <estado>'", async () => {
    localStorage.setItem("emenda:local", JSON.stringify({ tipo: "uf", id: "BA", nome: "Bahia", uf: "BA" }));
    montar();
    const hero = await screen.findByRole("region", { name: /chegaram em Bahia/ });
    const a = await within(hero).findByRole("link", { name: /R\$\s9(,0)?\sbilhões/ });
    expect(a.getAttribute("href")).toBe("/uf/BA");
  });

  test("fato do dia aparece já no hero, com link e compartilhar", async () => {
    montar();
    const fato = await screen.findByRole("region", { name: "Fato do dia" });
    expect(within(fato).getAllByRole("link")[0]!.getAttribute("href")).toBe("/ultimas");
    expect(within(fato).getByRole("button", { name: /Compartilhar/ })).toBeTruthy();
  });
});
