// "No que foi gasto": áreas em palavras simples, com ícone e barra proporcional.
import { Building2, Bus, GraduationCap, HandHeart, HeartPulse, HelpCircle, Palette, Shield, Trees, Trophy, Wheat, CircleDot, type LucideIcon } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { Tip } from "@/ui/Tip";
import { porArea, type IconeArea } from "./linguagem";
import { ListaVerMais } from "./VerMais";

const ICONE: Record<IconeArea, LucideIcon> = {
  saude: HeartPulse, educacao: GraduationCap, obras: Building2, campo: Wheat, social: HandHeart, seguranca: Shield,
  esporte: Trophy, cultura: Palette, transporte: Bus, ambiente: Trees, semArea: HelpCircle, outro: CircleDot,
};

export function AreasGasto({ itens, inicial = 5 }: { itens: ReadonlyArray<{ funcao: string; valor: number }>; inicial?: number }) {
  const areas = porArea(itens);
  const total = areas.reduce((s, a) => s + a.valor, 0);
  return (
    <ListaVerMais itens={areas} inicial={inicial} chave={(a) => a.rotulo} className="grid gap-2.5"
      vazio={<p className="text-sm text-muted">Sem área informada.</p>}
      render={(a) => {
        const Icon = ICONE[a.icone];
        const pct = total ? a.valor / total : 0;
        return (
          <div className="flex items-center gap-3">
            <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${a.icone === "semArea" ? "bg-amarelo/15 text-[#a07800] dark:text-amarelo" : "bg-verde/12 text-accent"}`}><Icon className="size-5" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold">{a.rotulo}{a.icone === "semArea" && <Tip content="Dinheiro mandado sem dizer para quê (Emenda Pix) aparece assim: a prefeitura decide depois como gastar." />}</span>
                <span className="shrink-0 text-sm tabular"><b>{formatBRL(a.valor, true)}</b> <span className="text-muted">· {Math.round(pct * 100)}%</span></span>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, pct * 100)}%` }} /></span>
            </span>
          </div>
        );
      }}
    />
  );
}
