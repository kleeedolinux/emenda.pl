// Espelho de fotos/logos/PDFs oficiais (branch `assets`, Worker em cdn.emenda.online).
// Base via VITE_CDN_BASE (vazio desliga). Sem arquivo no espelho, o Worker redireciona à origem;
// se o CDN falhar, `trocarParaOriginal` volta à URL oficial.

export type Tamanho = 160 | 512;
export interface ImagemCdn { src: string; srcSet?: string; fallbackSrc: string }

const BANDEP = /^https?:\/\/(?:www\.)?camara\.leg\.br\/internet\/deputado\/bandep\/(\d{1,12})\.jpe?g$/i;
const SENADO_IMG = /^https?:\/\/(?:www\.)?senado\.leg\.br\/senadores\/img\/fotos-oficiais\/senador(\d{1,12})\.jpe?g$/i;
const SENADO_LEGIS = /^https?:\/\/legis\.senado\.leg\.br\/senadores\/fotos-oficiais\/(\d{1,12})$/i;
const LOGO = /^https?:\/\/(?:www\.)?camara\.leg\.br\/internet\/deputado\/img\/partidos\/([A-Za-z0-9]{1,20})\.(?:gif|png|jpe?g)$/i;

/** `chaveNome` em minúsculas com `-` (igual a `nomes::slug` no ETL). */
export function slugNome(nome: string): string {
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim().toLowerCase().replace(/ /g, "-");
}

export function criarCdn(base: string) {
  const b = base.trim().replace(/\/+$/, "");
  type Casa = "deputado" | "senador" | "prefeito" | "vice-prefeito";
  const foto = (casa: Casa, id: string | number, t: Tamanho) => `${b}/foto/${casa}/${id}-${t}.webp`;
  const fotoSet = (casa: "deputado" | "senador", id: string, original: string): ImagemCdn | null =>
    b ? { src: foto(casa, id, 160), srcSet: `${foto(casa, id, 160)} 160w, ${foto(casa, id, 512)} 512w`, fallbackSrc: original } : null;
  return {
    fotoDeputado: (id: string | number, t: Tamanho = 160) => foto("deputado", id, t),
    fotoSenador: (codigo: string | number, t: Tamanho = 160) => foto("senador", codigo, t),
    /** Prefeito(a) eleito(a) em 2024, por código IBGE do município (foto oficial do TSE). */
    fotoPrefeito: (ibge: string | number, t: Tamanho = 160) => foto("prefeito", ibge, t),
    fotoVicePrefeito: (ibge: string | number, t: Tamanho = 160) => foto("vice-prefeito", ibge, t),
    fotoPrefeitoSet: (ibge: string | number) => ({ src: foto("prefeito", ibge, 160), srcSet: `${foto("prefeito", ibge, 160)} 160w, ${foto("prefeito", ibge, 512)} 512w` }),
    /** Bandeira oficial da UF (SVG; `64` = WebP 64 px de largura). */
    bandeiraUf: (uf: string, w?: 64) => `${b}/bandeira/uf/${uf.toUpperCase()}${w ? "-64.webp" : ".svg"}`,
    bandeiraBrasil: (w?: 64) => `${b}/bandeira/pais/BR${w ? "-64.webp" : ".svg"}`,
    /** Bandeira / brasão do município (Wikidata + Wikimedia Commons), WebP 64 ou 256 px. */
    bandeiraMunicipio: (ibge: string | number, w: 64 | 256 = 64) => `${b}/bandeira/municipio/${ibge}-${w}.webp`,
    brasaoMunicipio: (ibge: string | number, w: 64 | 256 = 64) => `${b}/brasao/municipio/${ibge}-${w}.webp`,
    /** `{bandeira?, brasao?: {licenca, autor, pagina}}` (crédito exigido pela licença). */
    creditoMunicipio: (ibge: string | number) => `${b}/credito/municipio/${ibge}.json`,
    /** Ordem de exibição: bandeira do município, brasão, bandeira da UF. */
    emblemasMunicipio: (ibge: string | number, uf: string, w: 64 | 256 = 64) => [
      `${b}/bandeira/municipio/${ibge}-${w}.webp`,
      `${b}/brasao/municipio/${ibge}-${w}.webp`,
      `${b}/bandeira/uf/${uf.toUpperCase()}-64.webp`,
    ],
    /** Foto por nome (+UF) para quem não tem id na página (autores, estaduais): índice do espelho (TSE/Câmara/Senado). */
    fotoPorNome: (nome: string, uf?: string | null, t: Tamanho = 160) => `${b}/foto/nome/${(uf || "XX").toUpperCase()}/${slugNome(nome)}-${t}.webp`,
    logoPartido: (sigla: string) => `${b}/logo/partido/${encodeURIComponent(sigla)}.webp`,
    pdfProposicao: (id: string | number) => (b ? `${b}/pdf/proposicao/${id}.pdf` : null),
    pdfFrente: (id: string | number) => (b ? `${b}/pdf/frente/${id}.pdf` : null),
    /** URL oficial de foto/logo -> versão do espelho (null quando não reconhecida ou CDN desligado). */
    imagem(url?: string | null): ImagemCdn | null {
      if (!url || !b) return null;
      let m = BANDEP.exec(url);
      if (m) return fotoSet("deputado", m[1]!, url);
      m = SENADO_IMG.exec(url) ?? SENADO_LEGIS.exec(url);
      if (m) return fotoSet("senador", m[1]!, url);
      m = LOGO.exec(url);
      if (m) return { src: `${b}/logo/partido/${m[1]}.webp`, fallbackSrc: url };
      return null;
    },
  };
}

// Padrão `/cdn` (mesma origem, Worker serve `/cdn/*`); com o domínio ativo: VITE_CDN_BASE=https://cdn.emenda.online.
export const CDN_BASE: string = import.meta.env?.VITE_CDN_BASE ?? "/cdn";
export const cdn = criarCdn(CDN_BASE);
export const { fotoDeputado, fotoSenador, fotoPrefeito, fotoVicePrefeito, fotoPrefeitoSet, bandeiraUf, bandeiraBrasil, bandeiraMunicipio, brasaoMunicipio, creditoMunicipio, emblemasMunicipio, fotoPorNome, logoPartido, pdfProposicao, pdfFrente } = cdn;
export const imagemCdn = cdn.imagem;

/** Props de `<img>`: foto/logo oficial -> espelho (src + srcset 160/512 + sizes); outras URLs intactas. */
export function cdnImg(src: string, px: number, c = imagemCdn(src)): { src: string; srcSet?: string; sizes?: string } {
  return c ? { src: c.src, srcSet: c.srcSet, sizes: c.srcSet ? `${px}px` : undefined } : { src };
}

/** `onError` de `<img>`: troca uma vez para a URL oficial (remove srcset). false = já trocou ou não há original. */
export function trocarParaOriginal(img: HTMLImageElement, original?: string | null): boolean {
  if (!original || img.dataset.cdnFallback) return false;
  img.dataset.cdnFallback = "1";
  img.removeAttribute("srcset");
  img.src = original;
  return true;
}

/** Commons: obras em domínio público/CC0 dispensam crédito; demais licenças (CC BY/BY-SA…) exigem. */
export function precisaCredito(licenca?: string | null): boolean {
  return !/public domain|dom[ií]nio p[uú]blico|^pd\b|^pd-|cc0/i.test(licenca ?? "");
}
