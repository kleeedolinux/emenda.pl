// Após um deploy, abas abertas apontam para chunks com hash antigo que não existem mais.
// Na primeira falha de import dinâmico recarregamos a página (uma vez) para pegar o HTML novo.
const CHAVE = "emenda:chunk-reload";

interface Ambiente {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  reload: () => void;
}

const padrao = (): Ambiente => ({ storage: sessionStorage, reload: () => location.reload() });

export async function comRecarga<T>(load: () => Promise<T>, env: Ambiente = padrao()): Promise<T> {
  try {
    const m = await load();
    env.storage.removeItem(CHAVE);
    return m;
  } catch (e) {
    if (env.storage.getItem(CHAVE)) throw e;
    env.storage.setItem(CHAVE, "1");
    env.reload();
    return new Promise<T>(() => {}); // a página vai recarregar
  }
}
