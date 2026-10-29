import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import ContratadasPage from "./ContratadasPage";

const forn = (cnpjCpf: string, nome: string, valor: number, casa: string, id: string) => ({ cnpjCpf, nome, valor, n: 1, parlamentares: 1, contratantes: [{ casa, id, valor }] });
const dados: Record<string, unknown> = {
  "fornecedores.json": {
    grupos: [
      { grupo: "passagens", valor: 900, fornecedores: [forn("1", "Cia Aérea - TAM", 900, "camara", "10")] },
      { grupo: "divulgacao", valor: 500, fornecedores: [forn("2", "GRAFICA X LTDA", 500, "senado", "20")] },
    ],
  },
  "ranking.json": { parlamentares: [
    { casa: "camara", id: "10", nome: "Ana Lima", partido: "PT", uf: "BA" },
    { casa: "senado", id: "20", nome: "Beto Souza", partido: "PL", uf: "SP" },
  ] },
};
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; (window as { fetch: typeof fetch }).fetch = realFetch; });

function montar(url = "/empresas-contratadas") {
  globalThis.fetch = (async (u: string) => {
    const k = Object.keys(dados).find((x) => String(u).endsWith(`/${x}`));
    return k ? Response.json(dados[k]) : new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  (window as { fetch: typeof fetch }).fetch = globalThis.fetch;
  const r = createMemoryRouter([{ path: "/empresas-contratadas", element: <ContratadasPage /> }], { initialEntries: [url] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={r} /></QueryClientProvider>);
}

describe("ContratadasPage", () => {
  test("abre no maior grupo, troca de grupo e mostra quem contratou", async () => {
    montar();
    expect(await screen.findByText(/Cia Aérea - TAM/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Propaganda e marketing/ }));
    const linha = (await screen.findByText(/Grafica X/i)).closest("li")!;
    expect(screen.queryByText(/Cia Aérea - TAM/)).toBeNull();
    const quem = within(linha).getByRole("link", { name: /Beto Souza/ });
    expect(quem.getAttribute("href")).toBe("/senador/20#gastos");
  });
  test("grupo vem da URL", async () => {
    montar("/empresas-contratadas?tipo=divulgacao");
    expect(await screen.findByText(/Grafica X/i)).toBeTruthy();
  });
});
