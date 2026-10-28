// /votacao/:id?dep=:depId — destaca como um deputado votou, com atalho para compartilhar.
import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router";
import { Avatar, PartyBadge, VoteBadge } from "@/ui";
import { votoShare } from "./voto";
import { ShareButton } from "./ShareButton";

interface Voto { tipoVoto: string; deputado_: { id: number; nome: string; siglaPartido: string; siglaUf: string; urlFoto?: string } }

export function VotoDestaque({ votacaoId, titulo, votos, placar }: { votacaoId: string; titulo: string; votos: Voto[]; placar?: { sim: number; nao: number; outros: number } }) {
  const dep = Number(useSearchParams()[0].get("dep"));
  const v = dep ? votos.find((x) => x.deputado_.id === dep) : undefined;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (v) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [v]);
  if (!dep || !votos.length) return null;
  if (!v) return <p className="mb-6 rounded-2xl border border-line bg-surface-2 p-4 text-sm">Este deputado não tem voto registrado nesta votação.</p>;
  const p = v.deputado_;
  return (
    <section ref={ref} aria-label="Voto em destaque" className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border-2 border-amarelo bg-surface p-4 shadow-[0_0_0_6px_rgb(255_223_0/0.15)]">
      <Avatar src={p.urlFoto} name={p.nome} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Como votou</p>
        <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
          <Link className="hover:underline" to={`/deputado/${p.id}`}>{p.nome}</Link>
          <PartyBadge sigla={p.siglaPartido} /><span className="text-sm text-muted">{p.siglaUf}</span>
          <VoteBadge voto={v.tipoVoto} />
        </p>
      </div>
      <ShareButton {...votoShare({ votacaoId, titulo, voto: v.tipoVoto, deputado: p, placar })} label="Compartilhar voto" />
    </section>
  );
}

/** Ícone por linha da tabela de votos. */
export function ShareVoto({ votacaoId, titulo, v, placar }: { votacaoId: string; titulo: string; v: Voto; placar?: { sim: number; nao: number; outros: number } }) {
  return <ShareButton compact label="Compartilhar voto" {...votoShare({ votacaoId, titulo, voto: v.tipoVoto, deputado: v.deputado_, placar })} />;
}
