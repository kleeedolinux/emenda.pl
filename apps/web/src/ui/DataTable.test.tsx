import { afterEach, describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { DataTable, type Column } from "./DataTable";

interface Row { nome: string; uf: string; valor: number }
const rows: Row[] = [
  { nome: "Ana", uf: "SP", valor: 30 },
  { nome: "Bruno", uf: "RJ", valor: 10 },
  { nome: "Célia", uf: "SP", valor: 20 },
];
const columns: Column<Row>[] = [
  { key: "nome", header: "Nome", sort: true },
  { key: "uf", header: "UF" },
  { key: "valor", header: "Valor", sort: true, align: "right", csv: (r) => r.valor * 100 },
];
const bodyNames = () => within(screen.getAllByRole("rowgroup")[1]!).getAllByRole("row").map((r) => r.firstElementChild!.textContent);

describe("DataTable", () => {
  test("ordena por coluna (desc, depois asc) com aria-sort", () => {
    render(<DataTable rows={rows} columns={columns} />);
    expect(bodyNames()).toEqual(["Ana", "Bruno", "Célia"]);
    fireEvent.click(screen.getByRole("button", { name: /Valor/ }));
    expect(bodyNames()).toEqual(["Ana", "Célia", "Bruno"]);
    expect(screen.getByRole("columnheader", { name: /Valor/ }).getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(screen.getByRole("button", { name: /Valor/ }));
    expect(bodyNames()).toEqual(["Bruno", "Célia", "Ana"]);
    expect(screen.getByRole("columnheader", { name: /Valor/ }).getAttribute("aria-sort")).toBe("ascending");
  });

  test("ordem inicial e colação pt-BR (acentos)", () => {
    render(<DataTable rows={rows} columns={columns} initialSort={{ key: "nome", dir: "asc" }} />);
    expect(bodyNames()).toEqual(["Ana", "Bruno", "Célia"]);
  });

  test("filtro sem acento e contagem", async () => {
    render(<DataTable rows={rows} columns={columns} search={(r) => `${r.nome} ${r.uf}`} />);
    expect(screen.getByText(/3 registros/)).toBeTruthy();
    await act(async () => { fireEvent.change(screen.getByRole("searchbox"), { target: { value: "celia sp" } }); });
    expect(bodyNames()).toEqual(["Célia"]);
    expect(screen.getByText(/1 registro$/)).toBeTruthy();
  });

  test("paginação", () => {
    render(<DataTable rows={rows} columns={columns} pageSize={2} />);
    expect(screen.getByText("Página 1 de 2")).toBeTruthy();
    expect(bodyNames()).toEqual(["Ana", "Bruno"]);
    expect((screen.getByRole("button", { name: "Página anterior" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(bodyNames()).toEqual(["Célia"]);
    expect((screen.getByRole("button", { name: "Próxima página" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("vazio: estado padrão e personalizado", async () => {
    const { unmount } = render(<DataTable rows={[]} columns={columns} />);
    expect(screen.getByText("Nenhum registro encontrado.")).toBeTruthy();
    unmount();
    render(<DataTable rows={[]} columns={columns} empty="Sem emendas." />);
    expect(screen.getByText("Sem emendas.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  describe("CSV", () => {
    const orig = URL.createObjectURL;
    afterEach(() => { URL.createObjectURL = orig; });
    test("exporta linhas filtradas/ordenadas com valor csv da coluna", async () => {
      let blob: Blob | undefined;
      let name = "";
      URL.createObjectURL = ((b: Blob) => { blob = b; return "blob:x"; }) as typeof URL.createObjectURL;
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { name = this.download; };
      try {
        render(<DataTable rows={rows} columns={columns} exportName="emendas" initialSort={{ key: "valor", dir: "desc" }} />);
        fireEvent.click(screen.getByRole("button", { name: /CSV/ }));
      } finally { HTMLAnchorElement.prototype.click = click; }
      expect(name).toBe("emendas.csv");
      const text = (await blob!.text()).replace(/^﻿/, "");
      const lines = text.trim().split(/\r?\n/);
      expect(lines[0]).toMatch(/Nome.UF.Valor/);
      expect(lines.slice(1).map((l) => l.split(/[;,]/)[0])).toEqual(["Ana", "Célia", "Bruno"]);
      expect(lines[1]).toContain("3000");
    });
  });

  test("células numéricas à direita não quebram", () => {
    render(<DataTable rows={rows} columns={columns} />);
    const td = screen.getByText("30");
    expect(td.className).toContain("whitespace-nowrap");
    expect(td.className).toContain("tabular");
  });

  describe("celular (< md)", () => {
    interface R4 { nome: string; uf: string; partido: string; valor: number }
    const r4: R4[] = [
      { nome: "Ana", uf: "SP", partido: "PT", valor: 10 },
      { nome: "Bruno", uf: "RJ", partido: "PL", valor: 30 },
    ];
    const c4: Column<R4>[] = [
      { key: "nome", header: "Nome", sort: true },
      { key: "uf", header: "UF" },
      { key: "partido", header: "Partido" },
      { key: "valor", header: "Valor", sort: true, align: "right" },
    ];

    test("4+ colunas viram cartões empilhados: rótulo por célula (CSS, sem mudar o texto)", () => {
      const { container } = render(<DataTable rows={r4} columns={c4} />);
      expect(container.querySelector("table")!.className).toContain("max-md:block");
      const tds = [...container.querySelectorAll("tbody tr:first-child td")];
      expect(tds.map((td) => td.getAttribute("data-label"))).toEqual([null, "UF", "Partido", "Valor"]);
      expect(tds[1]!.textContent).toBe("SP");
      // número: rótulo e valor em flex-wrap (valor desce inteiro em vez de vazar do cartão)
      expect(tds[3]!.className).toContain("max-md:flex-wrap");
      expect(tds[3]!.className).not.toContain("float");
    });

    test("cartões: ordenação por seletor (cabeçalho fica oculto)", () => {
      render(<DataTable rows={r4} columns={c4} />);
      const sel = screen.getByRole("combobox", { name: /Ordenar/ });
      fireEvent.change(sel, { target: { value: "valor:desc" } });
      expect(bodyNames()).toEqual(["Bruno", "Ana"]);
      fireEvent.change(sel, { target: { value: "valor:asc" } });
      expect(bodyNames()).toEqual(["Ana", "Bruno"]);
    });

    test("até 3 colunas: tabela normal com rolagem e dica de rolagem", () => {
      const { container } = render(<DataTable rows={rows} columns={columns} />);
      expect(container.querySelector("td[data-label]")).toBeNull();
      expect(screen.queryByRole("combobox", { name: /Ordenar/ })).toBeNull();
      expect(container.querySelector("table")!.parentElement!.className).toContain("scroll-fade-x");
    });

    test("toque: cabeçalho com folga para o alvo de 44px do botão de ordenar/dica", () => {
      render(<DataTable rows={rows} columns={columns} />);
      expect(screen.getByRole("columnheader", { name: /Valor/ }).className).toContain("pointer-coarse:py-3.5");
    });

    test("cartões ignoram largura mínima de coluna (min-w-*) para caber em 280px", () => {
      const cols = c4.map((c) => (c.key === "partido" ? { ...c, className: "min-w-56" } : c));
      const { container } = render(<DataTable rows={r4} columns={cols} />);
      const td = container.querySelector('td[data-label="Partido"]')!;
      expect(td.className).toContain("max-md:min-w-0");
    });

    test("stack={false} força tabela", () => {
      const { container } = render(<DataTable rows={r4} columns={c4} stack={false} />);
      expect(container.querySelector("td[data-label]")).toBeNull();
    });
  });
});

