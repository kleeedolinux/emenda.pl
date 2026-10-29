import { describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Term, Tip } from "./Tip";

describe("Tip", () => {
  test("ícone tem nome acessível e abre no foco com role=tooltip", async () => {
    render(<Tip content="Valor reservado no orçamento." />);
    const btn = screen.getByRole("button", { name: "Mais informações" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    await act(async () => { fireEvent.focus(btn); });
    const tip = await screen.findByRole("tooltip");
    expect(tip.textContent).toContain("Valor reservado no orçamento.");
    expect(btn.getAttribute("aria-describedby")).toBe(tip.id);
  });

  test("clique alterna (toque no celular)", async () => {
    render(<Tip content="def" label="Sobre pago" />);
    const btn = screen.getByRole("button", { name: "Sobre pago" });
    await act(async () => { fireEvent.click(btn); });
    expect(await screen.findByRole("tooltip")).toBeTruthy();
  });

  test("toque abre, segundo toque fecha", async () => {
    render(<Tip content="def" label="Sobre pago" />);
    const btn = screen.getByRole("button", { name: "Sobre pago" });
    await act(async () => { fireEvent.click(btn); });
    expect(screen.queryByRole("tooltip")).toBeTruthy();
    await act(async () => { fireEvent.click(btn); });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("toque fora e Esc fecham", async () => {
    render(<><Tip content="def" label="Sobre pago" /><p>fora</p></>);
    const btn = screen.getByRole("button", { name: "Sobre pago" });
    await act(async () => { fireEvent.click(btn); });
    await act(async () => { fireEvent.pointerDown(screen.getByText("fora")); });
    expect(screen.queryByRole("tooltip")).toBeNull();
    await act(async () => { fireEvent.click(btn); });
    expect(screen.queryByRole("tooltip")).toBeTruthy();
    await act(async () => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("ícone tem área de toque de 44px", () => {
    render(<Tip content="def" />);
    expect(screen.getByRole("button").className).toContain("before:-inset-3");
  });

  test("tela pequena: toque abre painel inferior (dialog) com botão fechar", async () => {
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...mm(q), matches: q.includes("max-width") })) as typeof window.matchMedia;
    try {
      render(<Tip content="Dinheiro sem dizer para quê." label="Sobre Pix" />);
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Sobre Pix" })); });
      const sheet = await screen.findByRole("dialog");
      expect(sheet.textContent).toContain("Dinheiro sem dizer para quê.");
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Fechar" })); });
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally { window.matchMedia = mm; }
  });

  test("Term: termo do glossário vira gatilho; desconhecido é texto puro", () => {
    render(<p><Term k="empenhado">empenho</Term> e <Term k="xyz-inexistente">outro</Term></p>);
    expect(screen.getByRole("button", { name: "empenho" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "outro" })).toBeNull();
  });
});
