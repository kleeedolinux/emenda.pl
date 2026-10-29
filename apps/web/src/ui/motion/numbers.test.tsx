import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { setReducedMotion } from "@/test/dom";
import { CountUp, NumberRoll } from "./numbers";

describe("CountUp", () => {
  test("leitor de tela lê o valor final desde o início", () => {
    render(<CountUp value={1234567} />);
    expect(screen.getByRole("text").getAttribute("aria-label")).toBe("1.234.567");
  });

  test("fantasma invisível com o valor final reserva a largura", () => {
    render(<CountUp value={98765} format={(n) => `R$ ${Math.round(n)}`} />);
    const root = screen.getByRole("text");
    const [ghost, live] = [...root.children] as HTMLElement[];
    expect(ghost!.className).toContain("invisible");
    expect(ghost!.textContent).toBe("R$ 98765");
    expect(ghost!.getAttribute("aria-hidden")).toBe("true");
    expect(live!.getAttribute("aria-hidden")).toBe("true");
    expect(root.className).toContain("inline-grid");
  });

  test("reduced-motion mostra o valor final imediatamente", () => {
    setReducedMotion(true);
    render(<CountUp value={42} />);
    const live = screen.getByRole("text").children[1]!;
    expect(live.textContent).toBe("42");
  });
});

describe("NumberRoll", () => {
  test("rótulo acessível com o texto completo", () => {
    render(<NumberRoll text="R$ 1.234" />);
    expect(screen.getByRole("text").getAttribute("aria-label")).toBe("R$ 1.234");
  });
  test("reduced-motion: texto simples", () => {
    setReducedMotion(true);
    const { container } = render(<NumberRoll text="R$ 9" />);
    expect(container.textContent).toBe("R$ 9");
    expect(container.firstElementChild!.className).toContain("whitespace-nowrap");
  });
});
