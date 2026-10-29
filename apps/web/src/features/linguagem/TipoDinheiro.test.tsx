import { describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { BarraTipos } from "./TipoDinheiro";

const porTipo = [{ tipo: "individual" as const, pago: 300_00 }, { tipo: "pix" as const, pago: 100_00 }];
const detalhe = (t: string) => ({
  titulo: "Quem mandou",
  itens: t === "pix" ? [{ chave: "a", nome: "Ana Souza", href: "/autor/a", pago: 60_00 }] : [],
  verMais: `/emendas?tipo=${t}`,
});

const montar = () => render(<MemoryRouter><BarraTipos porTipo={porTipo} detalhe={detalhe} /></MemoryRouter>);

describe("BarraTipos: toque explica a fatia", () => {
  test("toque na legenda destaca o tipo e abre painel com sentido, valor, % e principais", async () => {
    montar();
    const botao = within(screen.getByRole("list")).getByRole("button", { name: /Sem dizer para quê/ });
    expect(botao.getAttribute("aria-pressed")).toBe("false");
    await act(async () => { fireEvent.click(botao); });
    expect(botao.getAttribute("aria-pressed")).toBe("true");
    const painel = screen.getByRole("region", { name: "Sem dizer para quê" });
    expect(painel.textContent).toContain("Dinheiro mandado sem dizer para quê.");
    expect(painel.textContent).toContain("25%");
    expect(painel.textContent).toContain("Ana Souza");
    expect(within(painel).getByRole("link", { name: /Ver mais/ }).getAttribute("href")).toBe("/emendas?tipo=pix");
  });

  test("toque na fatia da barra também abre; segundo toque fecha", async () => {
    montar();
    const fatia = screen.getByRole("button", { name: /Com destino definido: 75%/ });
    await act(async () => { fireEvent.click(fatia); });
    expect(screen.getByRole("region", { name: "Com destino definido" })).toBeTruthy();
    await act(async () => { fireEvent.click(fatia); });
    expect(screen.queryByRole("region")).toBeNull();
  });
});
