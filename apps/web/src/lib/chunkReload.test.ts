import { expect, test } from "bun:test";
import { comRecarga } from "./chunkReload";

function ambiente() {
  const store = new Map<string, string>();
  let recargas = 0;
  return {
    env: { storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }, reload: () => { recargas++; } },
    recargas: () => recargas,
  };
}

test("recarrega uma vez quando o chunk sumiu após deploy", async () => {
  const a = ambiente();
  const falha = () => Promise.reject(new TypeError("Failed to fetch dynamically imported module: /assets/X.js"));
  void comRecarga(falha, a.env);
  await Bun.sleep(0);
  expect(a.recargas()).toBe(1);
  await expect(comRecarga(falha, a.env)).rejects.toThrow();
  expect(a.recargas()).toBe(1);
});

test("sucesso limpa a trava e não recarrega", async () => {
  const a = ambiente();
  a.env.storage.setItem("emenda:chunk-reload", "1");
  await expect(comRecarga(() => Promise.resolve({ default: 1 }), a.env)).resolves.toEqual({ default: 1 });
  expect(a.env.storage.getItem("emenda:chunk-reload")).toBeNull();
  expect(a.recargas()).toBe(0);
});
