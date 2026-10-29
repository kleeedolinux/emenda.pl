import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Money, NumberFmt } from "./Money";

describe("Money", () => {
  test.each([
    [123456, false, /^R\$\s1\.234,56$/],
    [0, false, /^R\$\s0,00$/],
    [-50000, false, /^-R\$\s500,00$/],
    [123456789012, true, /^R\$\s1,2\sbi$/],
  ] as const)("%p compact=%p", (centavos, compact, re) => {
    const { container } = render(<Money centavos={centavos} compact={compact} />);
    expect(container.textContent ?? "").toMatch(re);
  });

  test("compacto anuncia e mostra o valor completo", () => {
    render(<Money centavos={123456789012} compact />);
    const el = screen.getByRole("text");
    expect(el.getAttribute("aria-label")).toMatch(/^R\$\s1\.234\.567\.890,12$/);
    expect(el.getAttribute("title")).toBe(el.getAttribute("aria-label"));
  });

  test("valor nunca quebra nem trunca", () => {
    const { container } = render(<Money centavos={1} />);
    const cls = container.firstElementChild!.className;
    expect(cls).toContain("whitespace-nowrap");
    expect(cls).toContain("tabular");
    expect(cls).not.toContain("truncate");
    expect(container.firstElementChild!.hasAttribute("data-num")).toBe(true);
  });

  test.each([null, undefined])("%p -> travessão com rótulo", (v) => {
    const { container } = render(<Money centavos={v} />);
    expect(container.textContent).toBe("—");
    expect(container.firstElementChild!.getAttribute("aria-label")).toBe("sem valor");
  });
});

describe("NumberFmt", () => {
  test.each([
    [1234567, false, "1.234.567"],
    [0, false, "0"],
    [1234567, true, "1,2 mi"],
  ] as const)("%p compact=%p -> %p", (value, compact, out) => {
    const { container } = render(<NumberFmt value={value} compact={compact} />);
    expect((container.textContent ?? "").replace(/\s/g, " ")).toBe(out);
  });

  test("compacto tem valor completo acessível", () => {
    render(<NumberFmt value={1234567} compact />);
    expect(screen.getByRole("text").getAttribute("aria-label")).toBe("1.234.567");
  });

  test("atômico", () => {
    const { container } = render(<NumberFmt value={42} />);
    expect(container.firstElementChild!.className).toContain("whitespace-nowrap");
  });
});
