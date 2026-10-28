import { AnimatePresence, motion } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { sendHit, setConsent, useConsent, useStats } from "@/lib/analytics";
import { formatNumber } from "@/lib/format";

/** Envia hit anônimo a cada mudança de rota. */
export function usePageHits() {
  const { pathname } = useLocation();
  const consent = useConsent();
  useEffect(() => { if (consent !== "recusado") sendHit(pathname); }, [pathname, consent]);
}

/** Aviso LGPD discreto (canto inferior). */
export function ConsentBanner() {
  const consent = useConsent();
  return (
    <AnimatePresence>
      {consent === null && (
        <motion.div
          role="region"
          aria-label="Aviso de privacidade"
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
          className="fixed inset-x-3 bottom-20 z-[70] lg:bottom-4 mx-auto max-w-xl rounded-2xl border border-line glass p-4 shadow-2xl sm:left-auto sm:right-4 sm:mx-0"
        >
          <p className="flex gap-2 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>Contamos visitas de forma <b>anônima</b>, sem terceiros nem anúncios, para mostrar a audiência pública do projeto (LGPD). Você pode recusar.</span>
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setConsent("recusado")} className="rounded-xl border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">Recusar</button>
            <button type="button" onClick={() => setConsent("aceito")} className="rounded-xl bg-verde px-3 py-1.5 text-sm font-semibold text-white hover:bg-verde-700">Aceitar</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** "X pessoas online agora" ao vivo. Some se a API não responder. */
export function OnlinePill({ className = "" }: { className?: string }) {
  const s = useStats();
  if (!s.data) return null;
  const n = s.data.online;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted ${className}`} aria-live="polite">
      <span className="relative flex size-2" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-verde opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-verde" />
      </span>
      <span className="tabular text-fg">{formatNumber(n)}</span> {n === 1 ? "pessoa online" : "pessoas online"}
    </span>
  );
}

