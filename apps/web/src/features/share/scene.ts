// Cena em canvas (imagem estática e quadros do mini-reel). Carregado sob demanda.
import { formatBRL } from "@emenda/contracts";
import { absoluteUrl, formatMetric, type ShareData, type ShareKind } from "./links";
import { barLayout, hemiSeats, voteColors, type SeatPos, type VoteSide } from "./geometry";
import type { QrMatrix } from "./qr";
import { fitFont, truncate, wrapText } from "./text";
import { countUp, easeInOut, easeOutCubic, phase, REEL_PHASES } from "./timeline";

export type Format = "square" | "story";
export const SIZES: Record<Format, readonly [number, number]> = { square: [1080, 1080], story: [1080, 1920] };
/** Instante "pronto" usado nas imagens estáticas. */
export const STILL_T = REEL_PHASES.hold[0] + 0.02;

export interface Assets { logo: CanvasImageSource | null; qr: QrMatrix }

const C = {
  verde: "#009c3b", verdeClaro: "#1fc35f", amarelo: "#ffdf00", azul: "#002776",
  bg0: "#001a4f", bg1: "#000c26", branco: "#ffffff", muted: "#b8c6e0", nao: "#ff5a5f", outros: "#9fb0c9",
};
const SIDE: Record<VoteSide, string> = { sim: C.verdeClaro, nao: C.nao, outros: C.outros };
const DISPLAY = (w: number, s: number) => `${w} ${s}px "Space Grotesk", Inter, ui-sans-serif, sans-serif`;
const SANS = (w: number, s: number) => `${w} ${s}px Inter, ui-sans-serif, system-ui, sans-serif`;

export const KIND_LABEL: Record<ShareKind, string> = {
  proposicao: "Proposição", votacao: "Votação na Câmara", voto: "Como votou", emenda: "Emenda parlamentar",
  municipio: "Município", uf: "Estado", deputado: "Deputado(a) federal", senador: "Senador(a)", autor: "Autor de emendas",
  partido: "Partido", pix: "Emenda Pix", pagina: "emenda.online",
  agenda: "Agenda do Congresso", resultado: "Resultado da votação",
};

type Ctx = CanvasRenderingContext2D;

function spacing(ctx: Ctx, px: number) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

const seatCache = new Map<number, SeatPos[]>();
const seats = (n: number) => { let s = seatCache.get(n); if (!s) { s = hemiSeats(n); seatCache.set(n, s); } return s; };

/** Desenha a cena no instante `t` ∈ [0,1]. O canvas pode ter qualquer largura; o desenho é feito em 1080 de largura. */
export function drawScene(ctx: Ctx, W: number, H: number, d: ShareData, t: number, a: Assets): void {
  const s = W / 1080;
  const DW = 1080, DH = H / s;
  const story = DH > 1400;
  ctx.save();
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // Fundo
  const g = ctx.createLinearGradient(0, 0, DW * 0.4, DH);
  g.addColorStop(0, C.bg0); g.addColorStop(1, C.bg1);
  ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);
  const glow = ctx.createRadialGradient(DW * 0.85, DH * 0.1, 0, DW * 0.85, DH * 0.1, DW * 0.8);
  glow.addColorStop(0, "rgba(0,156,59,0.28)"); glow.addColorStop(1, "rgba(0,156,59,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, DW, DH);
  ctx.fillStyle = C.verde; ctx.fillRect(0, 0, DW / 3, 12);
  ctx.fillStyle = C.amarelo; ctx.fillRect(DW / 3, 0, DW / 3, 12);
  ctx.fillStyle = C.branco; ctx.fillRect((2 * DW) / 3, 0, DW / 3, 12);

  const pad = 80, maxW = DW - pad * 2;
  const intro = (k: number) => easeOutCubic(phase(t, REEL_PHASES.intro[0] + k * 0.035, REEL_PHASES.intro[1] + k * 0.035));
  const enter = (k: number, draw: () => void) => {
    const p = intro(k);
    if (p <= 0) return;
    ctx.save(); ctx.globalAlpha = p; ctx.translate(0, (1 - p) * 28); draw(); ctx.restore();
  };

  // Cabeçalho: marca
  const top = story ? 120 : 76;
  enter(0, () => {
    if (a.logo) ctx.drawImage(a.logo, pad, top, 72, 72);
    ctx.font = DISPLAY(700, 46); spacing(ctx, -0.5);
    ctx.fillStyle = C.branco; ctx.fillText("emenda", pad + 92, top + 52);
    const w = ctx.measureText("emenda").width;
    ctx.fillStyle = C.verdeClaro; ctx.fillText(".online", pad + 92 + w, top + 52);
    spacing(ctx, 0);
  });

  // Eyebrow + título + subtítulo
  let y = top + (story ? 230 : 170);
  enter(1, () => {
    ctx.font = SANS(600, 30); spacing(ctx, 4); ctx.fillStyle = C.amarelo;
    ctx.fillText(KIND_LABEL[d.kind].toUpperCase(), pad, y);
    spacing(ctx, 0);
  });
  y += 30;
  const measureAt = (font: (s: number) => string) => (size: number) => (txt: string) => { ctx.font = font(size); return ctx.measureText(txt).width; };
  const titleFit = fitFont(d.title, { maxWidth: maxW, maxLines: story ? 4 : 3, sizes: story ? [96, 84, 72, 60, 52] : [76, 66, 56, 48, 42], measureAt: measureAt((z) => DISPLAY(700, z)) });
  const lh = titleFit.size * 1.1;
  const titleY = y;
  enter(2, () => {
    ctx.font = DISPLAY(700, titleFit.size); spacing(ctx, -0.5); ctx.fillStyle = C.branco;
    titleFit.lines.forEach((l, i) => ctx.fillText(l, pad, titleY + lh * (i + 1)));
    spacing(ctx, 0);
  });
  y += lh * titleFit.lines.length + 16;
  if (d.subtitle) {
    ctx.font = SANS(400, 32);
    const sub = wrapText(d.subtitle, maxW, (x) => ctx.measureText(x).width, story ? 3 : 2);
    const subY = y;
    enter(3, () => { ctx.font = SANS(400, 32); ctx.fillStyle = C.muted; sub.forEach((l, i) => ctx.fillText(l, pad, subY + 40 * (i + 1))); });
    y += 40 * sub.length + 8;
  }

  // Número principal
  const pc = phase(t, ...REEL_PHASES.count);
  y += story ? 90 : 40;
  let listTop = 0;
  if (d.kind === "agenda") {
    const p = easeOutCubic(pc);
    if (d.destaque) {
      const fit = fitFont(d.destaque, { maxWidth: maxW, maxLines: 1, sizes: story ? [130, 112, 96, 80] : [104, 92, 80, 68], measureAt: measureAt((z) => SANS(800, z)) });
      const pulse = 1 + 0.04 * Math.sin(Math.PI * phase(t, REEL_PHASES.count[1], REEL_PHASES.hold[1]));
      ctx.save(); ctx.globalAlpha = p; ctx.translate(pad, y + fit.size * 0.9); ctx.scale(pulse, pulse);
      ctx.font = SANS(800, fit.size); ctx.fillStyle = C.amarelo; ctx.fillText(fit.lines[0] ?? "", 0, 0);
      ctx.restore();
      y += fit.size * 0.9 + 18;
    }
    if (d.casa) {
      ctx.font = SANS(600, 32); ctx.fillStyle = C.branco; ctx.globalAlpha = p;
      ctx.fillText(truncate(d.casa, 48), pad, y + 32); ctx.globalAlpha = 1;
      y += 50;
    }
    listTop = y + 24;
  } else if (d.kind === "voto" && d.voto) {
    const side: VoteSide = /^sim/i.test(d.voto) ? "sim" : /^n[ãa]o/i.test(d.voto) ? "nao" : "outros";
    const p = easeOutCubic(pc);
    ctx.font = SANS(600, 36); ctx.fillStyle = C.branco; ctx.globalAlpha = p;
    ctx.fillText(truncate(`${d.pessoa ?? "Deputado(a)"} votou`, 48), pad, y + 36);
    const word = d.voto.toUpperCase();
    const size = story ? 170 : 130;
    ctx.font = SANS(800, size);
    const ww = ctx.measureText(word).width;
    const sc = 0.7 + 0.3 * p;
    ctx.save(); ctx.translate(pad, y + 60); ctx.scale(sc, sc);
    ctx.fillStyle = SIDE[side]; rrect(ctx, 0, 0, ww + 64, size * 1.15, 28); ctx.fill();
    ctx.fillStyle = side === "outros" ? C.bg1 : C.branco; ctx.fillText(word, 32, size * 0.95);
    ctx.restore(); ctx.globalAlpha = 1;
    y += 60 + size * 1.15 + 30;
  } else if (d.votes) {
    const v = d.votes;
    if (d.resultado) {
      const word = d.resultado === "aprovada" ? "APROVADA" : "REJEITADA";
      const p = easeOutCubic(phase(t, REEL_PHASES.count[0], REEL_PHASES.count[0] + 0.15));
      const bs = story ? 76 : 60;
      ctx.font = SANS(800, bs);
      const bw = ctx.measureText(word).width + 56;
      ctx.save(); ctx.globalAlpha = p; ctx.translate(pad, y); ctx.scale(0.85 + 0.15 * p, 0.85 + 0.15 * p);
      ctx.fillStyle = d.resultado === "aprovada" ? C.verde : C.nao; rrect(ctx, 0, 0, bw, bs * 1.35, 20); ctx.fill();
      ctx.fillStyle = C.branco; ctx.fillText(word, 28, bs * 1.05);
      ctx.restore();
      y += bs * 1.35 + 30;
    }
    const size = story ? 150 : 112;
    ctx.font = SANS(800, size);
    const sim = String(countUp(v.sim, pc)), nao = String(countUp(v.nao, pc));
    ctx.fillStyle = C.verdeClaro; ctx.fillText(sim, pad, y + size);
    const w1 = ctx.measureText(`${v.sim}`).width;
    ctx.font = SANS(600, 32); ctx.fillStyle = C.muted; ctx.fillText("SIM", pad, y + size + 44);
    const x2 = Math.max(pad + w1 + 120, DW / 2);
    ctx.font = SANS(800, size); ctx.fillStyle = C.nao; ctx.fillText(nao, x2, y + size);
    ctx.font = SANS(600, 32); ctx.fillStyle = C.muted; ctx.fillText("NÃO", x2, y + size + 44);
    y += size + 70;
  } else if (d.metric) {
    const m = d.metric;
    const final = formatMetric(m);
    const fit = fitFont(final, { maxWidth: maxW, maxLines: 1, sizes: story ? [170, 150, 130, 110, 90] : [140, 124, 108, 92, 76], measureAt: measureAt((z) => SANS(800, z)) });
    const cur = pc >= 1 ? final : formatMetric({ ...m, value: countUp(m.value, pc) });
    ctx.font = SANS(800, fit.size); ctx.fillStyle = C.amarelo; ctx.globalAlpha = Math.min(1, pc * 4);
    ctx.fillText(cur, pad, y + fit.size * 0.92);
    ctx.globalAlpha = 1;
    y += fit.size * 0.92 + 16;
    if (m.label) {
      ctx.font = SANS(600, 34); ctx.fillStyle = C.branco; ctx.globalAlpha = easeOutCubic(pc);
      ctx.fillText(truncate(m.label, 52), pad, y + 34); ctx.globalAlpha = 1;
      y += 50;
    }
  }

  // Rodapé
  const qrSize = story ? 240 : 176;
  const footTop = DH - pad - qrSize;
  enter(4, () => drawFooter(ctx, d, a, pad, footTop, DW, qrSize));

  // Gráfico
  const pChart = phase(t, ...REEL_PHASES.chart);
  const region = { top: y + 30, bottom: footTop - (story ? 80 : 40) };
  if (d.kind === "agenda" && d.items?.length) drawItems(ctx, d.items, pChart, { top: listTop, bottom: footTop - 40 }, pad, maxW);
  else if (d.votes && region.bottom - region.top > 150) drawHemicycle(ctx, d.votes, pChart, region, DW);
  else if (d.bars?.length && region.bottom - region.top > 150) drawBars(ctx, d, pChart, region, pad, maxW);

  // Abertura: sai do mesmo fundo liso em que a vinheta termina.
  const open = 1 - easeInOut(phase(t, 0, 0.06));
  if (open > 0) { ctx.fillStyle = `rgba(0,12,38,${open})`; ctx.fillRect(0, 0, DW, DH); }

  // Vinheta final (loop sem emenda: termina em fundo liso como o quadro 0)
  const ps = phase(t, ...REEL_PHASES.sting);
  if (ps > 0) drawSting(ctx, ps, DW, DH, a);
  ctx.restore();
}

function drawFooter(ctx: Ctx, d: ShareData, a: Assets, pad: number, y: number, DW: number, size: number) {
  const x = DW - pad - size;
  ctx.fillStyle = C.branco; rrect(ctx, x, y, size, size, 20); ctx.fill();
  const q = a.qr, m = 10, cell = (size - m * 2) / q.size;
  ctx.fillStyle = C.bg1;
  for (let r = 0; r < q.size; r++) for (let c = 0; c < q.size; c++) {
    if (q.dark[r * q.size + c]) ctx.fillRect(x + m + c * cell, y + m + r * cell, Math.ceil(cell), Math.ceil(cell));
  }
  const tw = x - pad - 32;
  ctx.font = SANS(600, 32); ctx.fillStyle = C.branco;
  ctx.fillText("Veja os dados completos em", pad, y + size * 0.42);
  const u = new URL(absoluteUrl(d.url));
  const shown = `${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  ctx.font = SANS(700, 34);
  const lines = wrapText(shown, tw, (s) => ctx.measureText(s).width, 1);
  ctx.fillStyle = C.verdeClaro; ctx.fillText(lines[0] ?? "", pad, y + size * 0.42 + 46);
  ctx.font = SANS(400, 24); ctx.fillStyle = C.muted;
  ctx.fillText("Dados públicos · Transparência, Câmara e Senado", pad, y + size - 6);
}

function drawHemicycle(ctx: Ctx, v: { sim: number; nao: number; outros: number }, p: number, r: { top: number; bottom: number }, DW: number) {
  const total = v.sim + v.nao + v.outros;
  if (!total) return;
  const sides = voteColors(v);
  const pos = seats(total);
  const R = Math.min(DW / 2 - 90, r.bottom - r.top - 10);
  const cx = DW / 2, cy = r.bottom;
  const dot = Math.min(R * 0.05, R * 0.95 * Math.sqrt(Math.PI / 2 / total) * 0.5);
  const shown = Math.floor(total * easeOutCubic(p));
  for (let i = 0; i < total; i++) {
    const s = pos[i]!;
    ctx.fillStyle = i < shown ? SIDE[sides[i]!] : "rgba(255,255,255,0.08)";
    ctx.beginPath(); ctx.arc(cx + s.x * R, cy + s.y * R, dot, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBars(ctx: Ctx, d: ShareData, p: number, r: { top: number; bottom: number }, pad: number, maxW: number) {
  const bars = barLayout(d.bars ?? []);
  const rowH = Math.min(110, (r.bottom - r.top) / bars.length);
  const fmt = (x: number) => (d.metric?.format === "brl" ? formatBRL(x, true) : new Intl.NumberFormat("pt-BR").format(x));
  bars.forEach((b, i) => {
    const q = easeOutCubic(phase(p, i * 0.1, 0.6 + i * 0.1));
    const y = r.top + i * rowH;
    ctx.globalAlpha = Math.min(1, q * 3);
    ctx.font = SANS(600, 28); ctx.fillStyle = C.branco; ctx.textAlign = "left";
    const val = fmt(b.value);
    const vw = ctx.measureText(val).width;
    ctx.fillText(truncate(b.label, 40), pad, y + 30, maxW - vw - 24);
    ctx.textAlign = "right"; ctx.fillStyle = C.muted; ctx.fillText(val, pad + maxW, y + 30); ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.08)"; rrect(ctx, pad, y + 44, maxW, 22, 11); ctx.fill();
    ctx.fillStyle = i === 0 ? C.amarelo : C.verdeClaro;
    rrect(ctx, pad, y + 44, Math.max(22, maxW * b.ratio * q), 22, 11); ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function drawSting(ctx: Ctx, p: number, DW: number, DH: number, a: Assets) {
  const cover = easeInOut(phase(p, 0, 0.45));
  ctx.fillStyle = `rgba(0,12,38,${cover})`; ctx.fillRect(0, 0, DW, DH);
  const show = easeOutCubic(phase(p, 0.2, 0.6)) * (1 - easeInOut(phase(p, 0.82, 1)));
  if (show <= 0) return;
  ctx.save();
  ctx.globalAlpha = show;
  ctx.translate(DW / 2, DH / 2);
  const sc = 0.8 + 0.2 * show;
  ctx.scale(sc, sc);
  if (a.logo) ctx.drawImage(a.logo, -80, -200, 160, 160);
  ctx.font = DISPLAY(700, 84); ctx.textAlign = "center"; spacing(ctx, -1);
  const w1 = ctx.measureText("emenda").width, w2 = ctx.measureText(".online").width;
  ctx.textAlign = "left";
  ctx.fillStyle = C.branco; ctx.fillText("emenda", -(w1 + w2) / 2, 40);
  ctx.fillStyle = C.verdeClaro; ctx.fillText(".online", -(w1 + w2) / 2 + w1, 40);
  spacing(ctx, 0);
  ctx.font = SANS(500, 32); ctx.fillStyle = C.muted; ctx.textAlign = "center";
  ctx.fillText("Siga o dinheiro público.", 0, 110);
  ctx.restore();
}

function drawItems(ctx: Ctx, items: NonNullable<ShareData["items"]>, p: number, r: { top: number; bottom: number }, pad: number, maxW: number) {
  const rowH = 104;
  const note = 48;
  let fit = Math.max(0, Math.floor((r.bottom - r.top) / rowH));
  if (fit < items.length) fit = Math.max(0, Math.floor((r.bottom - r.top - note) / rowH));
  const shown = items.slice(0, Math.min(fit, 5));
  shown.forEach((it, i) => {
    const q = easeOutCubic(phase(p, i * 0.12, 0.5 + i * 0.12));
    if (q <= 0) return;
    const y = r.top + i * rowH;
    ctx.save(); ctx.globalAlpha = q; ctx.translate((1 - q) * 60, 0);
    ctx.fillStyle = "rgba(255,255,255,0.06)"; rrect(ctx, pad, y, maxW, rowH - 14, 18); ctx.fill();
    ctx.fillStyle = C.amarelo; rrect(ctx, pad, y, 8, rowH - 14, 4); ctx.fill();
    ctx.font = SANS(700, 30); ctx.fillStyle = C.amarelo;
    const hw = it.hora ? ctx.measureText(it.hora).width + 22 : 0;
    if (it.hora) ctx.fillText(it.hora, pad + 28, y + 40);
    ctx.font = SANS(800, 34); ctx.fillStyle = C.branco;
    ctx.fillText(truncate(it.sigla, 28), pad + 28 + hw, y + 40, maxW - 56 - hw);
    if (it.titulo) {
      ctx.font = SANS(400, 26); ctx.fillStyle = C.muted;
      const l = wrapText(it.titulo, maxW - 56, (x) => ctx.measureText(x).width, 1);
      ctx.fillText(l[0] ?? "", pad + 28, y + 76);
    }
    ctx.restore();
  });
  const rest = items.length - shown.length;
  if (rest > 0) {
    ctx.globalAlpha = easeOutCubic(phase(p, 0.6, 1));
    ctx.font = SANS(600, 28); ctx.fillStyle = C.verdeClaro;
    ctx.fillText(`+${rest} ${rest === 1 ? "item" : "itens"} na pauta`, pad, r.top + shown.length * rowH + 30);
    ctx.globalAlpha = 1;
  }
}
