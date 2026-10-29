// Diálogo da busca universal (Ctrl/⌘+K, botão do cabeçalho). Tela cheia no celular.
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { openSearch } from "@/ui/SearchDialog";
import { BuscaUniversal, type ModoBusca } from "./BuscaUniversal";

let modoPendente: ModoBusca = "tudo";
/** Abre a busca global já num modo (ex.: "cidade") e com texto. */
export function abrirBusca(q = "", modo: ModoBusca = "tudo") {
  modoPendente = modo;
  openSearch(q);
}

export function BuscaDialog({ open, onOpenChange, initialQuery = "" }: { open: boolean; onOpenChange: (o: boolean) => void; initialQuery?: string }) {
  const modo = modoPendente;
  return (
    <D.Root open={open} onOpenChange={(o) => { if (!o) modoPendente = "tudo"; onOpenChange(o); }}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm" />
        <D.Content aria-describedby={undefined}
          className="fixed inset-0 z-[95] flex flex-col bg-surface pt-[env(safe-area-inset-top)] sm:inset-auto sm:left-1/2 sm:top-[8vh] sm:w-[calc(100%-2rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:border-line sm:shadow-2xl">
          <div className="flex items-center justify-between px-4 pt-3">
            <D.Title className="font-display text-base font-bold">O que você quer ver?</D.Title>
            <D.Close className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Fechar"><X className="size-5" /></D.Close>
          </div>
          {open && <BuscaUniversal key={`${modo}:${initialQuery}`} variante="painel" modoInicial={modo} consultaInicial={initialQuery} autoFocus onIr={() => onOpenChange(false)} className="flex min-h-0 flex-1 flex-col p-3 pt-2" />}
          <p className="hidden border-t border-line px-4 py-2 text-[11px] text-muted sm:block">↑↓ escolher · Enter abrir · Esc fechar</p>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
