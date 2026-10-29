import { describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { GlassMap, type MapState } from "./GlassMap";

const states: MapState[] = [
  { key: "BA", d: "M10 10l20 0 0 20z", c: [20, 20], level: 1, dist: 0.5, valor: 260_000_000_000 },
  { key: "DF", d: "M40 40l5 0 0 5z", c: [42, 42], level: 0.2, dist: 0, valor: 1_000_00 },
];
const montar = (onUf: (uf: string) => void) =>
  render(<GlassMap states={states} outline="" hub={[42, 42]} chips={[]} chipRef={() => () => {}} animate={false} onUf={onUf} nomeUf={(uf) => (uf === "BA" ? "Bahia" : "Distrito Federal")} />);

describe("GlassMap: mapa do hero clicável", () => {
  test("cada estado é link com nome e R$ no nome acessível, e leva a /uf/:uf", async () => {
    const ido: string[] = [];
    montar((uf) => ido.push(uf));
    const ba = screen.getByRole("link", { name: /Bahia: R\$\s2,6\sbi recebidos/ });
    expect(ba.getAttribute("href")).toBe("/uf/BA");
    await act(async () => { fireEvent.click(ba); });
    expect(ido).toEqual(["BA"]);
  });

  test("foco (teclado) ou toque mostra o rótulo com nome e valor", async () => {
    montar(() => {});
    const ba = screen.getByRole("link", { name: /Bahia/ });
    await act(async () => { fireEvent.focus(ba); });
    expect(screen.getByRole("status").textContent).toContain("Bahia");
    expect(screen.getByRole("status").textContent).toMatch(/R\$\s2,6\sbi/);
  });
});
