// Fumaça do botão de compartilhar (src/features/share): só renderização, sem abrir o diálogo pesado.
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ShareButton } from "@/features/share/ShareButton";

describe("ShareButton", () => {
  test("rótulo padrão", () => {
    render(<ShareButton kind="uf" title="Emendas de SP" url="https://emenda.online/uf/SP" />);
    expect(screen.getByRole("button", { name: "Compartilhar" })).toBeTruthy();
  });
  test("compacto: só ícone com nome acessível", () => {
    render(<ShareButton compact kind="uf" title="Emendas de SP" url="https://emenda.online/uf/SP" />);
    expect(screen.getByRole("button", { name: "Compartilhar: Emendas de SP" })).toBeTruthy();
  });
});
