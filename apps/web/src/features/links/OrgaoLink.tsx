// Sigla/nome de órgão (tramitação, evento, votação, perfil) -> link para /comissao/:id, com cartão.
import type { ReactNode } from "react";
import { hrefOrgao, porSigla } from "@/features/comissoes/catalogo";
import { EntityLink } from "./AutoLink";

export function OrgaoLink({ sigla, uri, nome, children, className }: {
  sigla: string; uri?: string | number | null; nome?: string | null; children?: ReactNode; className?: string;
}) {
  const href = hrefOrgao(sigla, uri);
  if (!href) return <>{children ?? sigla}</>;
  const c = porSigla(sigla, "camara");
  const cat = c && c.casa !== "senado" ? c : null;
  return (
    <EntityLink className={className} e={{ tipo: "comissao", href, titulo: cat ? `${cat.sigla} — ${cat.nome}` : nome ? `${sigla} — ${nome}` : sigla, descricao: cat?.oQueFaz ?? "Composição, reuniões e votações do colegiado." }}>
      {children ?? sigla}
    </EntityLink>
  );
}
