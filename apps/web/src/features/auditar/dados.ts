// Coleta dos dados do boletim (Câmara, Senado, Portal da Transparência, CEAP). Normaliza as duas casas.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { gastosPath, type Autor, type GastosParlamentarData, type GastosRanking } from "@emenda/contracts";
import { camara, fetchJson, useApi, useCamara } from "@/lib/data";
import {
  arr, cam, encontrarAutor, fontes, lastPage, mapSenadorDetalhe, qs, sen, anosEntre,
  type DeputadoDetalhe, type Fonte, type Frente, type HistoricoDeputado, type Pagina, type ProcessoSenado, type ProposicaoDetalhe, type ProposicaoLista,
  type SenadorDetalhe, type VotacaoLista, type VotacaoSenado,
} from "@/features/legislativo/api";
import { camaraTodas, useAutor, useAutores, useCamaraPagina, useLegislaturas, useSenado } from "@/features/legislativo/hooks";
import { dentro, hojeISO, mandatosCamara, periodosSenado, trimestres, type Mandato, type MandatoSenadoRaw, type Periodo } from "@/features/legislativo/mandatos";
import { placarDaDescricao, type Orientacao, type VotoCamara } from "@/features/legislativo/votacao";
import { enriquecerVotos } from "@/features/legislativo/painelVotos";
import { trocasCamara, trocasSenado, type Troca } from "@/features/perfil/resumo";
import { pautasSenador, usePautasDeputado, type VotoPauta } from "@/features/perfil/Pautas";
import { emLotes } from "@/features/bancadas/hooks";
import {
  alinhamento, classificarProcessoSenado, classificarSituacao, comparaGastos, emendasIndicadores, presenca, presencaSenado, producao,
  TIPOS_CAMARA, TIPOS_SENADO, type Alinhamento, type CasaParam, type CompGastos, type IndEmendas, type Indicadores, type Presenca, type PresencaSenado, type Producao,
} from "./regras";

const DIA = 86_400_000;
/** Votações nominais recentes analisadas para presença e orientação (Câmara). */
export const AMOSTRA_VOTOS = 25;
/** Proposições que mudam leis com situação consultada uma a uma (Câmara). */
export const AMOSTRA_PROPOSICOES = 80;

export interface Secao<T> { valor: T | null; carregando: boolean; fontes: Fonte[]; nota?: string }

export interface Boletim {
  casa: CasaParam;
  id: string;
  nome: string;
  nomeCivil: string | null;
  foto: string | null;
  partido: string;
  uf: string;
  sexo: "M" | "F" | "";
  emExercicio: boolean | null;
  carregando: boolean;
  erro: Error | null;
  mandatos: Mandato[];
  trocas: Secao<Troca[]>;
  producao: Secao<{ resumo: Producao; totalGeral: number | null; analisadas: number; universo: number }>;
  presenca: Secao<Presenca | PresencaSenado>;
  alinhamento: Secao<Alinhamento>;
  pautas: { itens: VotoPauta[]; carregando: boolean };
  emendas: Secao<{ autor: Autor; ind: IndEmendas }> & { semCorrespondencia: boolean };
  gastos: Secao<{ arquivo: GastosParlamentarData | null; comp: CompGastos | null }>;
  frentes: Secao<Frente[]>;
  fontes: Fonte[];
}

export function indicadoresDe(b: Boletim): Indicadores {
  return {
    casa: b.casa === "deputado" ? "camara" : "senado",
    trocas: b.trocas.valor ? b.trocas.valor.length : null,
    presenca: b.presenca.valor,
    alinhamento: b.alinhamento.valor,
    emendas: b.emendas.valor?.ind ?? (b.emendas.semCorrespondencia ? { pago: 0, pctPix: 0, pctForaUf: null } : null),
    gastos: b.gastos.valor?.comp ?? null,
  };
}

const ok = <T,>(valor: T | null | undefined, carregando: boolean, fs: Fonte[], nota?: string): Secao<T> => ({ valor: valor ?? null, carregando, fontes: fs, nota });

function useEmendas(nomes: Array<string | null | undefined>, uf: string, pronto: boolean) {
  const autores = useAutores();
  const autor = pronto && autores.data ? encontrarAutor(autores.data.idx, nomes) : null;
  const det = useAutor(autor?.codigo);
  const ind = useMemo(() => (det.data ? emendasIndicadores(det.data.emendas, uf) : null), [det.data, uf]);
  const sem = pronto && !!autores.data && !autor;
  return {
    ...ok(det.data && ind ? { autor: det.data, ind } : null, autores.isPending || (!!autor && det.isPending), [
      ...fontes.emendas(), ...(autor ? [{ label: "Emendas do autor (JSON)", href: `/data/v1/autor/${autor.codigo}.json` }] : []),
    ]),
    semCorrespondencia: sem,
  };
}

function useGastos(kind: "deputado" | "senador", id: string) {
  const arquivo = useApi<GastosParlamentarData>(gastosPath.parlamentar(kind, id));
  const ranking = useApi<GastosRanking>(gastosPath.ranking());
  const comp = useMemo(() => (ranking.data ? comparaGastos(ranking.data, kind === "deputado" ? "camara" : "senado", id) : null), [ranking.data, kind, id]);
  return ok(ranking.data || arquivo.data ? { arquivo: arquivo.data ?? null, comp } : null, ranking.isPending || arquivo.isPending, [
    { label: "Gastos do parlamentar (JSON)", href: gastosPath.parlamentar(kind, id) },
    { label: "Ranking da cota (JSON)", href: gastosPath.ranking() },
    kind === "deputado"
      ? { label: "Cota parlamentar na Câmara", href: `https://www.camara.leg.br/cota-parlamentar/` }
      : { label: "CEAPS no Senado", href: "https://www12.senado.leg.br/transparencia/sen/" },
  ]);
}

// ---------------- Câmara ----------------

interface VotoAmostra { votacao: VotacaoLista; voto: string | null; orientacao: string | null }

/** Últimas votações nominais do plenário dentro dos períodos de exercício: voto do deputado + orientação do partido. */
async function amostraVotosCamara(id: number, periodos: Periodo[], signal: AbortSignal): Promise<VotoAmostra[]> {
  if (!periodos.length) return [];
  const ultimo = periodos[periodos.length - 1]!;
  const ts = trimestres({ inicio: periodos[0]!.inicio, fim: ultimo.fim }).slice(0, 8);
  const escolhidas: VotacaoLista[] = [];
  for (const t of ts) {
    const path = qs("/votacoes", { idOrgao: 180, dataInicio: t.inicio, dataFim: t.fim, itens: 200, ordem: "DESC", ordenarPor: "dataHoraRegistro" });
    const vs = await camara<VotacaoLista[]>(path, signal).catch(() => [] as VotacaoLista[]);
    for (const v of vs) {
      if (!placarDaDescricao(v.descricao)) continue;
      if (!periodos.some((p) => dentro(v.data, p))) continue;
      escolhidas.push(v);
      if (escolhidas.length >= AMOSTRA_VOTOS) break;
    }
    if (escolhidas.length >= AMOSTRA_VOTOS) break;
  }
  const r = await emLotes(escolhidas, 6, async (v): Promise<VotoAmostra | null> => {
    try {
      const [votos, orient] = await Promise.all([
        fetchJson<Pagina<VotoCamara>>(`/api/camara${cam.votos(v.id)}`, signal).then((p) => p.dados),
        camara<Orientacao[]>(cam.orientacoes(v.id), signal).catch(() => [] as Orientacao[]),
      ]);
      const meu = enriquecerVotos(votos.filter((x) => x.deputado_.id === id), orient)[0];
      return { votacao: v, voto: meu ? meu.voto : null, orientacao: meu?.orientacao ?? null };
    } catch (e) {
      if (signal.aborted) throw e;
      return null; // votação com falha na fonte fica fora da amostra
    }
  });
  return r.filter((x): x is VotoAmostra => x !== null);
}

async function producaoCamara(id: number, desde: string, signal: AbortSignal) {
  const anos = anosEntre(desde);
  const path = qs("/proposicoes", { idDeputadoAutor: id, siglaTipo: TIPOS_CAMARA.join(","), ano: anos, ordem: "DESC", ordenarPor: "id" });
  const lista = await camaraTodas<ProposicaoLista>(path, signal);
  const amostra = lista.slice(0, AMOSTRA_PROPOSICOES);
  const det = await emLotes(amostra, 6, (p) => camara<ProposicaoDetalhe>(cam.proposicao(p.id), signal).catch(() => null));
  const itens = amostra.map((p, i) => ({ tipo: p.siglaTipo, desfecho: classificarSituacao(det[i]?.statusProposicao?.descricaoSituacao) }));
  return { resumo: producao(itens), analisadas: amostra.length, universo: lista.length, path };
}

export function useBoletimDeputado(id: number): Boletim {
  const valido = Number.isInteger(id) && id > 0;
  const dep = useCamara<DeputadoDetalhe>(valido ? cam.deputado(id) : null);
  const hist = useCamara<HistoricoDeputado[]>(valido ? cam.historico(id) : null);
  const legs = useLegislaturas();
  const frentes = useCamara<Frente[]>(valido ? cam.frentes(id) : null);
  const mandatos = useMemo(() => (hist.data && legs.data ? mandatosCamara(hist.data, legs.data) : []), [hist.data, legs.data]);
  const periodos = useMemo(() => mandatos.flatMap((m) => m.periodos), [mandatos]);
  const desde = mandatos[0]?.inicio ?? null;
  const s = dep.data?.ultimoStatus;
  const nome = s?.nomeEleitoral || s?.nome || "";
  const uf = s?.siglaUf ?? "";

  const votos = useQuery({
    queryKey: ["auditar-votos", id, periodos.map((p) => p.inicio + p.fim).join()],
    queryFn: ({ signal }) => amostraVotosCamara(id, periodos, signal),
    enabled: valido && periodos.length > 0, staleTime: DIA, retry: 0,
  });
  const prod = useQuery({
    queryKey: ["auditar-producao", id, desde],
    queryFn: ({ signal }) => producaoCamara(id, desde!, signal),
    enabled: valido && !!desde, staleTime: DIA, retry: 0,
  });
  const totalPath = desde ? cam.proposicoesAutor(id, 1, desde, undefined, 1) : null;
  const total = useCamaraPagina<ProposicaoLista>(totalPath);
  const totalGeral = total.data ? (total.data.dados.length ? lastPage(total.data.links) : 0) : null;
  const pautas = usePautasDeputado(valido ? id : -1);
  const emendas = useEmendas([s?.nomeEleitoral, s?.nome, dep.data?.nomeCivil], uf, !!dep.data);
  const gastos = useGastos("deputado", String(id));

  const am = votos.data ?? null;
  const votosPath = qs("/votacoes", { idOrgao: 180, ordem: "DESC", ordenarPor: "dataHoraRegistro" });
  return {
    casa: "deputado", id: String(id), nome, nomeCivil: dep.data?.nomeCivil ?? null, foto: s?.urlFoto ?? null,
    partido: s?.siglaPartido ?? "", uf, sexo: dep.data?.sexo === "F" ? "F" : dep.data?.sexo === "M" ? "M" : "",
    emExercicio: s ? s.situacao === "Exercício" : null,
    carregando: dep.isPending, erro: dep.error ?? null,
    mandatos,
    trocas: ok(hist.data ? trocasCamara(hist.data) : null, hist.isPending, [{ label: "Histórico (API da Câmara)", href: fontes.camaraApi(cam.historico(id)) }]),
    producao: ok(prod.data ? { resumo: prod.data.resumo, totalGeral, analisadas: prod.data.analisadas, universo: prod.data.universo } : null, prod.isPending && !!desde,
      [
        { label: "Projetos do autor (API da Câmara)", href: fontes.camaraApi(prod.data?.path ?? `/proposicoes?idDeputadoAutor=${id}`) },
        ...(totalPath ? [{ label: "Todas as proposições do autor", href: fontes.camaraApi(totalPath) }] : []),
      ],
      `Situação conferida nas ${AMOSTRA_PROPOSICOES} mais recentes de PL, PLP, PEC e PDL (projetos que mudam leis). Inclui coautorias.`),
    presenca: ok(am ? presenca(am.map((x) => x.voto)) : null, votos.isPending && periodos.length > 0, [{ label: "Votações do plenário (API da Câmara)", href: fontes.camaraApi(votosPath) }],
      `Amostra: as ${AMOSTRA_VOTOS} votações nominais mais recentes do plenário em que estava no exercício do mandato.`),
    alinhamento: ok(am ? alinhamento(am.filter((x) => x.voto).map((x) => ({ voto: x.voto!, orientacao: x.orientacao }))) : null, votos.isPending && periodos.length > 0,
      [{ label: "Orientações de bancada (API da Câmara)", href: fontes.camaraApi("/votacoes/{id}/orientacoes") }],
      "Mesma amostra de votações; orientação do líder do partido (ou federação) do deputado na data."),
    pautas: { itens: pautas.itens, carregando: pautas.carregando },
    emendas,
    gastos,
    frentes: ok(frentes.data ? frentes.data.filter((f) => f.idLegislatura === 57) : null, frentes.isPending, [{ label: "Frentes do deputado (API da Câmara)", href: fontes.camaraApi(cam.frentes(id)) }]),
    fontes: fontes.deputado(id),
  };
}

// ---------------- Senado ----------------
type MandatoComPartidos = MandatoSenadoRaw & { Partidos?: { Partido?: unknown } };
interface Filiacao { Sigla: string; DataFiliacao?: string }
const mapMandatos = (j: { MandatoParlamentar?: { Parlamentar?: { Mandatos?: { Mandato?: MandatoComPartidos | MandatoComPartidos[] } } } }) =>
  arr(j.MandatoParlamentar?.Parlamentar?.Mandatos?.Mandato);

export function useBoletimSenador(cod: string): Boletim {
  const valido = /^\d+$/.test(cod);
  const det = useSenado<SenadorDetalhe | null>(valido ? sen.senador(cod) : null, mapSenadorDetalhe);
  const mraw = useSenado<MandatoComPartidos[]>(valido ? sen.mandatos(cod) : null, mapMandatos);
  const mandatos = useMemo(() => periodosSenado(mraw.data ?? []), [mraw.data]);
  const filiacoes = useMemo(() => {
    const vistos = new Set<string>();
    return (mraw.data ?? []).flatMap((x) => arr(x.Partidos?.Partido as Filiacao | Filiacao[]))
      .filter((p) => { const k = `${p.Sigla}${p.DataFiliacao}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
  }, [mraw.data]);
  const hoje = hojeISO();
  const desde = mandatos[0]?.inicio ?? null;
  const atual = mandatos[mandatos.length - 1];
  const fim = atual ? (atual.fim < hoje ? atual.fim : hoje) : hoje;
  const vot = useSenado<VotacaoSenado[]>(valido && desde ? sen.votacoes(cod, desde, fim) : null);
  const aut = useSenado<ProcessoSenado[]>(valido ? sen.autorias(cod) : null);
  const s = det.data ?? null;
  const emendas = useEmendas([s?.nome, s?.nomeCompleto], s?.uf ?? "", !!s);
  const gastos = useGastos("senador", cod);

  const presencaV = useMemo(() => {
    if (!vot.data || !atual) return null;
    const ps = atual.periodos.length ? atual.periodos : [{ inicio: atual.inicio, fim }];
    const siglas = vot.data.filter((v) => ps.some((p) => dentro(v.dataSessao, p))).map((v) => v.votos?.[0]?.siglaVotoParlamentar ?? "").filter(Boolean);
    return presencaSenado(siglas);
  }, [vot.data, atual, fim]);
  const prod = useMemo(() => {
    if (!aut.data) return null;
    const itens = aut.data.map((p) => ({ tipo: p.identificacao.split(" ")[0] ?? "", p })).filter((x) => TIPOS_SENADO.has(x.tipo));
    return { resumo: producao(itens.map((x) => ({ tipo: x.tipo, desfecho: classificarProcessoSenado(x.p) }))), totalGeral: aut.data.length, analisadas: itens.length, universo: itens.length };
  }, [aut.data]);
  const pautasS = useMemo(() => pautasSenador(vot.data ?? []), [vot.data]);
  const vPath = desde ? sen.votacoes(cod, desde, fim) : sen.votacoes(cod, hoje);

  return {
    casa: "senador", id: cod, nome: s?.nome ?? "", nomeCivil: s?.nomeCompleto ?? null, foto: s?.foto ?? null,
    partido: s?.partido ?? "", uf: s?.uf ?? "", sexo: s?.sexo ?? "",
    emExercicio: mandatos.length ? mandatos.some((m) => m.atual) : null,
    carregando: det.isPending, erro: det.error ?? (det.data === null ? new Error("Senador(a) não encontrado(a) na API do Senado.") : null),
    mandatos,
    trocas: ok(mraw.data ? trocasSenado(filiacoes) : null, mraw.isPending, [{ label: "Mandatos e filiações (API do Senado)", href: fontes.senadoApi(sen.mandatos(cod)) }]),
    producao: ok(prod, aut.isPending, [{ label: "Autorias (API do Senado)", href: fontes.senadoApi(sen.autorias(cod)) }],
      "Projetos que mudam leis (PL, PLS, PLP, PEC, PDL, PRS). Inclui coautorias."),
    presenca: ok(presencaV, vot.isPending, [{ label: "Votações nominais (API do Senado)", href: fontes.senadoApi(vPath) }],
      "Todas as votações nominais do plenário no mandato atual. Licenças (LS, LP…), missão (MIS) e AP contam como ausência justificada; NCom, sem justificativa."),
    alinhamento: ok<Alinhamento>(null, false, [], "O Senado não publica em dados abertos a orientação de cada partido por votação."),
    pautas: { itens: pautasS, carregando: vot.isPending },
    emendas,
    gastos,
    frentes: ok<Frente[]>(null, false, [], "A Câmara publica só os deputados membros das frentes; senadores não aparecem na lista oficial."),
    fontes: fontes.senador(cod),
  };
}
