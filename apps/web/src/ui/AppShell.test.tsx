// Regressão iOS: diálogo aberto ao mudar de rota (voltar/avançar) deixava o scroll-lock do Radix no body.
import { afterEach, describe, expect, test } from "bun:test";
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { setReducedMotion } from "@/test/dom";
import { within } from "@testing-library/react";
import { AppShell, NAV } from "./AppShell";

function setup() {
  globalThis.fetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
  (window as { fetch: typeof fetch }).fetch = globalThis.fetch;
  setReducedMotion(true);
  localStorage.setItem("emenda:consent", "ciente");
  const router = createMemoryRouter([{ path: "/", element: <AppShell />, children: [{ index: true, element: <p>início</p> }, { path: "b", element: <p>página b</p> }] }], { initialEntries: ["/"] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}
const locked = () => document.body.hasAttribute("data-scroll-locked") || document.body.style.overflow === "hidden" || document.body.style.pointerEvents === "none";

describe("AppShell: rota muda com diálogo aberto", () => {
  test("menu fecha e libera a rolagem", async () => {
    const router = setup();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Abrir menu" })); });
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await act(async () => { await router.navigate("/b"); });
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(locked()).toBe(false);
  });

  test("busca fecha e libera a rolagem", async () => {
    const router = setup();
    await act(async () => { fireEvent.keyDown(window, { key: "k", ctrlKey: true }); });
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await act(async () => { await router.navigate("/b"); });
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(locked()).toBe(false);
  });

  test("barra inferior fixa não cobre o fim da página (safe-area)", () => {
    setup();
    const shell = screen.getByRole("main").parentElement!;
    expect(shell.className).toContain("env(safe-area-inset-bottom)");
  });
});

describe("AppShell: cabeçalho em telas médias (~760px)", () => {
  test("menu de cima só a partir de xl (antes vira ☰), itens numa linha, rótulos curtos, logo não encolhe", async () => {
    setup();
    const nav = await screen.findByRole("navigation", { name: "Principal" });
    expect(nav.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(nav.className).toContain("xl:flex");
    for (const a of within(nav).getAllByRole("link")) expect(a.className).toContain("whitespace-nowrap");
    expect(NAV.filter((n) => !("mais" in n)).every((n) => n.label.length <= 12)).toBe(true);
    expect(screen.getByRole("link", { name: /página inicial/ }).className).toContain("shrink-0");
  });
});
