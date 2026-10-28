// Formatação pura (sem React). pt-BR.
export { formatBRL } from "@emenda/contracts";

const nf = new Intl.NumberFormat("pt-BR");
const nfCompact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const pf = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatNumber = (n: number, compact = false) => (compact ? nfCompact : nf).format(n);
export const formatPct = (r: number) => pf.format(r);

export const onlyDigits = (s: string) => s.replace(/\D/g, "");

/** 14 dígitos -> 00.000.000/0000-00. Aceita com/sem máscara; completa zeros à esquerda (até 14). */
export function formatCNPJ(s: string): string {
  const d = onlyDigits(s);
  if (d.length < 12 || d.length > 14) return s;
  const p = d.padStart(14, "0");
  return `${p.slice(0, 2)}.${p.slice(2, 5)}.${p.slice(5, 8)}/${p.slice(8, 12)}-${p.slice(12)}`;
}

/** CNPJ é formatado; CPF (já mascarado pela fonte) e outros textos ficam como vieram. */
export function formatDocumento(s: string): string {
  return !/\*/.test(s) && onlyDigits(s).length >= 12 && onlyDigits(s).length <= 14 ? formatCNPJ(s) : s;
}

export const isCNPJ = (s: string) => !/\*/.test(s) && onlyDigits(s).length === 14;

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}

type Cell = string | number | boolean | null | undefined;

/** CSV para Excel pt-BR: BOM UTF-8, separador ';', CRLF, escape RFC 4180, anti-injeção de fórmula. */
export function toCSV(header: string[], rows: Cell[][]): string {
  const esc = (v: Cell): string => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
