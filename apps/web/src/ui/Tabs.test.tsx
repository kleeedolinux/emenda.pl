import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { Tabs } from "./Tabs";

function Loc() { const l = useLocation(); return <output data-testid="loc">{l.search}</output>; }
const tabs = [
  { id: "resumo", label: "Resumo", content: <p>conteúdo resumo</p> },
  { id: "votos", label: "Votos", count: 1234, content: <p>conteúdo votos</p> },
];
const setup = (url = "/x") => render(<MemoryRouter initialEntries={[url]}><Tabs tabs={tabs} /><Loc /></MemoryRouter>);

// Radix ativa abas no mousedown (botão 0).
const pick = (name: RegExp) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });

describe("Tabs", () => {
  test("primeira aba por padrão, sem parâmetro", () => {
    setup();
    expect(screen.getByRole("tab", { name: /Resumo/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("conteúdo resumo")).toBeTruthy();
    expect(screen.getByTestId("loc").textContent).toBe("");
  });

  test("lê ?tab= da URL e preserva outros parâmetros", () => {
    setup("/x?ano=2024&tab=votos");
    expect(screen.getByRole("tab", { name: /Votos/ }).getAttribute("aria-selected")).toBe("true");
    pick(/Resumo/);
    expect(screen.getByTestId("loc").textContent).toBe("?ano=2024");
  });

  test("trocar de aba grava ?tab=", () => {
    setup();
    pick(/Votos/);
    expect(screen.getByTestId("loc").textContent).toBe("?tab=votos");
    expect(screen.getByText("conteúdo votos")).toBeTruthy();
  });

  test("contagem formatada pt-BR e que não quebra", () => {
    setup();
    const tab = screen.getByRole("tab", { name: /Votos/ });
    expect(tab.textContent).toContain("1.234");
    expect(tab.className).toContain("whitespace-nowrap");
  });

  test("valor inválido em ?tab= cai na primeira", () => {
    setup("/x?tab=nada");
    expect(screen.getByRole("tab", { name: /Resumo/ }).getAttribute("aria-selected")).toBe("true");
  });
});
