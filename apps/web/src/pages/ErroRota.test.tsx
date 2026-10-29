import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ErroRota } from "./ErroRota";

function Quebra(): never { throw new Error("pautaDoSenado(null)"); }

describe("ErroRota", () => {
  test("erro na página vira mensagem simples, com tentar de novo e link para o início (sem pilha)", async () => {
    const orig = console.error; console.error = () => {};
    try {
      const r = createMemoryRouter([{ path: "/", errorElement: <ErroRota />, children: [{ path: "x", element: <Quebra /> }] }], { initialEntries: ["/x"] });
      render(<RouterProvider router={r} />);
      expect(await screen.findByRole("heading", { name: /Algo deu errado/ })).toBeTruthy();
      expect(screen.getByRole("button", { name: /Tentar de novo/ })).toBeTruthy();
      expect(screen.getByRole("link", { name: /Voltar ao início/ }).getAttribute("href")).toBe("/");
      expect(document.body.textContent).not.toContain("pautaDoSenado");
    } finally { console.error = orig; }
  });

  test("404 de rota: página não encontrada", async () => {
    const r = createMemoryRouter([{ path: "/", errorElement: <ErroRota />, element: <p>início</p> }], { initialEntries: ["/nada"] });
    render(<RouterProvider router={r} />);
    expect(await screen.findByRole("heading", { name: /Página não encontrada/ })).toBeTruthy();
  });
});
