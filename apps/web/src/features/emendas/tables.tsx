import type { AutorResumo, EmendaItem, Favorecido, MunicipioResumo } from "@emenda/contracts";
import { Link } from "react-router";
import { externo } from "@/lib/data";
import { formatDocumento, isCNPJ } from "@/lib/format";
import { Badge, ExternalLink } from "@/ui/primitives";
import { Money } from "@/ui/Money";
import { DataTable, type Column } from "@/ui/DataTable";
import { Term } from "@/ui/Tip";
import { nomeTipoCurto, TIP_TIPO } from "./tipos";

const money = <T,>(key: string, header: string, get: (r: T) => number, tip?: string): Column<T> => ({
  key, header, align: "right", sort: get, tip, cell: (r) => <Money centavos={get(r)} />, csv: (r) => (get(r) / 100).toFixed(2).replace(".", ","),
});

export function TipoBadge({ tipo }: { tipo: string }) {
  const tone = tipo === "pix" ? "amarelo" : tipo === "individual" ? "verde" : tipo === "bancada" || tipo === "comissao" ? "azul" : tipo === "relator" ? "vermelho" : "neutro";
  return <Badge tone={tone}><Term k={TIP_TIPO[tipo as keyof typeof TIP_TIPO] ?? "emenda"}>{nomeTipoCurto(tipo)}</Term></Badge>;
}

export function EmendasTable({ rows, exportName, showLocal = false, showAutor = true }: { rows: EmendaItem[]; exportName: string; showLocal?: boolean; showAutor?: boolean }) {
  const cols: Column<EmendaItem>[] = [
    { key: "codigo", header: "Código", sort: true, cell: (r) => <ExternalLink href={externo.emenda(r.codigo)}>{r.codigo}</ExternalLink> },
    { key: "ano", header: "Ano", sort: true, align: "right", cell: (r) => <span className="tabular">{r.ano}</span> },
    { key: "tipo", header: "Tipo", sort: (r) => nomeTipoCurto(r.tipo), cell: (r) => <TipoBadge tipo={r.tipo} />, csv: (r) => r.tipoOriginal || nomeTipoCurto(r.tipo) },
    ...(showAutor ? [{ key: "autor", header: "Autor", sort: (r: EmendaItem) => r.autor.nome, cell: (r: EmendaItem) => <Link className="link" to={`/autor/${encodeURIComponent(r.autor.codigo)}`}>{r.autor.nome}</Link> }] : []),
    ...(showLocal ? [{ key: "localidade", header: "Local", sort: true, cell: (r: EmendaItem) => (r.ibge ? <Link className="link" to={`/municipio/${r.ibge}`}>{r.localidade}</Link> : r.localidade || "—") }] : []),
    { key: "funcao", header: "Função", sort: true, tip: "função orçamentária" },
    { key: "acao", header: "Ação", sort: true, tip: "ação orçamentária", className: "min-w-56 text-muted", csv: (r) => r.acao },
    money<EmendaItem>("empenhado", "Empenhado", (r) => r.empenhado, "empenhado"),
    money<EmendaItem>("liquidado", "Liquidado", (r) => r.liquidado, "liquidado"),
    money<EmendaItem>("pago", "Pago", (r) => r.pago, "pago"),
    money<EmendaItem>("rapPago", "RAP pago", (r) => r.rapPago, "restos a pagar"),
  ];
  return (
    <DataTable
      rows={rows}
      columns={cols}
      exportName={exportName}
      initialSort={{ key: "pago", dir: "desc" }}
      search={(r) => `${r.codigo} ${r.numero} ${r.autor.nome} ${r.funcao} ${r.subfuncao} ${r.programa} ${r.acao} ${r.localidade} ${r.ano} ${r.tipoOriginal}`}
      searchPlaceholder="Filtrar por autor, ação, função, código…"
      rowKey={(r) => `${r.codigo}-${r.ano}-${r.acao}`}
      caption="Emendas"
      empty="Nenhuma emenda encontrada."
    />
  );
}

export type FavorecidoExt = Favorecido & { naturezaJuridica?: string; uf?: string; municipio?: string };

export function FavorecidosTable({ rows, exportName }: { rows: FavorecidoExt[]; exportName: string }) {
  const cols: Column<FavorecidoExt>[] = [
    { key: "nome", header: "Favorecido", sort: true, tip: "favorecido", className: "min-w-56 font-medium" },
    {
      key: "documento", header: "CNPJ / CPF", sort: true, tip: "CNPJ",
      cell: (r) => (isCNPJ(r.documento)
        ? <ExternalLink href={externo.cnpj(r.documento)}><span className="tabular">{formatDocumento(r.documento)}</span></ExternalLink>
        : <span className="tabular text-muted" title="CPF mascarado pela fonte">{r.documento || "—"}</span>),
      csv: (r) => formatDocumento(r.documento),
    },
    { key: "tipo", header: "Tipo", sort: true },
    { key: "naturezaJuridica", header: "Natureza jurídica", sort: true, tip: "natureza jurídica", cell: (r) => r.naturezaJuridica || "—" },
    money<FavorecidoExt>("valor", "Recebido", (r) => r.valor, "pago"),
  ];
  return (
    <DataTable rows={rows} columns={cols} exportName={exportName} initialSort={{ key: "valor", dir: "desc" }}
      search={(r) => `${r.nome} ${r.documento} ${r.tipo} ${r.naturezaJuridica ?? ""}`} searchPlaceholder="Filtrar favorecidos…" empty="Nenhum favorecido informado." />
  );
}

export function AutoresTable({ rows, exportName }: { rows: AutorResumo[]; exportName: string }) {
  const cols: Column<AutorResumo>[] = [
    { key: "nome", header: "Autor", sort: true, cell: (r) => <Link className="link font-medium" to={`/autor/${encodeURIComponent(r.codigo)}`}>{r.nome}</Link> },
    { key: "n", header: "Emendas", sort: true, align: "right" },
    money<AutorResumo>("empenhado", "Empenhado", (r) => r.empenhado, "empenhado"),
    money<AutorResumo>("pago", "Pago", (r) => r.pago, "pago"),
  ];
  return <DataTable rows={rows} columns={cols} exportName={exportName} initialSort={{ key: "pago", dir: "desc" }} search={(r) => r.nome} searchPlaceholder="Filtrar autores…" />;
}

export function MunicipiosTable({ rows, exportName }: { rows: MunicipioResumo[]; exportName: string }) {
  const cols: Column<MunicipioResumo>[] = [
    { key: "nome", header: "Município", sort: true, cell: (r) => <Link className="link font-medium" to={`/municipio/${r.ibge}`}>{r.nome}</Link> },
    { key: "ibge", header: "Cód. IBGE", sort: true, tip: "código IBGE", cell: (r) => <span className="tabular text-muted">{r.ibge}</span> },
    { key: "n", header: "Emendas", sort: true, align: "right" },
    money<MunicipioResumo>("empenhado", "Empenhado", (r) => r.empenhado, "empenhado"),
    money<MunicipioResumo>("liquidado", "Liquidado", (r) => r.liquidado, "liquidado"),
    money<MunicipioResumo>("pago", "Pago", (r) => r.pago, "pago"),
  ];
  return <DataTable rows={rows} columns={cols} exportName={exportName} initialSort={{ key: "pago", dir: "desc" }} search={(r) => `${r.nome} ${r.ibge}`} searchPlaceholder="Filtrar municípios…" />;
}

export type Convenio = { numero: string; objeto?: string; situacao?: string; valor?: number; inicio?: string; fim?: string; convenente?: string };
export function ConveniosTable({ rows, exportName }: { rows: Convenio[]; exportName: string }) {
  const cols: Column<Convenio>[] = [
    { key: "numero", header: "Nº", sort: true },
    { key: "objeto", header: "Objeto", sort: true, className: "min-w-64" },
    { key: "convenente", header: "Convenente", sort: true },
    { key: "situacao", header: "Situação", sort: true },
    { key: "inicio", header: "Início", sort: true },
    { key: "fim", header: "Fim", sort: true },
    money<Convenio>("valor", "Valor", (r) => r.valor ?? 0),
  ];
  return <DataTable rows={rows} columns={cols} exportName={exportName} search={(r) => `${r.numero} ${r.objeto ?? ""} ${r.convenente ?? ""}`} />;
}
