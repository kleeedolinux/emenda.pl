// PageHeader com o texto da tabela de cabeçalhos (linguagem comum + rótulo "Oficialmente:").
import type { ComponentProps, ReactNode } from "react";
import { PageHeader } from "@/ui";
import type { Cabecalho } from "./cabecalhos";

export function CabecalhoPagina({ c, extra, ...p }: { c: Cabecalho; extra?: ReactNode } & Omit<ComponentProps<typeof PageHeader>, "title" | "subtitle">) {
  return (
    <PageHeader {...p} title={c.titulo}
      subtitle={<>{c.subtitulo}{extra}{c.oficial && <span className="mt-1.5 block text-xs text-muted">{c.oficial}</span>}</>} />
  );
}
