// Peças visuais das comissões (compostas com "@/ui").
import clsx from "clsx";
import { CalendarClock, Users } from "lucide-react";
import { Link } from "react-router";
import { Avatar, Badge, PartyBadge, Skeleton, formatNumber } from "@/ui";
import { AutoLink } from "@/features/links";
import { presidenteDe, type Membro } from "./api";
import { oQueFaz, type CasaComissao, type TipoComissao } from "./catalogo";
import { useComissaoSenado, useMembrosCamara, useNaTela } from "./hooks";

export const ROTULO_TIPO: Record<TipoComissao, string> = {
  permanente: "Permanentes", cpi: "CPIs e CPMIs", especial: "Especiais", mista: "Mistas (Câmara + Senado)", temporaria: "Temporárias e externas",
};
export const DICA_TIPO: Record<TipoComissao, string> = {
  permanente: "Existem sempre e analisam propostas por tema (saúde, educação, orçamento…).",
  cpi: "Comissões Parlamentares de Inquérito: investigam um fato determinado, por prazo certo, com poderes de investigação próprios de autoridades judiciais (Constituição, art. 58, § 3º).",
  especial: "Criadas para dar parecer sobre uma proposta específica (como uma PEC) ou um tema; acabam quando cumprem a tarefa.",
  mista: "Formadas por deputados e senadores. A mais conhecida é a CMO, que analisa o Orçamento e as emendas parlamentares.",
  temporaria: "Criadas por prazo certo para acompanhar um tema ou fazer diligências.",
};
export const ROTULO_CASA: Record<CasaComissao, string> = { camara: "Câmara dos Deputados", senado: "Senado Federal", cn: "Congresso Nacional" };

const dataHora = (s: string) => {
  const d = new Date(s.length <= 16 ? `${s}:00-03:00` : s);
  return Number.isNaN(+d) ? s : d.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
};
export { dataHora };

export interface ItemHub {
  key: string; href: string; casa: CasaComissao; tipo: TipoComissao; sigla: string; nome: string;
  camaraId?: number; senadoCodigo?: number; /** nome oficial longo (para o "o que faz") quando `nome` é o apelido */ nomeOficial?: string; proxima?: { data: string; rotulo: string } | null;
}

/** Cartão do hub: busca presidente e composição só quando aparece na tela. */
export function CardComissao({ c, destaque }: { c: ItemHub; destaque?: boolean }) {
  const [ref, visto] = useNaTela<HTMLLIElement>();
  const camaraId = c.casa === "camara" ? c.camaraId ?? null : null;
  const senadoCodigo = c.casa !== "camara" ? c.senadoCodigo ?? null : null;
  const mc = useMembrosCamara(camaraId, visto);
  const ms = useComissaoSenado(senadoCodigo, visto);
  const membros: Membro[] | undefined = camaraId ? mc.data : ms.data?.membros;
  const pres = membros ? presidenteDe(membros) ?? (ms.data?.cargos.find((x) => x.cargo?.startsWith("Presidente")) ?? null) : null;
  const carregando = (camaraId ? mc.isPending : ms.isPending) && visto;
  const titulares = membros?.filter((m) => m.titular).length;
  return (
    <li ref={ref} className={clsx("card relative flex min-w-0 flex-col p-4 transition hover:shadow-[0_0_0_1px_var(--color-accent)]", destaque && "ring-2 ring-amarelo")}>
      <div className="flex items-start gap-2">
        <Badge tone={c.casa === "senado" ? "azul" : c.casa === "cn" ? "amarelo" : "verde"} className="shrink-0">{c.sigla}</Badge>
        <Link to={c.href} className="min-w-0 font-semibold leading-snug line-clamp-3 hover:underline after:absolute after:inset-0 after:content-['']">{c.nome}</Link>
      </div>
      <p className="mt-2 line-clamp-3 text-sm text-muted">{oQueFaz({ sigla: c.sigla, nome: c.nomeOficial ?? c.nome }, c.casa === "senado" ? "senado" : "camara")}</p>
      <div className="mt-auto space-y-1.5 pt-3 text-xs text-muted">
        {carregando ? <Skeleton className="h-7 w-40" /> : pres ? (
          <p className="flex items-center gap-2">
            <Avatar src={pres.foto} name={pres.nome} size="sm" />
            <span className="min-w-0"><span className="block truncate font-medium text-fg">{pres.nome}</span><span className="flex items-center gap-1">Presidente {pres.partido && <span className="relative z-10"><PartyBadge sigla={pres.partido} /></span>}{pres.uf}</span></span>
          </p>
        ) : visto && membros ? <p>Presidência não informada na fonte.</p> : null}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {titulares != null && <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden />{formatNumber(titulares)} titulares{membros && membros.length > titulares ? ` · ${formatNumber(membros.length - titulares)} suplentes` : ""}</span>}
          {c.proxima ? <span className="inline-flex items-center gap-1 text-fg"><CalendarClock className="size-3.5 text-accent" aria-hidden />{dataHora(c.proxima.data)}</span> : null}
        </p>
      </div>
    </li>
  );
}

/** Cartão de membro: foto, nome, partido, UF, cargo. */
export function CardMembro({ m }: { m: Membro }) {
  const nome = m.href ? <Link className="link block truncate font-medium" to={m.href}>{m.nome}</Link> : <span className="block truncate font-medium">{m.nome}</span>;
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-xl border border-line p-2.5">
      <Avatar src={m.foto} name={m.nome} size="md" />
      <span className="min-w-0 flex-1">
        {nome}
        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">
          {m.partido && <PartyBadge sigla={m.partido} />}{m.uf}
          {m.cargo ? <Badge tone="amarelo">{m.cargo}</Badge> : <span>· {m.titular ? "titular" : "suplente"}</span>}
          {m.casa === "senado" && <Badge tone="azul">Senado</Badge>}
        </span>
      </span>
    </li>
  );
}

/** Texto curto que pode citar proposições/leis: vira links. */
export function TextoLinkado({ texto, casa, className }: { texto: string; casa?: "camara" | "senado"; className?: string }) {
  return <AutoLink text={texto} casa={casa} className={className} />;
}
