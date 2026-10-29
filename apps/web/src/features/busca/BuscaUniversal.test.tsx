import { afterEach, describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { IndiceBusca } from "@emenda/contracts";
import { BuscaUniversal } from "./BuscaUniversal";

const idx: IndiceBusca = {
  v: 1, geradoEm: "x",
  cidades: [[2914406, "Iraquara", "BA", 260_350_000], [3550308, "São Paulo", "SP", 9]],
  deputados: [[209787, "Nikolas Ferreira", "PL", "MG", 100], [1, "Nilto Tatto", "PT", "SP", 50]],
  senadores: [], partidos: [], autores: [],
  prefeitos: [[2914406, "NINO COUTINHO", "PSD"]],
};
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; (window as { fetch: typeof fetch }).fetch = realFetch; });

function montar(modo: "cidade" | "tudo" = "cidade") {
  globalThis.fetch = (async (u: string) => (String(u).includes("busca.json") ? Response.json(idx) : new Response("", { status: 404 }))) as unknown as typeof fetch;
  (window as { fetch: typeof fetch }).fetch = globalThis.fetch;
  const r = createMemoryRouter([{ path: "/", element: <BuscaUniversal variante="hero" modoInicial={modo} /> }, { path: "*", element: <p>destino</p> }]);
  render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={r} /></QueryClientProvider>);
  return r;
}
const digitar = async (txt: string) => {
  const input = screen.getByRole("combobox");
  await act(async () => { fireEvent.focus(input); fireEvent.change(input, { target: { value: txt } }); });
  await act(() => new Promise((ok) => setTimeout(ok, 200)));
  return input;
};

describe("BuscaUniversal (estilo Google)", () => {
  test("hero: sugestões aparecem logo abaixo do campo enquanto digita, com destaque do trecho", async () => {
    montar();
    const input = await digitar("sao pa");
    const lista = await screen.findByRole("listbox");
    expect(input.getAttribute("aria-controls")).toBe(lista.id);
    expect(lista.className).toContain("top-full");
    const op = within(lista).getAllByRole("option")[0]!;
    expect(op.textContent).toContain("São Paulo");
    expect(op.querySelector("mark")?.textContent).toBe("São");
  });

  test("setas movem, Enter escolhe e navega, Esc fecha", async () => {
    const r = montar();
    const input = await digitar("iraq");
    await screen.findByRole("listbox");
    await act(async () => { fireEvent.keyDown(input, { key: "ArrowDown" }); });
    const sel = screen.getAllByRole("option").find((o) => o.getAttribute("aria-selected") === "true")!;
    expect(input.getAttribute("aria-activedescendant")).toBe(sel.id);
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    expect(r.state.location.pathname).toBe("/municipio/2914406");
  });

  test("Esc fecha a lista", async () => {
    montar();
    const input = await digitar("iraq");
    await screen.findByRole("listbox");
    await act(async () => { fireEvent.keyDown(input, { key: "Escape" }); });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("Tudo: grupos com título; nome do prefeito acha a cidade", async () => {
    montar("tudo");
    await digitar("ni");
    const lista = await screen.findByRole("listbox");
    expect(lista.textContent).toContain("Pessoas");
    expect(lista.textContent).toContain("Nino Coutinho");
    expect(lista.textContent).toContain("Prefeito(a) de Iraquara");
  });
});
