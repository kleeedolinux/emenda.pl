// Índice compacto (v1/busca.json) -> itens da busca. Puro.
import { UFS, type IndiceBusca, type SiglaUf } from "@emenda/contracts";
import { tipoAutor } from "@/features/linguagem/linguagem";
import { bandeiraUf } from "@/lib/cdn";
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
  return [
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
    ...i.autores.map(([cod, nome, pago]): ItemBusca => ({
      id: `a:${cod}`, tipo: "autor", titulo: nome, sub: SUB_AUTOR[tipoAutor(nome)], href: `/autor/${encodeURIComponent(cod)}`, valor: pago || undefined, peso: 5,
    })),
  ];
}
