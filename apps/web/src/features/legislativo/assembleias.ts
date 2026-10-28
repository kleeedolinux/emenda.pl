// Assembleias Legislativas: não há API nacional de deputados estaduais.
// Links conferidos em out/2026. `api` = endpoint JSON público conhecido (integração futura via Worker).
//
// Allowlist necessária no Worker para integrar ao vivo (não usada ainda pela UI):
//   - https://dadosabertos.almg.gov.br/api/v2/*            (ALMG, JSON)
//   - https://sapl.al.{ac,al,am,mt,pb,pi,ro,rr,to}.leg.br/api/*  (SAPL/Interlegis, JSON)
//   - https://www.al.sp.gov.br/repositorioDados/*          (ALESP, XML)

/** Cadeiras federais por UF (LC 78/1993; composição 2023–2027). */
export const CADEIRAS_FEDERAIS: Record<string, number> = {
  SP: 70, MG: 53, RJ: 46, BA: 39, RS: 31, PR: 30, PE: 25, CE: 22, MA: 18, GO: 17, PA: 17, SC: 16, PB: 12,
  ES: 10, PI: 10, AL: 9, AM: 8, MT: 8, MS: 8, DF: 8, RN: 8, SE: 8, AC: 8, AP: 8, RO: 8, RR: 8, TO: 8,
};

/** CF art. 27: triplo da bancada federal; acima de 36, soma-se 1 por deputado federal além de 12. */
export const cadeirasAssembleia = (federais: number) => (federais <= 12 ? federais * 3 : 36 + (federais - 12));

export interface Assembleia {
  uf: string;
  sigla: string;
  nome: string;
  site: string;
  transparencia?: string;
  dadosAbertos?: string;
  api?: { url: string; formato: "JSON" | "XML"; tipo: string };
}

const SAPL = (uf: string) => ({ url: `https://sapl.al.${uf}.leg.br/api/parlamentares/parlamentar/`, formato: "JSON" as const, tipo: "SAPL (Interlegis)" });

export const ASSEMBLEIAS: Assembleia[] = [
  { uf: "AC", sigla: "ALEAC", nome: "Assembleia Legislativa do Acre", site: "https://www.al.ac.leg.br/", api: SAPL("ac") },
  { uf: "AL", sigla: "ALE-AL", nome: "Assembleia Legislativa de Alagoas", site: "https://www.al.al.leg.br/", api: SAPL("al") },
  { uf: "AP", sigla: "ALAP", nome: "Assembleia Legislativa do Amapá", site: "https://www.al.ap.leg.br/" },
  { uf: "AM", sigla: "ALEAM", nome: "Assembleia Legislativa do Amazonas", site: "https://www.aleam.gov.br/", api: SAPL("am") },
  { uf: "BA", sigla: "ALBA", nome: "Assembleia Legislativa da Bahia", site: "https://www.al.ba.gov.br/", transparencia: "https://www.al.ba.gov.br/transparencia" },
  { uf: "CE", sigla: "ALECE", nome: "Assembleia Legislativa do Ceará", site: "https://www.al.ce.gov.br/" },
  { uf: "DF", sigla: "CLDF", nome: "Câmara Legislativa do Distrito Federal", site: "https://www.cl.df.gov.br/", dadosAbertos: "https://dados.cl.df.gov.br/" },
  { uf: "ES", sigla: "ALES", nome: "Assembleia Legislativa do Espírito Santo", site: "https://www.al.es.gov.br/" },
  { uf: "GO", sigla: "ALEGO", nome: "Assembleia Legislativa de Goiás", site: "https://portal.al.go.leg.br/", transparencia: "https://transparencia.al.go.leg.br/" },
  { uf: "MA", sigla: "ALEMA", nome: "Assembleia Legislativa do Maranhão", site: "https://www.al.ma.leg.br/sitealema/" },
  { uf: "MT", sigla: "ALMT", nome: "Assembleia Legislativa de Mato Grosso", site: "https://www.al.mt.gov.br/", api: SAPL("mt") },
  { uf: "MS", sigla: "ALEMS", nome: "Assembleia Legislativa de Mato Grosso do Sul", site: "https://al.ms.gov.br/" },
  {
    uf: "MG", sigla: "ALMG", nome: "Assembleia Legislativa de Minas Gerais", site: "https://www.almg.gov.br/",
    transparencia: "https://www.almg.gov.br/transparencia/", dadosAbertos: "https://dadosabertos.almg.gov.br/",
    api: { url: "https://dadosabertos.almg.gov.br/api/v2/deputados/em_exercicio?formato=json", formato: "JSON", tipo: "API própria" },
  },
  { uf: "PA", sigla: "ALEPA", nome: "Assembleia Legislativa do Pará", site: "https://www.alepa.pa.gov.br/" },
  { uf: "PB", sigla: "ALPB", nome: "Assembleia Legislativa da Paraíba", site: "https://www.al.pb.leg.br/", api: SAPL("pb") },
  { uf: "PR", sigla: "ALEP", nome: "Assembleia Legislativa do Paraná", site: "https://www.assembleia.pr.leg.br/", transparencia: "https://transparencia.assembleia.pr.leg.br/" },
  { uf: "PE", sigla: "ALEPE", nome: "Assembleia Legislativa de Pernambuco", site: "https://www.alepe.pe.gov.br/", transparencia: "https://transparencia.alepe.pe.gov.br/" },
  { uf: "PI", sigla: "ALEPI", nome: "Assembleia Legislativa do Piauí", site: "https://www.al.pi.leg.br/", api: SAPL("pi") },
  { uf: "RJ", sigla: "ALERJ", nome: "Assembleia Legislativa do Rio de Janeiro", site: "https://www.alerj.rj.gov.br/", transparencia: "https://www.alerj.rj.gov.br/transparencia" },
  { uf: "RN", sigla: "ALRN", nome: "Assembleia Legislativa do Rio Grande do Norte", site: "https://www.al.rn.leg.br/" },
  { uf: "RS", sigla: "ALRS", nome: "Assembleia Legislativa do Rio Grande do Sul", site: "https://www.al.rs.gov.br/", transparencia: "https://transparencia.al.rs.gov.br/" },
  { uf: "RO", sigla: "ALERO", nome: "Assembleia Legislativa de Rondônia", site: "https://www.al.ro.leg.br/", api: SAPL("ro") },
  { uf: "RR", sigla: "ALE-RR", nome: "Assembleia Legislativa de Roraima", site: "https://www.al.rr.leg.br/", api: SAPL("rr") },
  { uf: "SC", sigla: "ALESC", nome: "Assembleia Legislativa de Santa Catarina", site: "https://www.alesc.sc.gov.br/", transparencia: "https://transparencia.alesc.sc.gov.br/" },
  {
    uf: "SP", sigla: "ALESP", nome: "Assembleia Legislativa de São Paulo", site: "https://www.al.sp.gov.br/",
    transparencia: "https://www.al.sp.gov.br/transparencia/", dadosAbertos: "https://www.al.sp.gov.br/dados-abertos/",
    api: { url: "https://www.al.sp.gov.br/repositorioDados/deputados/deputados.xml", formato: "XML", tipo: "Repositório de dados" },
  },
  { uf: "SE", sigla: "ALESE", nome: "Assembleia Legislativa de Sergipe", site: "https://al.se.leg.br/" },
  { uf: "TO", sigla: "ALETO", nome: "Assembleia Legislativa do Tocantins", site: "https://www.al.to.leg.br/", api: SAPL("to") },
];
