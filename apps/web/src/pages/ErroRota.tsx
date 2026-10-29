// errorElement da raiz: qualquer erro de página vira mensagem simples (sem pilha técnica nem rolagem lateral).
import { isRouteErrorResponse, useRouteError } from "react-router";

export function ErroRota() {
  const erro = useRouteError();
  const naoAchou = isRouteErrorResponse(erro) && erro.status === 404;
  if (!naoAchou && erro) console.error(erro);
  return (
    <main className="grid min-h-dvh place-items-center overflow-x-hidden bg-bg px-4 py-10 text-fg">
      <div className="w-full max-w-md text-center">
        <p className="text-5xl" aria-hidden>{naoAchou ? "🔎" : "😕"}</p>
        <h1 className="mt-4 font-display text-2xl font-bold text-balance">{naoAchou ? "Página não encontrada" : "Algo deu errado nesta página"}</h1>
        <p className="mt-2 text-muted text-pretty">
          {naoAchou ? "O endereço pode ter mudado ou estar incompleto." : "Não foi culpa sua. Tente de novo; se continuar, volte ao início e procure de outro jeito."}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {!naoAchou && (
            <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-xl bg-verde-700 px-5 font-semibold text-white hover:bg-[#005c23]">
              Tentar de novo
            </button>
          )}
          <a href="/" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-5 font-semibold hover:bg-surface-2">Voltar ao início</a>
        </div>
      </div>
    </main>
  );
}
