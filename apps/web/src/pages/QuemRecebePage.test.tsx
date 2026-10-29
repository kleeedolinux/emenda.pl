import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import QuemRecebePage from "./QuemRecebePage";

const pj = "Pessoa Jurídica";
const dados = {
  totais: { empresas: 30_000_000_000, entidades: 10_000_000_000, fundos: 5_000_000_000 },
  empresas: [{ documento: "1", nome: "CONSTRUTORA Y LTDA", tipo: pj, valor: 20_000_000_000, uf: "MG", municipio: "BETIM" }],
  entidades: [{ documento: "2", nome: "HOSPITAL X", tipo: pj, valor: 10_000_000_000, uf: "SP", municipio: "CAMPINAS" }],
  fundos: [{ documento: "3", nome: "FUNDO ESTADUAL DE SAUDE", tipo: pj, valor: 5_000_000_000, uf: "SP", municipio: "SAO PAULO" }],
};
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; (window as { fetch: typeof fetch }).fetch = realFetch; });

function montar() {
  globalThis.fetch = (async (u: string) => (String(u).endsWith("/beneficiados.json") ? Response.json(dados) : new Response("", { status: 404 }))) as unknown as typeof fetch;
  (window as { fetch: typeof fetch }).fetch = globalThis.fetch;
  const r = createMemoryRouter([{ path: "/quem-recebe", element: <QuemRecebePage /> }], { initialEntries: ["/quem-recebe"] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={r} /></QueryClientProvider>);
}

describe("QuemRecebePage", () => {
  test("privados e fundos em seções separadas; filtro por tipo", async () => {
    montar();
    const priv = (await screen.findByRole("heading", { name: /Empresas e entidades privadas/ })).closest("section")!;
    expect(within(priv).getByText(/Construtora Y/i)).toBeTruthy();
    expect(within(priv).getByText(/Hospital X/i)).toBeTruthy();
    expect(within(priv).queryByText(/Fundo Estadual/i)).toBeNull();
    fireEvent.click(within(priv).getByRole("button", { name: "Empresas" }));
    expect(within(priv).queryByText(/Hospital X/i)).toBeNull();
    const fundos = screen.getByRole("heading", { name: /Fundos públicos/ }).closest("section")!;
    expect(within(fundos).getByText(/Fundo Estadual de Sa/i)).toBeTruthy();
  });
});
