import type { SiglaUf } from "@emenda/contracts";

/** População residente por UF — IBGE, Censo Demográfico 2022. */
export const POPULACAO_FONTE = "IBGE, Censo 2022";
export const POPULACAO_UF: Record<SiglaUf, number> = {
  RO: 1_581_196, AC: 830_018, AM: 3_941_613, RR: 636_707, PA: 8_120_131, AP: 733_759, TO: 1_511_460,
  MA: 6_776_699, PI: 3_271_199, CE: 8_794_957, RN: 3_302_729, PB: 3_974_687, PE: 9_058_931, AL: 3_127_683,
  SE: 2_210_004, BA: 14_141_626, MG: 20_539_989, ES: 3_833_712, RJ: 16_055_174, SP: 44_411_238,
  PR: 11_444_380, SC: 7_610_361, RS: 10_882_965, MS: 2_757_013, MT: 3_658_649, GO: 7_056_495, DF: 2_817_381,
};
