import { describe, expect, test } from "bun:test";
import { nomeLeigo } from "./nomes";

describe("nomeLeigo: nomes do Portal em caixa alta -> leitura comum", () => {
  test.each([
    ["GENERAL MOTORS DO BRASIL LTDA", "General Motors do Brasil Ltda"],
    ["MUNICIPIO DE BELEM", "Prefeitura de Belém"],
    ["MUNICÍPIO DE SAO PAULO", "Prefeitura de São Paulo"],
    ["PREFEITURA MUNICIPAL DE IRAQUARA", "Prefeitura de Iraquara"],
    ["FUNDO MUNICIPAL DE SAUDE DE IRAQUARA", "Fundo Municipal de Saúde de Iraquara"],
    ["FUND. MUN. DE SAUDE", "Fundo Municipal de Saúde"],
    ["COM. DESENV REGIONAL E TURISMO", "Comissão de Desenvolvimento Regional e Turismo"],
    ["COM. DA SAUDE", "Comissão da Saúde"],
    ["COMISSAO DE ASSUNTOS SOCIAIS - CAS", "Comissão de Assuntos Sociais"],
    ["COM. DE PREVI., ASSIS. SOCI, INFAN., ADOL. E FAMIL", "Comissão de Previdência, Assistência Social, Infância, Adolescência e Família"],
    ["COM MISTA PERM SOBRE MIG INTERNACIONAIS E REFUGIAD", "Comissão Mista Permanente sobre Migrações Internacionais e Refugiados"],
    ["COMISSAO DE EDUCACAO, CULTURA E ESPORTE - CE", "Comissão de Educação, Cultura e Esporte"],
    ["BANCADA DO PIAUI", "Bancada do Piauí"],
    ["SEC. DE ESTADO DA SAUDE", "Secretaria de Estado da Saúde"],
    ["ASSOC. DE PAIS E AMIGOS DOS EXCEPCIONAIS - APAE", "Associação de Pais e Amigos dos Excepcionais - APAE"],
    ["INST. FEDERAL DA BAHIA", "Instituto Federal da Bahia"],
    ["IRAQUARA - BA", "Iraquara - BA"],
    ["VENEZIANO VITAL DO REGO", "Veneziano Vital do Rego"],
    ["FNDE", "FNDE"],
    ["Iraquara", "Iraquara"],
    ["  ", ""],
  ])("%s -> %s", (entrada, saida) => expect(nomeLeigo(entrada)).toBe(saida));
});
