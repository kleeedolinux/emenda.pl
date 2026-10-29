import { describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { setReducedMotion } from "@/test/dom";
import { AvisoPrivacidade, PrivacidadeControle } from "./Analytics";

const KEY = "emenda:consent";
const ui = () => render(<MemoryRouter><AvisoPrivacidade /><PrivacidadeControle /></MemoryRouter>);

describe("AvisoPrivacidade", () => {
  test("aparece sem escolha; Desativar persiste opt-out e some", async () => {
    setReducedMotion(true);
    ui();
    expect(screen.getByRole("region", { name: "Aviso de privacidade" })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "Desativar" })[0]!); });
    expect(localStorage.getItem(KEY)).toBe("desativado");
    await waitFor(() => expect(screen.queryByRole("region", { name: "Aviso de privacidade" })).toBeNull());
    expect(screen.getByText(/Medição de audiência desativada/)).toBeTruthy();
  });

  test("escolha persistida: não reaparece", () => {
    localStorage.setItem(KEY, "desativado");
    ui();
    expect(screen.queryByRole("region", { name: "Aviso de privacidade" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reativar" })).toBeTruthy();
  });

  test("Entendi grava ciente", async () => {
    ui();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Entendi" })); });
    expect(localStorage.getItem(KEY)).toBe("ciente");
  });
});
