import { createBrowserRouter } from "react-router";
import { AppShell } from "@/ui/AppShell";

// Cada página é carregada sob demanda (code-splitting por rota).
const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default });

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, lazy: page(() => import("@/pages/Home")) },
      // Geografia e dinheiro (agente: geo)
      { path: "uf/:uf", lazy: page(() => import("@/pages/UfPage")) },
      { path: "municipio/:ibge", lazy: page(() => import("@/pages/MunicipioPage")) },
      { path: "autor/:codigo", lazy: page(() => import("@/pages/AutorPage")) },
      { path: "dinheiro", lazy: page(() => import("@/pages/DinheiroPage")) },
      { path: "emendas", lazy: page(() => import("@/pages/EmendasPage")) },
      // Legislativo (agente: legislativo)
      { path: "deputados", lazy: page(() => import("@/pages/DeputadosPage")) },
      { path: "deputado/:id", lazy: page(() => import("@/pages/DeputadoPage")) },
      { path: "senadores", lazy: page(() => import("@/pages/SenadoresPage")) },
      { path: "senador/:id", lazy: page(() => import("@/pages/SenadorPage")) },
      { path: "estaduais", lazy: page(() => import("@/pages/EstaduaisPage")) },
      { path: "proposicoes", lazy: page(() => import("@/pages/ProposicoesPage")) },
      { path: "proposicao/:id", lazy: page(() => import("@/pages/ProposicaoPage")) },
      { path: "votacao/:id", lazy: page(() => import("@/pages/VotacaoPage")) },
      { path: "partidos", lazy: page(() => import("@/pages/PartidosPage")) },
      { path: "partido/:sigla", lazy: page(() => import("@/pages/PartidoPage")) },
      { path: "sobre", lazy: page(() => import("@/pages/SobrePage")) },
      { path: "*", lazy: page(() => import("@/pages/NotFound")) },
    ],
  },
]);
