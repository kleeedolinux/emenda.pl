import { createBrowserRouter } from "react-router";
import { AppShell } from "@/ui/AppShell";
import { comRecarga } from "@/lib/chunkReload";
import { ErroRota } from "@/pages/ErroRota";

// Cada página é carregada sob demanda (code-splitting por rota).
const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await comRecarga(load)).default });

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <ErroRota />,
    children: [
      { index: true, lazy: page(() => import("@/pages/Home")) },
      // Geografia e dinheiro (agente: geo)
      { path: "uf/:uf", lazy: page(() => import("@/pages/UfPage")) },
      { path: "municipio/:ibge", lazy: page(() => import("@/pages/MunicipioPage")) },
      { path: "autor/:codigo", lazy: page(() => import("@/pages/AutorPage")) },
      { path: "dinheiro", lazy: page(() => import("@/pages/DinheiroPage")) },
      { path: "busca", lazy: page(() => import("@/pages/BuscaPage")) },
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
      { path: "pix", lazy: page(() => import("@/pages/PixPage")) },
      { path: "empresas-contratadas", lazy: page(() => import("@/pages/ContratadasPage")) },
      { path: "quem-recebe", lazy: page(() => import("@/pages/QuemRecebePage")) },
      { path: "orcamento-secreto", lazy: page(() => import("@/pages/OrcamentoSecretoPage")) },
      { path: "ultimas", lazy: page(() => import("@/pages/UltimasPage")) },
      { path: "entenda", lazy: page(() => import("@/pages/EntendaPage")) },
      { path: "entenda/:tema", lazy: page(() => import("@/pages/EntendaPage")) },
      { path: "api", lazy: page(() => import("@/pages/ApiDocsPage")) },
      { path: "bancadas", lazy: page(() => import("@/pages/BancadasPage")) },
      { path: "bancada/:id", lazy: page(() => import("@/pages/BancadaPage")) },
      { path: "auditar", lazy: page(() => import("@/pages/AuditarPage")) },
      { path: "auditar/:casa/:id", lazy: page(() => import("@/pages/AuditarPage")) },
      { path: "comissoes", lazy: page(() => import("@/pages/ComissoesPage")) },
      { path: "comissao/:id", lazy: page(() => import("@/pages/ComissaoPage")) },
      { path: "federacoes", lazy: page(() => import("@/pages/FederacoesPage")) },
      { path: "federacao/:id", lazy: page(() => import("@/pages/FederacaoPage")) },
      { path: "novidades", lazy: page(() => import("@/pages/NovidadesPage")) },
      { path: "congresso", lazy: page(() => import("@/pages/CongressoPage")) },
      { path: "stf", lazy: page(() => import("@/pages/StfPage")) },
      { path: "stf/ministro/:slug", lazy: page(() => import("@/pages/StfMinistroPage")) },
      { path: "stf/processo/:classe/:numero", lazy: page(() => import("@/pages/StfProcessoPage")) },
      { path: "agenda", lazy: page(() => import("@/pages/AgendaPage")) },
      { path: "sobre", lazy: page(() => import("@/pages/SobrePage")) },
      { path: "*", lazy: page(() => import("@/pages/NotFound")) },
    ],
  },
]);
