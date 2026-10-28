import { useId, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "@/ui";

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      toast("Copiado");
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
    } catch {
      toast("Não foi possível copiar");
    }
  };
  return { copied, copy };
}

export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(text)}
      aria-label={`Copiar ${label}`}
      title={`Copiar ${label}`}
      className={`rounded-md border border-line bg-surface p-1.5 text-muted hover:text-fg ${className ?? ""}`}
    >
      {copied === text ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
    </button>
  );
}

export function Code({ text, label }: { text: string; label: string }) {
  return (
    <div className="relative">
      <pre className="max-h-[32rem] overflow-auto rounded-lg border border-line bg-surface-2 p-3 pr-12 text-xs leading-relaxed"><code>{text}</code></pre>
      <CopyButton text={text} label={label} className="absolute right-2 top-2" />
    </div>
  );
}

/** Abas locais (sem ?tab=): várias por página. */
export function CodeTabs({ tabs, label }: { tabs: Array<{ id: string; titulo: ReactNode; texto: string }>; label: string }) {
  const [cur, setCur] = useState(tabs[0]?.id ?? "");
  const base = useId();
  const ativo = tabs.find((t) => t.id === cur) ?? tabs[0];
  if (!ativo) return null;
  return (
    <div>
      <div role="tablist" aria-label={label} className="mb-1.5 flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${base}-${t.id}`}
            aria-selected={t.id === ativo.id}
            aria-controls={`${base}-painel`}
            onClick={() => setCur(t.id)}
            className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold ${t.id === ativo.id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`}
          >
            {t.titulo}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-painel`} aria-labelledby={`${base}-${ativo.id}`}>
        <Code text={ativo.texto} label={`${label}: ${ativo.id}`} />
      </div>
    </div>
  );
}
