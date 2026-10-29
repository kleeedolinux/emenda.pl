import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { partyColor } from "@/lib/colors";
import { Avatar, Badge, Card, EmptyState, ErrorState, ExternalLink, KeyValue, PartyBadge, Stat, StatGrid, VoteBadge } from "./primitives";

const inRouter = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

// Razão de contraste WCAG entre duas cores CSS (hex / rgb() / hsl()) resolvidas pelo navegador de teste.
function lum(css: string): number {
  const probe = document.createElement("span");
  probe.style.color = css;
  document.body.append(probe);
  const c = getComputedStyle(probe).color || css;
  probe.remove();
  const m = c.match(/^#([0-9a-f]{6})$/i);
  const rgb = m ? [0, 2, 4].map((i) => parseInt(m[1]!.slice(i, i + 2), 16)) : (c.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  if (/^hsl/i.test(c)) throw new Error(`cor não resolvida: ${c}`);
  const [r, g, b] = rgb.slice(0, 3).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const hslToHex = (c: string) => {
  const [h = 0, s = 0, l = 0] = (c.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  const S = s / 100, L = l / 100, k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) => Math.round(255 * (L - S * Math.min(L, 1 - L) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return "#" + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("");
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

describe("Stat", () => {
  test("rótulo, valor e dica do glossário", () => {
    render(<StatGrid><Stat label="Pago" value="R$ 10" tip="empenhado" hint="em 2024" /></StatGrid>);
    expect(screen.getByText("Pago")).toBeTruthy();
    expect(screen.getByText("em 2024")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mais informações" })).toBeTruthy();
  });

  test("valor sem truncamento nem altura fixa; escala com o cartão", () => {
    render(<StatGrid><Stat label="Total" value="R$ 1.234.567.890,12" /></StatGrid>);
    const dd = screen.getByText("R$ 1.234.567.890,12");
    expect(dd.tagName).toBe("DD");
    for (const bad of ["truncate", "text-ellipsis", "overflow-hidden", "line-clamp", "h-"]) expect(dd.className.split(/\s+/).some((c) => c.startsWith(bad))).toBe(false);
    expect(dd.className).toContain("tabular");
    expect(dd.className).toMatch(/text-\[clamp\(/);
    expect(dd.closest(".card")!.className).toContain("@container");
    expect(dd.closest(".card")!.className).not.toMatch(/(^|\s)overflow-hidden(\s|$)/);
  });

  test("StatGrid usa auto-fit com mínimo e minmax", () => {
    const { container } = render(<StatGrid><Stat label="a" value="1" /></StatGrid>);
    expect(container.querySelector("dl")!.className).toMatch(/repeat\(auto-fit,minmax\(/);
  });
});

describe("Badge", () => {
  // Regressão: em tabela (layout automático) "Com destino definido" virava uma palavra por linha.
  test.each(["verde", "amarelo", "azul", "vermelho", "neutro"] as const)("tom %s: curto fica numa linha, não encolhe, não passa do pai", (tone) => {
    render(<Badge tone={tone}>Com destino definido</Badge>);
    const el = screen.getByText("Com destino definido");
    expect(el.className).toContain("whitespace-nowrap");
    expect(el.className).toContain("shrink-0");
    expect(el.className).toContain("max-w-full");
  });
  // Regressão: status longo ("Aguardando Despacho do Presidente da Câmara...") saía da tela no celular.
  test("texto longo quebra em vez de vazar (máx. 2 linhas, resto no title)", () => {
    const longo = "Aguardando Despacho do Presidente da Câmara dos Deputados";
    render(<Badge>{longo}</Badge>);
    expect(screen.getByText(longo).className).toContain("line-clamp-2");
    expect(screen.getByTitle(longo)).toBeTruthy();
    const cls = screen.getByTitle(longo).className;
    expect(cls).not.toContain("whitespace-nowrap");
    // quebra só entre palavras: overflow-wrap:anywhere zera o min-content e a tabela espreme o selo ("Com desti no defin ido")
    expect(cls).not.toContain("anywhere");
    expect(cls).not.toContain("break-all");
    expect(cls).toContain("max-w-full");
  });
});

describe("PartyBadge", () => {
  test("cor determinística e link para o partido", () => {
    inRouter(<><PartyBadge sigla="PT" /><PartyBadge sigla="pt" link={false} /></>);
    const [a, b] = screen.getAllByTitle("Partido: PT").concat(screen.getAllByTitle("Partido: pt"));
    expect(a!.style.background).toBe(b!.style.background);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/partido/PT");
  });

  test("sem sigla -> S/PART sem link", () => {
    inRouter(<PartyBadge sigla="" />);
    expect(screen.getByText("S/PART")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  // Fixos + siglas com cor gerada (hsl). 4,3 é o mínimo teórico da melhor escolha entre preto e branco.
  test.each(["PT", "PL", "PSD", "NOVO", "SOLIDARIEDADE", "PODE", "PV", "XYZ", "ABC", "PARTIDOFICTICIO", "AMARELO", "Q1"])("%s: texto com contraste seguro", (sigla) => {
    inRouter(<PartyBadge sigla={sigla} link={false} />);
    const el = screen.getByTitle(`Partido: ${sigla}`);
    const bg = partyColor(sigla);
    const fg = el.style.color;
    expect(fg).toBeTruthy();
    expect(ratio(bg.startsWith("hsl") ? hslToHex(bg) : bg, fg)).toBeGreaterThanOrEqual(4.3);
  });
});

describe("VoteBadge", () => {
  test.each([
    ["Sim", "verde"], ["Não", "vermelho"], ["nao", "vermelho"], ["Abstenção", "amarelo"], ["Obstrução", "azul"], ["Art. 17", "neutro"], ["Outro", "neutro"],
  ])("%s -> %s", (voto, tone) => {
    render(<VoteBadge voto={voto} />);
    const cls = screen.getByText(voto).className;
    const expected = { verde: "text-verde-700", vermelho: "text-vermelho", amarelo: "text-amarelo-700", azul: "text-azul", neutro: "text-muted" }[tone]!;
    expect(cls).toContain(expected);
  });
  test("vazio -> travessão", () => {
    render(<VoteBadge voto="" />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("KeyValue", () => {
  test("pares rótulo/valor; valor nulo vira travessão", () => {
    const { container } = render(<KeyValue items={[["CNPJ", "00.000.000/0001-91"], ["Partido", null], ["Pago", "R$ 1", "empenhado"]]} />);
    const dts = [...container.querySelectorAll("dt")].map((e) => e.textContent);
    const dds = [...container.querySelectorAll("dd")].map((e) => e.textContent);
    expect(dts[0]).toBe("CNPJ");
    expect(dds).toEqual(["00.000.000/0001-91", "—", "R$ 1"]);
    expect(screen.getAllByRole("button", { name: "Mais informações" })).toHaveLength(1);
    expect(container.querySelector("dl")!.className).toContain("minmax(0,1fr)");
  });
});

describe("ErrorState / EmptyState", () => {
  test("mensagem e retry", () => {
    const retry = mock(() => {});
    render(<ErrorState error={new Error("HTTP 503")} retry={retry} />);
    expect(screen.getByRole("alert").textContent).toContain("HTTP 503");
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  test("sem retry -> sem botão; erro não-Error vira texto", () => {
    render(<ErrorState error="falhou" />);
    expect(screen.getByRole("alert").textContent).toContain("falhou");
    expect(screen.queryByRole("button")).toBeNull();
  });
  test("EmptyState com dica", () => {
    render(<EmptyState title="Nada aqui" hint="Tente outro filtro" />);
    expect(screen.getByText("Nada aqui")).toBeTruthy();
    expect(screen.getByText("Tente outro filtro")).toBeTruthy();
  });
});

describe("Card", () => {
  test("título encolhe; ações descem de linha e nunca passam da largura do cartão", () => {
    render(<Card title="Gastos por categoria em 2024" actions={<button type="button">CSV</button>}>x</Card>);
    expect(screen.getByRole("heading", { level: 2 }).className).toContain("min-w-0");
    const acoes = screen.getByRole("button", { name: "CSV" }).parentElement!.className;
    expect(acoes).toContain("max-w-full");
    expect(acoes).toContain("flex-wrap");
    expect(acoes).not.toContain("shrink-0");
  });
});

describe("Avatar", () => {
  test("iniciais quando a imagem falha", () => {
    const { container } = render(<Avatar src="https://example.org/x.jpg" name="Maria da Silva" />);
    const img = container.querySelector("img")!;
    fireEvent.error(img); // 1ª falha: tenta a original (se houver CDN)
    const again = container.querySelector("img");
    if (again) fireEvent.error(again);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByLabelText("Maria da Silva").textContent).toBe("MD");
  });
  test("sem src -> iniciais", () => {
    render(<Avatar name="joão" />);
    expect(screen.getByLabelText("joão").textContent).toBe("J");
  });
  test("bancada estadual sem foto -> bandeira do estado", () => {
    const { container } = render(<Avatar name="Bancada de Minas Gerais" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toContain("/bandeira/uf/MG");
    expect(img.getAttribute("alt")).toBe("Bancada de Minas Gerais");
  });
  test("bandeira que falha volta para as iniciais", () => {
    const { container } = render(<Avatar name="Bancada da Bahia" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByLabelText("Bancada da Bahia").textContent).toBe("BD");
  });
});

describe("ExternalLink", () => {
  test("nova aba segura, aviso para leitor de tela", () => {
    render(<ExternalLink href="https://x.org">Portal</ExternalLink>);
    const a = screen.getByRole("link");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(a.textContent).toContain("(abre em nova aba)");
  });
  // Regressão: CNPJ quebrava em "07.319.323/" + "0001-91" nas tabelas.
  test.each([["07.319.323/0001-91", true], ["Portal da Transparência", false], ["Lei 14.133/2021", false]])("%p nowrap=%p", (txt, nowrap) => {
    render(<ExternalLink href="https://x.org">{txt}</ExternalLink>);
    expect(screen.getByRole("link").className.includes("whitespace-nowrap")).toBe(nowrap);
  });
});
