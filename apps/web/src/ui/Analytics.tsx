import { AnimatePresence, motion } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router";
import { dntAtivo, sendHit, sendPing, setAviso, shouldTrack, useAviso, useStats } from "@/lib/analytics";
import { formatNumber } from "@/lib/format";

/** Envia hit anônimo a cada mudança de rota (para com opt-out ou DNT/GPC). */
export function usePageHits() {
  const { pathname } = useLocation();
  const aviso = useAviso();
  useEffect(() => { if (aviso !== "desativado") sendHit(pathname); }, [pathname, aviso]);
  useEffect(() => {
    if (aviso === "desativado") return;
    const id = setInterval(() => { if (document.visibilityState === "visible") sendPing(pathname); }, 60_000);
    return () => clearInterval(id);
  }, [pathname, aviso]);
}

const noop = () => () => {};
const useDnt = () => useSyncExternalStore(noop, dntAtivo, () => false);

/** Aviso LGPD informativo e não bloqueante (legítimo interesse, art. 7º, IX). */
export function AvisoPrivacidade() {
  const aviso = useAviso();
  const dnt = useDnt();
  return (
    <AnimatePresence>
      {aviso === null && !dnt && (
        <motion.div
          role="region"
          aria-label="Aviso de privacidade"
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
          className="fixed inset-x-3 bottom-20 z-[70] mx-auto max-w-xl rounded-2xl border border-line glass p-4 shadow-2xl sm:left-auto sm:right-4 sm:mx-0 lg:bottom-4"
        >
          <p className="flex gap-2 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>Usamos um cookie anônimo de audiência (sem IP, contagem agregada), com base no legítimo interesse (LGPD art. 7º, IX).</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <Link to="/sobre#privacidade" className="link mr-auto text-sm">Saiba mais</Link>
            <button type="button" onClick={() => setAviso("desativado")} className="rounded-xl border border-line px-3 py-1.5 text-sm font-medium transition hover:bg-surface-2 active:scale-[0.97]">Desativar</button>
            <button type="button" onClick={() => setAviso("ciente")} className="rounded-xl bg-verde-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#005c23] active:scale-[0.97]">Entendi</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
/** @deprecated nome antigo; use `AvisoPrivacidade`. */
export const ConsentBanner = AvisoPrivacidade;

/** Estado atual da medição + botão para desativar/reativar (página /sobre#privacidade). */
export function PrivacidadeControle() {
  const aviso = useAviso();
  const dnt = useDnt();
  const ativo = shouldTrack({ aviso, dnt });
  return (
    <div className="flex flex-wrap items-center gap-3" aria-live="polite">
      <span className="inline-flex items-center gap-2 text-sm font-medium">
        <span className={`size-2 rounded-full ${ativo ? "bg-verde" : "bg-muted"}`} aria-hidden />
        {dnt ? "Desativada pelo seu navegador (Do Not Track / GPC)." : ativo ? "Medição de audiência ativa neste navegador." : "Medição de audiência desativada neste navegador."}
      </span>
      {!dnt && (
        <button
          type="button"
          onClick={() => setAviso(ativo ? "desativado" : "ciente")}
          className="rounded-xl border border-line px-3 py-1.5 text-sm font-semibold transition hover:bg-surface-2 active:scale-[0.97]"
        >
          {ativo ? "Desativar" : "Reativar"}
        </button>
      )}
    </div>
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

