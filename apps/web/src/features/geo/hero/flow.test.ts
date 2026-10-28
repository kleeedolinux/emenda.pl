import { describe, expect, test } from "bun:test";
import { apportion, arcControl, arrivalsBetween, buildSlots, quadLength, quadPath, quadPoint, route, routePoint, slotAt, type Pt } from "./flow";

const A: Pt = [0, 100], B: Pt = [200, 100];

describe("bezier", () => {
  test("controle do arco fica acima da corda (y menor) e no meio em x", () => {
    const c = arcControl(A, B, 0.3);
    expect(c[0]).toBeCloseTo(100, 6);
    expect(c[1]).toBeLessThan(100);
    expect(100 - c[1]).toBeCloseTo(60, 6); // 0.3 * 200
  });
  test("arco sempre sobe, mesmo da direita para a esquerda", () => expect(arcControl(B, A, 0.3)[1]).toBeLessThan(100));
  test("quadPoint nos extremos e no meio", () => {
    const c: Pt = [100, 0];
    expect(quadPoint(A, c, B, 0)).toEqual([...A]);
    expect(quadPoint(A, c, B, 1)).toEqual([...B]);
    expect(quadPoint(A, c, B, 0.5)).toEqual([100, 50]);
  });
  test("quadPath em SVG", () => expect(quadPath(A, [100, 0], B)).toBe("M0,100Q100,0 200,100"));
  test("comprimento: reta degenerada = distância", () => expect(quadLength(A, [100, 100], B)).toBeCloseTo(200, 1));
  test("comprimento: arco > corda", () => expect(quadLength(A, [100, 0], B)).toBeGreaterThan(200));
});

describe("route (origem -> hub -> destino)", () => {
  const r = route([0, 0], [100, 0], [100, 100], 0.2);
  test("começa na origem, passa no hub, termina no destino", () => {
    expect(routePoint(r, 0)).toEqual([0, 0]);
    const h = routePoint(r, r.split);
    expect(h[0]).toBeCloseTo(100, 6); expect(h[1]).toBeCloseTo(0, 6);
    expect(routePoint(r, 1)).toEqual([100, 100]);
  });
  test("split proporcional ao comprimento das pernas", () => { expect(r.split).toBeGreaterThan(0.3); expect(r.split).toBeLessThan(0.7); });
  test("sem origem: só a perna hub -> destino", () => {
    const s = route(null, [100, 0], [100, 100], 0.2);
    expect(s.split).toBe(0);
    expect(routePoint(s, 0)).toEqual([100, 0]);
  });
});

describe("apportion (pesos reais -> nº de partículas)", () => {
  test("soma exata e proporcional (maiores restos)", () => {
    const c = apportion({ SP: 50, MG: 30, AC: 20 }, 10);
    expect(c).toEqual({ SP: 5, MG: 3, AC: 2 });
  });
  test("mínimo garante presença de todos com peso > 0", () => {
    const c = apportion({ SP: 990, AC: 10, RR: 0 }, 10, 1);
    expect(c.AC).toBe(1); expect(c.RR ?? 0).toBe(0);
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(10);
  });
  test("sem pesos -> vazio", () => expect(apportion({}, 5)).toEqual({}));
  test("determinístico", () => expect(apportion({ a: 1, b: 2, c: 3 }, 7)).toEqual(apportion({ a: 1, b: 2, c: 3 }, 7)));
});

describe("slots (agendamento determinístico)", () => {
  const slots = buildSlots({ SP: 3, AC: 1 }, { period: 4, travel: 2 });
  test("um slot por partícula, fases distintas em [0,1)", () => {
    expect(slots).toHaveLength(4);
    const ph = slots.map((s) => s.phase);
    expect(new Set(ph).size).toBe(4);
    for (const p of ph) { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(1); }
  });
  test("slotAt: em voo dentro da janela de viagem, ocioso fora", () => {
    const s = { key: "SP", phase: 0, travel: 2, period: 4, jitter: 0 };
    expect(slotAt(s, 0)).toBeCloseTo(0, 6);
    expect(slotAt(s, 1)).toBeCloseTo(0.5, 6);
    expect(slotAt(s, 3)).toBe(-1);
    expect(slotAt(s, 5)).toBeCloseTo(0.5, 6); // periódico
  });
  test("arrivalsBetween detecta chegada uma única vez", () => {
    const s = { key: "SP", phase: 0, travel: 2, period: 4, jitter: 0 };
    expect(arrivalsBetween([s], 1.9, 2.1)).toEqual(["SP"]);
    expect(arrivalsBetween([s], 2.1, 2.3)).toEqual([]);
    expect(arrivalsBetween([s], 5.9, 6.1)).toEqual(["SP"]);
  });
  test("ignora chegadas de partículas emitidas antes de `since` (entrada gradual)", () => {
    const s = { key: "SP", phase: 0.75, travel: 2, period: 4, jitter: 0 }; // emitida em t=-3, chega em t=-1 e t=3...
    const late = { key: "AC", phase: 0.25, travel: 2, period: 4, jitter: 0 }; // emitida em t=-1, chega em t=1
    expect(arrivalsBetween([s, late], 0, 1.5, 0)).toEqual([]);
    expect(arrivalsBetween([s, late], 0, 1.5)).toEqual(["AC"]);
  });
});
