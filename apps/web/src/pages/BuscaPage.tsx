// /busca?q=&modo=&uf= — resultados completos da busca universal. Filtros na URL (link compartilhável).
import { useRef } from "react";
import { useSearchParams } from "react-router";
import { BuscaUniversal, filtrosDaUrl, filtrosParaUrl, type FiltrosBusca } from "@/features/busca";
import { PageHeader } from "@/ui";

export default function BuscaPage() {
  const [sp, setSp] = useSearchParams();
  const f = filtrosDaUrl(sp);
  const url = filtrosParaUrl(f);
  // Remonta a busca só quando a URL muda por fora (ex.: Enter na busca do topo), não a cada tecla daqui.
  const emitido = useRef(url);
  const chave = useRef(0);
  if (url !== emitido.current) { emitido.current = url; chave.current += 1; }

  const onFiltros = (n: FiltrosBusca) => {
    const s = filtrosParaUrl(n);
    if (s === emitido.current) return;
    emitido.current = s;
    setSp(new URLSearchParams(s), { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Buscar"
        subtitle="Cidades, estados, deputados, senadores e partidos. Escolha um estado para ver só o que é dele."
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Buscar" }]}
      />
      <div className="mx-auto max-w-2xl">
        <BuscaUniversal key={chave.current} variante="painel" modoInicial={f.modo} ufInicial={f.uf} consultaInicial={f.q} autoFocus={!f.q} limite={40} onFiltros={onFiltros} />
      </div>
    </>
  );
}
