// Regressões de layout vistas em produção (~1034px): valores e documentos não podem vazar nem partir.
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { Pagamento } from "@emenda/contracts";
import { PagamentoCard } from "@/features/feed/components";
import { Donut } from "./charts/Donut";

const p: Pagamento = {
  mes: 202610, codigoEmenda: "202637870001", tipo: "individual", valor: 449615205,
  autor: { codigo: "3787", nome: "Comissão de Integração Nacional e Desenvolvimento Regional" },
  favorecido: { nome: "SDX Distribuidora Comércio e Importações Ltda", documento: "05055009000113", tipo: "PJ" },
  municipio: { ibge: "3550308", nome: "São Paulo", uf: "SP" },
};

describe("PagamentoCard (/ultimas)", () => {
  const ui = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ul><PagamentoCard p={p} /></ul></MemoryRouter></QueryClientProvider>);
  test("valor: fonte escala com o cartão, tabular, quebra para baixo do selo", () => {
    ui();
    const money = screen.getByText(/4\.496\.152,05/);
    const box = money.parentElement!;
    expect(box.className).toMatch(/text-\[clamp\(/);
    expect(box.className).toContain("tabular");
    expect(box.closest("li")!.className).toContain("@container");
    expect(box.parentElement!.parentElement!.className).toContain("flex-wrap");
  });
  test("CNPJ inteiro numa linha própria; rótulos acima dos valores", () => {
    ui();
    const doc = screen.getByTitle("CNPJ ou CPF de quem recebeu");
    expect(doc.className).toContain("block");
    expect(doc.className).toContain("whitespace-nowrap");
    expect(screen.getByText("Quem mandou:").className).toContain("block");
    expect(screen.getByText(/Quem recebeu/).className).toContain("block");
    expect(screen.getByText(/pago em/).className).toContain("whitespace-nowrap");
  });
});

describe("Donut", () => {
  test("legenda ao lado só quando o cartão é largo (container query)", () => {
    const { container } = render(<Donut data={[{ label: "REPUBLICANOS", value: 3 }, { label: "UNIÃO", value: 2 }]} />);
    expect(container.firstElementChild!.className).toContain("@container");
    expect(container.firstElementChild!.firstElementChild!.className).toContain("@md:flex-row");
  });
});
