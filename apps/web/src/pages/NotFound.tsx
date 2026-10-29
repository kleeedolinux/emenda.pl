import { Compass } from "lucide-react";
import { ButtonLink } from "@/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-20 text-center">
      <Compass className="mb-4 size-14 text-accent" aria-hidden />
      <p className="font-display text-6xl font-bold tabular">404</p>
      <h1 className="mt-2 text-2xl font-bold">Página não encontrada</h1>
      <p className="mt-2 text-muted">O endereço pode estar errado, ou o dado ainda não foi publicado. Tente a busca (Ctrl+K) ou volte ao início.</p>
      <div className="mt-6 flex gap-2"><ButtonLink to="/" primary>Ir para o início</ButtonLink><ButtonLink to="/emendas">Ver todo o dinheiro</ButtonLink></div>
    </div>
  );
}
