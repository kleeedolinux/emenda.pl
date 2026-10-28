import qrcode from "qrcode-generator";

export interface QrMatrix { size: number; dark: Uint8Array }

/** Matriz QR (nível M, versão automática) — 1 = módulo escuro. */
export function qrMatrix(text: string): QrMatrix {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  const dark = new Uint8Array(size * size);
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark[r * size + c] = qr.isDark(r, c) ? 1 : 0;
  return { size, dark };
}
