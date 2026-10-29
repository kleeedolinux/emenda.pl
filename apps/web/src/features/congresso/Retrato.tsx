// "Retrato do Congresso": hemiciclos e recortes da composição.
import { useMemo, useRef, useState } from "react";
import { useInView } from "motion/react";
import { Bars, Card, Donut, Hemicycle, Skeleton, Stat, StatGrid, formatNumber, formatPct, partyColor } from "@/ui";
import { Segmentado } from "@/features/legislativo/components";
import { hojeISO } from "@/features/legislativo/mandatos";
import type { SenadorResumo } from "@/features/legislativo/api";
import {
  assentos, contar, faixaEtaria, faixasTempo, genero, idade, novatos, FAIXAS_ETARIAS, type Membro, type ModoHemiciclo,
} from "./composicao";
import { LEG_ATUAL, type FiltrosCongresso } from "./filtros";
import { useAnteriores, usePerfis, useTempoDeCasa } from "./hooks";
import { Metodo } from "./ui";

const CORES_GENERO = { F: "#a855f7", M: "#2563eb" };

export function Retrato({ todos, membros, senadores, f }: { todos: Membro[]; membros: Membro[]; senadores: SenadorResumo[] | null; f: FiltrosCongresso }) {
  const [modo, setModo] = useState<ModoHemiciclo>("partido");
  const cam = membros.filter((m) => m.casa === "camara");
  const sen = membros.filter((m) => m.casa === "senado");
  const destaque = (ms: Membro[], casa: Membro["casa"]) => {
    // Hemiciclo mostra a Casa inteira; o filtro realça quem está no recorte.
    const sel = new Set(ms.map((m) => m.id));
    const filtrando = !!(f.partido || f.uf);
    return assentos(todos.filter((m) => m.casa === casa), modo).map((s) => {
      const id = s.key.split("-").slice(1).join("-");
      return filtrando && !sel.has(id) ? { ...s, color: "var(--color-line, #cbd5e1)", group: "Fora do filtro" } : s;
    });
  };
  const g = genero(membros);
  const anteriores = useAnteriores(f.leg);
  const nov = anteriores ? novatos(cam.map((m) => m.id), anteriores) : null;
  const partidos = new Set(membros.map((m) => m.partido)).size;

  const ref = useRef<HTMLDivElement>(null);
  const visivel = useInView(ref, { once: true, margin: "200px" });
  const tempo = useTempoDeCasa(f.leg, senadores, visivel);
  const dias = useMemo(() => membros.flatMap((m) => {
    const d = m.casa === "camara" ? tempo.camara?.get(m.id) : tempo.senado?.get(m.id);
    return d === undefined ? [] : [d];
  }), [membros, tempo.camara, tempo.senado]);

  return (
    <div className="space-y-4">
      <StatGrid>
        <Stat label="Parlamentares no recorte" value={formatNumber(membros.length)} hint={`${formatNumber(cam.length)} deputados · ${formatNumber(sen.length)} senadores`} />
        <Stat label="Mulheres" value={formatPct(g.pctMulheres)} hint={`${formatNumber(g.mulheres)} de ${formatNumber(g.mulheres + g.homens)}`} tip="Sexo informado pela Câmara (filtro oficial siglaSexo) e pelo Senado." />
        <Stat label="Novatos na Câmara" value={nov ? formatPct(cam.length ? nov.novatos / cam.length : 0) : "…"} hint={nov ? `${formatNumber(nov.novatos)} não estavam na legislatura anterior` : "comparando listas oficiais"} tip="Deputado que não aparece na lista oficial da legislatura anterior (inclui suplentes que assumiram)." />
        <Stat label="Partidos representados" value={formatNumber(partidos)} />
      </StatGrid>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentado label="Agrupar cadeiras" value={modo} onChange={setModo} options={[{ value: "partido", label: "Por partido" }, { value: "federacao", label: "Por federação" }]} />
        <p className="text-xs text-muted">Passe o mouse ou toque nas cadeiras. Com filtro ativo, as demais ficam em cinza.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {f.casa !== "senado" && <Card title={`Câmara — ${formatNumber(todos.filter((m) => m.casa === "camara").length)} cadeiras`} tip="Deputados em exercício na legislatura escolhida, pela sigla atual.">
          <Hemicycle seats={destaque(cam, "camara")} />
        </Card>}
        {f.casa !== "camara" && <Card title={`Senado — ${formatNumber(todos.filter((m) => m.casa === "senado").length)} cadeiras`} tip="Senadores em exercício (titulares ou suplentes no cargo).">
          <Hemicycle seats={destaque(sen, "senado")} />
        </Card>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Mulheres e homens">
          <Donut data={[{ label: "Mulheres", value: g.mulheres, color: CORES_GENERO.F }, { label: "Homens", value: g.homens, color: CORES_GENERO.M }]} centerLabel="Parlamentares" />
        </Card>
        <Card title="Por estado" tip="Cadeiras no recorte. A Câmara é proporcional à população (8 a 70 por estado); o Senado tem 3 por estado.">
          <Bars data={contar(membros, (m) => m.uf).map((c) => ({ label: c.label, value: c.value, href: `/uf/${c.label}` }))} limit={12} />
        </Card>
        <Card title="Maiores bancadas">
          <Bars data={contar(membros, (m) => m.partido).map((c) => ({ label: c.label, value: c.value, color: partyColor(c.label), href: `/partido/${encodeURIComponent(c.label)}` }))} limit={12} />
        </Card>
      </div>

      <div ref={ref} className="grid gap-4 md:grid-cols-2">
        <Card title="Tempo de casa" tip="Câmara: soma das legislaturas (desde 1983) em que o deputado aparece na lista oficial — estimativa por legislatura inteira. Senado: soma dos períodos de exercício do mandato atual.">
          {dias.length ? <Bars data={faixasTempo(dias)} /> : <div className="space-y-2"><Skeleton className="h-40" /><p className="text-xs text-muted">Carregando listas históricas… {Math.round(tempo.progresso * 100)}%</p></div>}
        </Card>
        <PerfilDetalhado membros={membros} />
      </div>
      {f.leg !== LEG_ATUAL && <Metodo>Legislatura {f.leg}: Câmara pela lista oficial daquela legislatura; Senado pela lista da legislatura no Senado.</Metodo>}
    </div>
  );
}

/** Idade, escolaridade e profissão: uma consulta por parlamentar, só quando pedido. */
function PerfilDetalhado({ membros }: { membros: Membro[] }) {
  const [ativo, setAtivo] = useState(false);
  const qs = usePerfis(membros, ativo);
  const prontos = qs.filter((q) => q.isSuccess).length;
  const dados = useMemo(() => {
    if (!ativo) return null;
    const hoje = hojeISO();
    const idades: string[] = [], esc: string[] = [], prof: string[] = [];
    for (const q of qs) {
      if (!q.data) continue;
      const i = idade(q.data.nascimento, hoje);
      if (i !== null) idades.push(faixaEtaria(i));
      if (q.data.escolaridade) esc.push(q.data.escolaridade);
      if (q.data.profissao) prof.push(q.data.profissao);
    }
    const ord = contar(idades, (x) => x);
    return {
      idades: FAIXAS_ETARIAS.map((label) => ({ label, value: ord.find((o) => o.label === label)?.value ?? 0 })),
      esc: contar(esc, (x) => x), prof: contar(prof, (x) => x),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, prontos]);
  const [aba, setAba] = useState<"idade" | "escolaridade" | "profissao">("idade");
  return (
    <Card title="Idade, escolaridade e profissão" tip="Dados declarados nas fichas oficiais de cada parlamentar (Câmara: /deputados/{id} e /profissoes; Senado: /senador/{código} e /profissao). Escolaridade só existe na Câmara.">
      {!ativo ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted">Precisa de uma consulta por parlamentar ({formatNumber(membros.length * 2)} chamadas às APIs oficiais). Use filtros para reduzir.</p>
          <button type="button" onClick={() => setAtivo(true)} className="press rounded-xl bg-verde px-4 py-2 text-sm font-semibold text-white">Carregar perfis</button>
        </div>
      ) : (
        <div className="space-y-3">
          <Segmentado label="Recorte" value={aba} onChange={setAba} options={[{ value: "idade", label: "Idade" }, { value: "escolaridade", label: "Escolaridade" }, { value: "profissao", label: "Profissão" }]} />
          {prontos < qs.length && <p className="text-xs text-muted">Carregados {formatNumber(prontos)} de {formatNumber(qs.length)}…</p>}
          {dados && (aba === "idade" ? <Bars data={dados.idades} /> : aba === "escolaridade" ? <Bars data={dados.esc} limit={8} /> : <Bars data={dados.prof} limit={10} />)}
        </div>
      )}
    </Card>
  );
}
