// Índice compacto (v1/busca.json) -> itens da busca. Puro.
import { UFS, type IndiceBusca, type SiglaUf } from "@emenda/contracts";
import { tipoAutor } from "@/features/linguagem/linguagem";
import { bandeiraUf, fotoPrefeito } from "@/lib/cdn";
import { nomeLeigo } from "@/lib/nomes";
import type { Pauta } from "@/features/legislativo/pautas";
import type { BancadaTematica } from "@/features/bancadas/catalogo";
import type { ItemBusca } from "./ranker";

export const fotoCamara = (id: number | string) => `https://www.camara.leg.br/internet/deputado/bandep/${id}.jpg`;
export const fotoSenado = (cod: string) => `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${cod}.jpg`;

const SUB_AUTOR = { bancada: "Grupo de políticos do estado", comissao: "Comissão do Congresso", relator: "Orçamento secreto", pessoa: "Político (ex-parlamentar ou outro cargo)" } as const;

export function itensEstados(): ItemBusca[] {
  return (Object.entries(UFS) as Array<[SiglaUf, string]>).map(([uf, nome]) => ({
    id: `uf:${uf}`, tipo: "estado", titulo: nome, extra: uf, sub: `Estado · ${uf}`, href: `/uf/${uf}`, img: bandeiraUf(uf, 64), selo: uf, uf, peso: 100,
  }));
}

export function itensDoIndice(i: IndiceBusca): ItemBusca[] {
  const cidade = new Map(i.cidades.map(([id, nome, uf]) => [id, { nome, uf }]));
  return [
    ...(i.prefeitos ?? []).flatMap(([ibge, nome, partido]): ItemBusca[] => {
      const c = cidade.get(ibge);
      return c ? [{ id: `pf:${ibge}`, tipo: "prefeito", titulo: nomeLeigo(nome), extra: `${partido} ${c.nome}`, sub: `Prefeito(a) de ${c.nome} · ${partido}-${c.uf}`, href: `/municipio/${ibge}`, img: fotoPrefeito(ibge), selo: partido, uf: c.uf, peso: 0 }] : [];
    }),
    ...itensEstados(),
    ...i.cidades.map(([id, nome, uf, pago]): ItemBusca => ({
      id: `m:${id}`, tipo: "cidade", titulo: nome, extra: `${uf} ${UFS[uf as SiglaUf] ?? ""}`, sub: `Cidade · ${uf}`, href: `/municipio/${id}`, selo: uf, uf, valor: pago, peso: 0,
    })),
    ...i.deputados.map(([id, nome, partido, uf, pago]): ItemBusca => ({
      id: `d:${id}`, tipo: "deputado", titulo: nome, extra: `${partido} ${uf}`, sub: `Deputado(a) · ${partido}-${uf}`, href: `/deputado/${id}`, img: fotoCamara(id), selo: partido, uf, valor: pago || undefined, peso: 20,
    })),
    ...i.senadores.map(([cod, nome, partido, uf, pago]): ItemBusca => ({
      id: `s:${cod}`, tipo: "senador", titulo: nome, extra: `${partido} ${uf}`, sub: `Senador(a) · ${partido}-${uf}`, href: `/senador/${cod}`, img: fotoSenado(cod), selo: partido, uf, valor: pago || undefined, peso: 25,
    })),
    ...i.partidos.map(([sigla, nome]): ItemBusca => ({
      id: `p:${sigla}`, tipo: "partido", titulo: sigla, extra: nome, sub: nome, href: `/partido/${encodeURIComponent(sigla)}`, selo: sigla, peso: 30,
    })),
    ...i.autores.map(([cod, nome, pago]): ItemBusca => {
      const t = tipoAutor(nome);
      const tipo = t === "comissao" ? "comissao" : t === "bancada" ? "bancada" : "autor";
      return { id: `a:${cod}`, tipo, titulo: tipo === "autor" ? nome : nomeLeigo(nome), extra: tipo === "autor" ? undefined : nome, sub: SUB_AUTOR[t], href: `/autor/${encodeURIComponent(cod)}`, valor: pago || undefined, peso: 5 };
    }),
  ];
}

/** Leis de grande repercussão (curadoria em features/legislativo/pautas): número, apelido e tema. */
export function itensLeis(pautas: readonly Pauta[]): ItemBusca[] {
  return pautas.map((p) => ({
    id: `lei:${p.camaraId}`, tipo: "lei", titulo: `${p.sigla} ${p.numero}/${p.ano}`,
    apelido: p.apelido, extra: `${p.tema} ${p.resumo}`, sub: `${p.apelido.replace(/[“”]/g, "")} · ${p.tema}`,
    href: `/proposicao/${p.camaraId}`, peso: 40,
  }));
}

/** Bancadas temáticas (frentes parlamentares) pelo apelido popular: "ruralista", "bala", "evangélica". */
export function itensBancadas(lista: readonly BancadaTematica[]): ItemBusca[] {
  return lista.map((b) => ({
    id: `bt:${b.id}`, tipo: "bancada", titulo: b.apelido, apelido: b.aliases.join(" "), extra: `${b.oficial} ${b.tema}`,
    sub: `Bancada temática · ${b.tema}`, href: `/bancada/${b.id}`, peso: 30,
  }));
}
