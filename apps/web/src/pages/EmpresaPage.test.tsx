import { afterEach, describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import EmpresaPage from "./EmpresaPage";

const cnpj = "13347016000117";
const dados: Record<string, unknown> = {
  "fornecedores.json": { grupos: [{ grupo: "divulgacao", valor: 1, fornecedores: [{ cnpjCpf: cnpj, nome: "FACEBOOK SERVIÇOS ONLINE DO BRASIL LTDA", valor: 1_300_000_000, n: 900, parlamentares: 326, contratantes: [{ casa: "camara", id: "204379", valor: 50_000_000 }] }] }] },
  "beneficiados.json": { totais: { empresas: 0, entidades: 0, fundos: 0 }, empresas: [], entidades: [], fundos: [] },
  "ranking.json": { parlamentares: [{ casa: "camara", id: "204379", nome: "Acácio Favacho", partido: "MDB", uf: "AP" }] },
};
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; (window as { fetch: typeof fetch }).fetch = realFetch; });

function montar(id = cnpj) {
  globalThis.fetch = (async (u: string) => {
    const k = Object.keys(dados).find((x) => String(u).endsWith(`/${x}`));
    return k ? Response.json(dados[k]) : new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  (window as { fetch: typeof fetch }).fetch = globalThis.fetch;
  const r = createMemoryRouter([{ path: "/empresa/:cnpj", element: <EmpresaPage /> }], { initialEntries: [`/empresa/${id}`] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={r} /></QueryClientProvider>);
}

describe("EmpresaPage", () => {
  test("nome, CNPJ, quanto recebeu, no que e quem contratou; compartilhar", async () => {
    montar();
    expect(await screen.findByRole("heading", { level: 1, name: /Facebook Serviços Online/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /13\.347\.016\/0001-17/ })).toBeTruthy();
    expect(screen.getAllByText(/326 deputados e senadores/).length).toBeGreaterThan(0);
    expect(screen.getByText("Propaganda e marketing")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Acácio Favacho/ }).getAttribute("href")).toBe("/deputado/204379#gastos");
    expect(screen.getAllByRole("button", { name: /Compartilhar/ }).length).toBeGreaterThan(0);
  });
  test("CNPJ que não está nos rankings", async () => {
    montar("11111111000111");
    expect(await screen.findByText(/não está entre as que mais receberam/)).toBeTruthy();
  });
});
