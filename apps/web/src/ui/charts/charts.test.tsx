import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Bars } from "./Bars";
import { centerSize, Donut } from "./Donut";
import { Hemicycle, hemicycleLayout, type Seat } from "./Hemicycle";

describe("Bars", () => {
  test("itens, valores formatados e links", () => {
    render(<MemoryRouter><Bars data={[{ label: "Saúde", value: 1500, href: "/area/saude", sub: "12 notas" }, { label: "Educação", value: 500 }]} /></MemoryRouter>);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("1.500")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/area/saude");
    expect(screen.getByRole("link").textContent).toContain("Saúde");
  });

  test("valor nunca truncado; rótulo quebra em vez de cortar", () => {
    render(<Bars data={[{ label: "Um rótulo muito comprido que deveria quebrar", value: 123456789, sub: "57 notas" }]} />);
    const v = screen.getByText("123.456.789");
    expect(v.className).toContain("shrink-0");
    expect(v.className).toContain("whitespace-nowrap");
    const label = screen.getByText("57 notas").parentElement!;
    expect(label.className).not.toContain("truncate");
    expect(label.className).toContain("min-w-0");
  });

  test("valor largo desce para a linha de baixo em vez de partir palavras do rótulo", () => {
    render(<Bars data={[{ label: "Comissão de Desenvolvimento Regional", value: 123456789 }]} />);
    const v = screen.getByText("123.456.789");
    const label = screen.getByText("Comissão de Desenvolvimento Regional").parentElement!;
    expect(v.parentElement!.className).toContain("flex-wrap");
    expect(v.className).toContain("ml-auto");
    expect(label.className).toMatch(/flex-\[1_1_\d+rem\]/);
  });

  test.each([[0], [-10], [Number.NaN]])("valor %p não quebra a barra", (value) => {
    const { container } = render(<Bars data={[{ label: "A", value }, { label: "B", value: 10 }]} />);
    const fill = container.querySelector(".bar-fill") as HTMLElement;
    expect(fill.style.width).toMatch(/^0\.5%$|^\d/);
  });

  test("limit e format", () => {
    render(<Bars data={[{ label: "A", value: 1 }, { label: "B", value: 2 }, { label: "C", value: 3 }]} limit={2} format={(n) => `${n} un`} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("2 un")).toBeTruthy();
  });
});

describe("Donut", () => {
  test("nome acessível lista as fatias; legenda com % e valor", () => {
    render(<Donut data={[{ label: "Pix", value: 75 }, { label: "Bancada", value: 25 }]} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Pix: 75; Bancada: 25");
    expect(screen.getByText("75,0%")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy(); // total no centro
  });

  test("zero e negativos são descartados; vazio não quebra", () => {
    render(<Donut data={[{ label: "A", value: 0 }, { label: "B", value: -5 }, { label: "C", value: 10 }]} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("C: 10");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  test("tudo zero", () => {
    render(<Donut data={[{ label: "A", value: 0 }]} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("0")).toBeTruthy();
  });

  test.each(["100", "R$ 1,2 bi", "R$ 1.234.567.890,12"])("valor central %p cabe no furo", (s) => {
    expect(centerSize(s) * s.length * 0.6).toBeLessThanOrEqual(100.0001);
    expect(centerSize(s)).toBeLessThanOrEqual(15);
  });
});

describe("Hemicycle", () => {
  const seats: Seat[] = [
    ...Array.from({ length: 3 }, (_, i) => ({ key: `a${i}`, color: "#c4122d", label: `Dep A${i}`, group: "PT" })),
    ...Array.from({ length: 2 }, (_, i) => ({ key: `b${i}`, color: "#1b3f8b", label: `Dep B${i}`, group: "PL" })),
  ];
  test("um círculo por assento, grupos na legenda e no nome acessível", () => {
    const { container } = render(<Hemicycle seats={seats} />);
    expect(container.querySelectorAll("circle")).toHaveLength(5);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("PT: 3; PL: 2");
    expect(container.querySelector("figcaption")!.textContent).toBe("PT 3PL 2");
    expect(screen.getByText("5")).toBeTruthy();
  });
  test.each([0, 1, 7, 513])("layout tem %p posições", (n) => {
    expect(hemicycleLayout(n)).toHaveLength(n);
  });
  test("sem assentos", () => {
    const { container } = render(<Hemicycle seats={[]} />);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
  });
});
