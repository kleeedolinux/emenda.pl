// emenda.online reel: deterministic scene graph driven by seek(t).
// Timeline is in beats (128 BPM, 64 beats = 30 s). Cuts: 0 8 20 32 44 48 52 56.
const Q = new URLSearchParams(location.search);
const W = +(Q.get("w") || 1920), H = +(Q.get("h") || 1080);
const PORT = H > W;
const BPM = 128;
const D = await (await fetch("../data/reel-data.json")).json();
const MARK_SVG = await (await fetch("../assets/brand/logo-mark.svg")).text();

// ---------- helpers ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const pr = (b, a, d) => clamp((b - a) / d);
const E = {
  out3: (t) => 1 - (1 - t) ** 3,
  out5: (t) => 1 - (1 - t) ** 5,
  in3: (t) => t ** 3,
  inOut3: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : 2 ** (10 * t - 10)),
  outBack: (t, s = 1.9) => (t >= 1 ? 1 : 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2),
};
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
const SVGNS = "http://www.w3.org/2000/svg";
function sv(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
// transform: (x,y) is the element center unless c=false (top-left anchor).
function tf(e, o) {
  const { x = 0, y = 0, s = 1, sx, sy, r = 0, rx = 0, ry = 0, op = 1, blur = 0, c = true, skx = 0 } = o;
  e.style.transform =
    `translate(${x.toFixed(2)}px,${y.toFixed(2)}px)${c ? " translate(-50%,-50%)" : ""}` +
    (rx || ry ? ` perspective(1400px) rotateX(${rx}deg) rotateY(${ry}deg)` : "") +
    (r ? ` rotate(${r}deg)` : "") + (skx ? ` skewX(${skx}deg)` : "") +
    ` scale(${(sx ?? s).toFixed(4)},${(sy ?? s).toFixed(4)})`;
  e.style.opacity = clamp(op).toFixed(3);
  e.style.filter = blur > 0.1 ? `blur(${blur.toFixed(1)}px)` : "none";
}
const nf1 = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const bi = (v) => `R$ ${nf1(v / 1e9)} bi`;
const mi = (v) => `R$ ${nf1(v / 1e6)} mi`;
const int = (v) => Math.round(v).toLocaleString("pt-BR");
function hex(c) {
  if (Array.isArray(c)) return c;
  if (c.startsWith("rgb")) return c.match(/[\d.]+/g).slice(0, 3).map(Number);
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], clamp(t)))).join(",")})`; }
// decaying shake from a list of hit beats
function shake(b, hits, amp = 10) {
  let dx = 0, dy = 0;
  for (const h of hits) {
    const d = b - h;
    if (d < 0 || d > 0.6) continue;
    const k = Math.exp(-d * 9) * amp;
    dx += Math.sin(d * 70) * k; dy += Math.cos(d * 53) * k * 0.7;
  }
  return [dx, dy];
}
const L = (land, port) => (PORT ? port : land);

const C = { verde: "#009c3b", verdeL: "#1fc35f", amarelo: "#ffdf00", azul: "#002776", nao: "#ff5a5f", navy: "#050d1f" };

// ---------- stage ----------
const stage = document.getElementById("stage");
stage.style.width = W + "px";
stage.style.height = H + "px";
const bg = el("canvas", "bg", stage);
bg.width = W; bg.height = H;
const g = bg.getContext("2d");

const scenes = [];
function scene(a, b, build) {
  const root = el("div", "scene", stage);
  const cam = el("div", "cam", root);
  const s = { a, b, root, cam, update: null };
  s.update = build(s);
  scenes.push(s);
  return s;
}

// background particles
const R0 = rng(7);
const parts = Array.from({ length: 90 }, () => ({ x: R0(), y: R0(), z: 0.3 + R0() * 0.7, sp: 0.02 + R0() * 0.05, rs: R0() < 0.25 }));
function drawBg(b) {
  g.globalAlpha = 1;
  const gr = g.createLinearGradient(0, 0, W * 0.3, H);
  gr.addColorStop(0, "#071634"); gr.addColorStop(1, "#030a19");
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const groove = b >= 8 && b < 56;
  const pulse = groove ? Math.exp(-(b % 1) * 5) : b < 8 ? Math.exp(-(b % 1) * 4) * (b < 4 ? 1 : 0.5) : 0;
  const glow = (x, y, r, col, a) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col.replace("A", a)); rg.addColorStop(1, col.replace("A", 0));
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
  };
  const t = b * 0.05;
  glow(W * (0.15 + 0.08 * Math.sin(t)), H * (0.2 + 0.1 * Math.cos(t * 1.3)), Math.max(W, H) * 0.7, "rgba(0,156,59,A)", 0.16 + 0.06 * pulse);
  glow(W * (0.9 - 0.06 * Math.sin(t * 0.8)), H * (0.95 - 0.08 * Math.sin(t)), Math.max(W, H) * 0.75, "rgba(20,70,190,A)", 0.24 + 0.05 * pulse);
  glow(W * 0.5, H * 0.5, Math.max(W, H) * 0.5, "rgba(255,223,0,A)", 0.03 + 0.05 * pulse);
  // dot grid
  g.fillStyle = "rgba(160,185,230,0.09)";
  const step = 48, off = (b * 6) % step;
  for (let y = -step + off; y < H + step; y += step)
    for (let x = (y / step) % 2 ? step / 2 : 0; x < W; x += step) g.fillRect(x, y, 2, 2);
  // drifting particles / R$ glyphs
  g.textAlign = "center"; g.textBaseline = "middle";
  for (const p of parts) {
    const y = ((p.y - b * p.sp * p.z) % 1 + 1) % 1;
    const x = p.x + Math.sin(b * 0.3 + p.y * 10) * 0.01;
    const a = 0.12 * p.z + pulse * 0.1 * p.z;
    if (p.rs) {
      g.font = `700 ${Math.round(18 + 26 * p.z)}px "Space Grotesk"`;
      g.fillStyle = `rgba(255,223,0,${a * 0.9})`;
      g.fillText("R$", x * W, y * H);
    } else {
      g.fillStyle = `rgba(200,220,255,${a})`;
      g.beginPath(); g.arc(x * W, y * H, 1.5 + 2.5 * p.z, 0, 7); g.fill();
    }
  }
  // burst on the logo hit
  if (b >= 56) {
    const d = b - 56, R = rng(99);
    for (let i = 0; i < 70; i++) {
      const ang = R() * Math.PI * 2, sp = 300 + R() * 900, col = [C.amarelo, C.verdeL, "#ffffff", "#4d8dff"][i % 4];
      const r = sp * E.out5(clamp(d / 3));
      const a = clamp(1 - d / 3.5);
      if (a <= 0) break;
      g.fillStyle = col; g.globalAlpha = a;
      g.beginPath(); g.arc(W / 2 + Math.cos(ang) * r, H * 0.47 + Math.sin(ang) * r, 3 + R() * 6, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }
}

// ============ S1 hook 0-8 ============
scene(0, 8, (s) => {
  const fs = L(150, 116);
  const lines = [
    { t: "Pra onde vai", cls: "", at: 0 },
    { t: "o dinheiro", cls: "am", at: 1 },
    { t: "das emendas?", cls: "vd", at: 2 },
  ].map((l) => {
    const e = el("div", "abs disp " + l.cls, s.cam);
    e.style.fontSize = fs + "px";
    if (l.at === 2) {
      l.chars = [...l.t].map((ch) => {
        const sp = el("span", "", e, ch === " " ? "&nbsp;" : ch);
        sp.style.display = "inline-block";
        return sp;
      });
    } else e.textContent = l.t;
    return { ...l, e };
  });
  const words = ["siga", "o", "dinheiro", "público"].map((w, i) => {
    const e = el("div", "abs disp " + ["", "", "am", "vd"][i], s.cam, w);
    e.style.fontSize = L(270, 210) + "px";
    return { e, at: 4 + i * 0.5 };
  });
  const phrase = el("div", "abs disp", s.cam, PORT ? 'siga o<br><span class="am">dinheiro público</span>' : 'siga o <span class="am">dinheiro público</span>');
  phrase.style.fontSize = L(124, 112) + "px";
  phrase.style.textAlign = "center";
  phrase.style.lineHeight = "1.05";
  const ul = el("div", "abs", s.cam);
  ul.style.height = "12px"; ul.style.background = C.amarelo; ul.style.borderRadius = "6px";
  const rs = el("div", "abs disp am", s.cam, "R$");
  rs.style.fontSize = "300px";
  const cap = el("div", "abs cap", s.cam, "emenda.online");
  cap.style.color = "#c9d6f0";
  return (b) => {
    const [dx, dy] = shake(b, [0, 1, 2, 3], 14);
    const cs = 1 + 0.07 * E.inOut3(pr(b, 0, 4));
    tf(s.cam, { x: dx, y: dy, s: cs, c: false });
    const exit = pr(b, 3.75, 0.35);
    lines.forEach((l, i) => {
      const p = pr(b, l.at, 0.42), e = E.outExpo(p);
      const y = H / 2 + (i - 1) * fs * 1.08;
      if (l.chars) {
        tf(l.e, { x: W / 2, y, op: (b >= l.at ? 1 : 0) * (1 - exit), s: 1 + exit * 0.4, blur: exit * 20 });
        l.chars.forEach((ch, j) => {
          const q = E.outBack(pr(b, l.at + j * 0.035, 0.35));
          ch.style.transform = `translateY(${(1 - q) * 80}px) scale(${0.4 + 0.6 * q}) rotate(${(1 - q) * -20}deg)`;
          ch.style.opacity = clamp(q * 2);
        });
        // question mark wiggle on beat 3
        const last = l.chars[l.chars.length - 1], w = pr(b, 3, 0.6);
        if (w > 0 && w < 1) last.style.transform = `rotate(${Math.sin(w * 18) * 18 * (1 - w)}deg) scale(${1 + 0.4 * Math.sin(w * Math.PI)})`;
      } else if (i === 1) {
        tf(l.e, { x: W / 2, y: y + (1 - e) * 90, op: (b >= l.at ? Math.min(1, p * 4) : 0) * (1 - exit), skx: (1 - e) * -14, s: 1 + exit * 0.4, blur: exit * 20 });
      } else {
        tf(l.e, { x: W / 2, y, s: lerp(2.1, 1, e) + exit * 0.4, op: Math.min(1, p * 3) * (1 - exit), blur: (1 - e) * 22 + exit * 20 });
      }
    });
    words.forEach((w, i) => {
      const on = b >= w.at && b < w.at + 0.5 && b < 6;
      const p = E.outExpo(pr(b, w.at, 0.18));
      tf(w.e, { x: W / 2 + (i % 2 ? 1 : -1) * (1 - p) * 120, y: H / 2, s: lerp(1.5, 1, p), op: on ? 1 : 0, r: (1 - p) * (i % 2 ? 6 : -6) });
    });
    const pp = E.outExpo(pr(b, 6, 0.3));
    const zoom = E.inExpo(pr(b, 7, 1));
    tf(phrase, { x: W / 2, y: H / 2, s: lerp(0.7, 1, pp) * (1 + zoom * 0.6), op: b >= 6 ? 1 - pr(b, 7.2, 0.4) : 0, blur: pr(b, 7.2, 0.4) * 16 });
    const uw = PORT ? 860 : 1180;
    const up = E.inOut3(pr(b, 6.2, 0.5));
    ul.style.width = uw * up + "px";
    tf(ul, { x: W / 2 - uw / 2, y: H / 2 + L(80, 140), c: false, op: b >= 6.2 ? 1 - pr(b, 7.2, 0.3) : 0 });
    tf(rs, { x: W / 2, y: H / 2, s: 0.3 + zoom * 40, op: b >= 7 ? clamp(pr(b, 7, 0.2)) : 0, r: zoom * -12 });
    tf(cap, { x: W / 2, y: H - 70, op: b < 6 ? clamp(pr(b, 0.5, 0.5)) * 0.8 : 0 });
  };
});

// ============ S2 mapa + total + Emenda Pix 8-20 ============
scene(8, 20, (s) => {
  const M = D.mapa;
  const maxP = Math.max(...M.estados.map((e) => e.pago));
  const mapH = L(900, 760), msc = mapH / M.h;
  const mapC = L([1370, 555], [540, 880]);
  const svg = sv("svg", { viewBox: `0 0 ${M.w} ${M.h}`, width: M.w * msc, height: mapH }, s.cam);
  svg.classList.add("abs");
  svg.style.overflow = "visible";
  const order = [...M.estados].sort((a, b) => b.pago - a.pago).map((e) => e.uf);
  const st = M.estados.map((e) => {
    const p = sv("path", { d: e.d, pathLength: 1, "stroke-width": 2.2 / msc, "stroke-linejoin": "round" }, svg);
    const v = Math.sqrt(e.pago / maxP);
    const fin = v < 0.6 ? mix("#12305f", C.verde, v / 0.6) : mix(C.verde, "#6dffa0", (v - 0.6) / 0.4);
    return { e, p, fin, k: order.indexOf(e.uf) };
  });
  const rings = st.map((x) => sv("circle", { cx: x.e.cx, cy: x.e.cy, r: 0, fill: "none", stroke: C.amarelo, "stroke-width": 3 / msc }, svg));
  // callouts
  const callUF = ["SP", "MG", "BA"];
  const calls = callUF.map((uf) => {
    const e = M.estados.find((x) => x.uf === uf);
    const d = el("div", "abs chip w", s.cam, `${uf} · ${bi(e.pago)}`);
    d.style.fontSize = L(24, 22) + "px"; d.style.padding = "10px 18px";
    return { e, d };
  });
  // counter block
  const left = PORT ? 70 : 110;
  const cap = el("div", "abs cap", s.cam, "emendas parlamentares pagas");
  cap.style.color = C.amarelo;
  const num = el("div", "abs disp", s.cam);
  num.style.fontSize = L(150, 132) + "px";
  const unit = el("div", "abs disp mut", s.cam, "bilhões");
  unit.style.fontSize = L(70, 60) + "px";
  const sub = el("div", "abs", s.cam, "2014 – 2026");
  sub.style.cssText += `font-size:${L(30, 28)}px;font-weight:600;color:#c9d6f0;white-space:nowrap`;
  const yrs = Object.entries(D.por_ano);
  const yMax = Math.max(...yrs.map((y) => y[1]));
  const barsBox = el("div", "abs", s.cam);
  const bars = yrs.map(([y, v], i) => {
    const b = el("div", "abs", barsBox);
    b.style.cssText += `width:${L(38, 0)}px;border-radius:7px 7px 2px 2px;background:linear-gradient(${C.verdeL},${C.verde})`;
    return { y, v, b, i };
  });
  const yl0 = el("div", "abs src", barsBox, "2014"), yl1 = el("div", "abs src", barsBox, "2026");
  const src = el("div", "abs src", s.cam, "Fonte: Portal da Transparência/CGU · pago + restos a pagar pagos");
  // Pix block
  const pix = el("div", "abs badge", s.cam, "EMENDA PIX");
  pix.style.cssText += `font-size:${L(54, 50)}px;padding:12px 30px;border-radius:18px;letter-spacing:0.04em`;
  const pnum = el("div", "abs disp am", s.cam);
  pnum.style.fontSize = L(190, 170) + "px";
  const pl1 = el("div", "abs", s.cam, "transferências especiais · 2020 – 2026");
  pl1.style.cssText += `font-size:${L(34, 32)}px;font-weight:700;white-space:nowrap`;
  const pl2 = el("div", "abs mut", s.cam, PORT ? "repasse direto a estados e<br>municípios, sem convênio" : "repasse direto a estados e municípios, sem convênio");
  pl2.style.cssText += `font-size:${L(30, 30)}px;font-weight:500;white-space:nowrap;line-height:1.25;text-align:${L("left", "center")}`;
  const pyrs = Object.entries(D.pix_por_ano);
  const pMax = Math.max(...pyrs.map((y) => y[1]));
  const pbars = pyrs.map(([y, v]) => {
    const wrap = el("div", "abs", s.cam);
    const bar = el("div", "", wrap);
    bar.style.cssText = `width:100%;border-radius:8px 8px 2px 2px;background:linear-gradient(#fff07a,${C.amarelo});position:absolute;bottom:0`;
    const yl = el("div", "abs src", s.cam, y); yl.style.color = "#c9d6f0"; yl.style.fontSize = "20px";
    const vl = el("div", "abs", s.cam, nf1(v / 1e9)); vl.style.cssText += "font-weight:800;font-size:22px;white-space:nowrap";
    return { y, v, wrap, bar, yl, vl };
  });
  const psrc = el("div", "abs src", s.cam, "valores pagos em R$ bilhões por ano · Portal da Transparência/CGU");

  return (b) => {
    const pixOn = pr(b, 13.8, 0.6);
    const [dx, dy] = shake(b, [8, 14], 12);
    tf(s.cam, { x: dx, y: dy, s: 1 + 0.03 * pr(b, 8, 12), c: false });
    // map
    const mp = E.outExpo(pr(b, 8, 1.2));
    const dim = E.inOut3(pixOn);
    const mx = mapC[0] + (PORT ? 0 : dim * 120), my = mapC[1] + (PORT ? dim * 80 : 0);
    tf(svg, { x: mx, y: my, s: lerp(0.82, 1, mp) * (1 - dim * 0.08), r: lerp(-4, 0, mp), op: lerp(1, PORT ? 0.13 : 0.22, dim) });
    const draw = E.inOut3(pr(b, 8, 1.4));
    st.forEach((x, i) => {
      x.p.setAttribute("stroke-dasharray", "1 1");
      x.p.setAttribute("stroke-dashoffset", (1 - draw).toFixed(4));
      const tl = 9 + x.k * 0.11;
      const q = pr(b, tl, 0.7);
      x.p.setAttribute("stroke", q > 0 ? mix(C.amarelo, "#0a1a3a", q) : C.amarelo);
      x.p.setAttribute("fill", b < tl ? "rgba(18,40,85,0.55)" : mix("#ffef7a", x.fin, E.out3(q)));
      const rq = pr(b, tl, 1.0);
      rings[i].setAttribute("r", (rq * 70 / msc * 1.2).toFixed(1));
      rings[i].setAttribute("opacity", rq > 0 && rq < 1 ? (1 - rq).toFixed(3) : 0);
    });
    calls.forEach((c, i) => {
      const p = E.outBack(pr(b, 12.4 + i * 0.3, 0.45));
      const off = [L([170, 20], [150, 20]), L([-190, 0], [-170, 0]), L([-10, -110], [-20, -100])][i];
      const x = mx + (c.e.cx - M.w / 2) * msc + off[0];
      const y = my + (c.e.cy - M.h / 2) * msc + off[1];
      tf(c.d, { x, y, s: p, op: (b >= 12.4 + i * 0.3 ? 1 : 0) * (1 - pixOn) });
    });
    // counter
    const cin = E.outExpo(pr(b, 8.2, 0.6));
    const out = E.out3(pr(b, 13.55, 0.4));
    const ox = -out * 300;
    const tick = E.out3(pr(b, 8.4, 5));
    const v = D.total_pago * tick;
    num.textContent = "R$ " + nf1(v / 1e9);
    const cy0 = L(300, 140);
    tf(cap, { x: left + ox, y: cy0, c: false, op: cin * (1 - out) });
    tf(num, { x: left + ox + (1 - cin) * -80, y: cy0 + L(48, 44), c: false, op: cin * (1 - out) });
    tf(unit, { x: left + ox, y: cy0 + L(205, 180), c: false, op: E.out3(pr(b, 8.6, 0.5)) * (1 - out) });
    tf(sub, { x: left + ox + L(260, 230), y: cy0 + L(222, 192), c: false, op: E.out3(pr(b, 8.9, 0.5)) * (1 - out) });
    // year bars (landscape only)
    if (!PORT) {
      const bx = left, by = 880, bw = 38, gap = 13, bh = 250;
      tf(barsBox, { x: ox, y: 0, c: false, op: 1 - out });
      bars.forEach((r) => {
        const p = E.outBack(pr(b, 9.3 + r.i * 0.14, 0.6), 1.4);
        const h = (r.v / yMax) * bh * p;
        r.b.style.height = Math.max(0, h) + "px";
        tf(r.b, { x: bx + r.i * (bw + gap), y: by - h, c: false, op: p > 0 ? 1 : 0 });
      });
      tf(yl0, { x: bx, y: by + 12, c: false, op: pr(b, 9.5, 0.4) });
      tf(yl1, { x: bx + 12 * (bw + gap) - 6, y: by + 12, c: false, op: pr(b, 11, 0.4) });
    } else barsBox.style.opacity = 0;
    tf(src, { x: L(left, W / 2), y: H - L(48, 46), c: !PORT ? false : true, op: pr(b, 9, 0.5) * (1 - out) });
    // pix
    const pin = pr(b, 14, 0.35);
    const stamp = E.outBack(pin, 2.4);
    const py0 = L(250, 150);
    const px = L(left, W / 2);
    const anchor = PORT ? true : false;
    tf(pix, { x: px + (PORT ? 0 : 0), y: py0, c: anchor, s: lerp(3, 1, stamp), r: lerp(-14, -3, stamp), op: b >= 14 ? Math.min(1, pin * 3) : 0 });
    if (!PORT) pix.style.transformOrigin = "0 50%";
    const pt = E.out3(pr(b, 14.4, 2.8));
    pnum.textContent = "R$ " + nf1((D.pix_total * pt) / 1e9) + " bi";
    const pq = E.outExpo(pr(b, 14.3, 0.5));
    tf(pnum, { x: px + (1 - pq) * (PORT ? 0 : -60), y: py0 + L(95, 150), c: anchor, op: b >= 14.3 ? pq : 0, s: PORT ? lerp(1.3, 1, pq) : 1 });
    tf(pl1, { x: px, y: py0 + L(280, 250), c: anchor, op: E.out3(pr(b, 15, 0.5)), sx: 1 });
    tf(pl2, { x: px, y: py0 + L(335, 325), c: anchor, op: E.out3(pr(b, 15.5, 0.5)) });
    // pix bars
    const pbx = L(left, 120), pbw = L(64, 94), pgap = L(26, 36), pby = L(930, 1200), pbh = L(250, 420);
    pbars.forEach((r, i) => {
      const p = E.outBack(pr(b, 16 + i * 0.22, 0.6), 1.5);
      const h = (r.v / pMax) * pbh * p;
      r.wrap.style.width = pbw + "px"; r.wrap.style.height = Math.max(0, h) + "px";
      r.bar.style.height = "100%";
      const x = pbx + i * (pbw + pgap);
      tf(r.wrap, { x, y: pby - h, c: false, op: b >= 16 + i * 0.22 ? 1 : 0 });
      tf(r.yl, { x: x + pbw / 2, y: pby + 22, op: b >= 16 + i * 0.22 ? 1 : 0 });
      tf(r.vl, { x: x + pbw / 2, y: pby - h - 22, op: clamp(p) });
    });
    tf(psrc, { x: L(left, W / 2), y: H - L(48, 46), c: !PORT ? false : true, op: pr(b, 16, 0.5) });
  };
});

// ============ S3 deputados 20-32 ============
scene(20, 32, (s) => {
  const head = el("div", "abs disp", s.cam, 'Cada emenda tem <span class="am">um autor</span>');
  head.style.fontSize = L(92, 72) + "px";
  const sub = el("div", "abs cap", s.cam, "8 deputados · 8 partidos · emendas pagas 2014–2026");
  sub.style.fontSize = L(22, 19) + "px";
  const cw = L(420, 500), ch = L(300, 232), ph = L(150, 136);
  const cols = L(4, 2);
  const gx = L(36, 24), gy = L(34, 18);
  const top = L(470, 345);
  const cards = D.deputados.map((d, i) => {
    const c = el("div", "card", s.cam);
    c.style.width = cw + "px"; c.style.height = ch + "px";
    const p = el("div", "ph", c);
    p.style.width = p.style.height = ph + "px";
    p.style.backgroundImage = `url(../${d.foto})`;
    const tx = el("div", "tx", c);
    el("div", "nm", tx, d.nome);
    const row = el("div", "row", tx);
    const badge = el("span", "badge", row, d.partido);
    el("span", "badge o", row, d.uf);
    const val = el("div", "val", tx);
    el("div", "lb", tx, "em emendas pagas");
    const shine = el("div", "shine", c);
    const col = i % cols, rw = Math.floor(i / cols);
    const x = W / 2 + (col - (cols - 1) / 2) * (cw + gx);
    const y = top + rw * (ch + gy);
    return { d, c, badge, val, shine, x, y, i, rr: (i * 37) % 11 - 5 };
  });
  const src = el("div", "abs src", s.cam, "Fonte: Câmara dos Deputados (Dados Abertos) · Portal da Transparência/CGU · ordem sem critério partidário");
  return (b) => {
    const [dx, dy] = shake(b, [20], 10);
    tf(s.cam, { x: dx, y: dy + 10 * Math.sin(b * 0.4), s: 1 + 0.035 * E.inOut3(pr(b, 20, 10)), c: false });
    const hp = E.outExpo(pr(b, 20, 0.5));
    const exit = pr(b, 30.5, 1.2);
    tf(head, { x: W / 2, y: L(130, 120), s: lerp(1.4, 1, hp), op: hp * (1 - pr(b, 30.4, 0.5)), blur: (1 - hp) * 14 });
    tf(sub, { x: W / 2, y: L(205, 190), op: E.out3(pr(b, 20.6, 0.5)) * (1 - pr(b, 30.4, 0.5)) });
    cards.forEach((k) => {
      const a = 20.75 + k.i * 0.25;
      const p = pr(b, a, 0.6), e = E.outBack(p, 1.3);
      const hi = 26 + k.i * 0.5;
      const bump = Math.exp(-(((b - hi) / 0.28) ** 2));
      const xe = E.in3(pr(b, 30.5 + k.i * 0.06, 0.9));
      const x = lerp(k.x, W / 2, xe), y = lerp(k.y, H / 2, xe);
      tf(k.c, { x, y: y + (1 - E.out3(p)) * 70, ry: lerp(-100, 0, e), s: (1 + 0.07 * bump) * (1 - xe * 0.92), r: xe * k.rr * 8, op: b >= a ? Math.min(1, p * 4) * (1 - pr(b, 31.3, 0.5)) : 0 });
      k.c.style.borderColor = `rgba(255,223,0,${0.1 + 0.8 * bump})`;
      const bp = E.outBack(pr(b, a + 0.35, 0.4), 3);
      k.badge.style.transform = `scale(${bp})`;
      k.badge.style.display = "inline-block";
      k.val.textContent = mi(k.d.emendas_pagas * E.out3(pr(b, a + 0.2, 2.2)));
      const sp = pr(b, hi - 0.2, 0.6);
      k.shine.style.left = lerp(-50, 150, sp) + "%";
      k.shine.style.opacity = sp > 0 && sp < 1 ? 1 : 0;
    });
    tf(src, { x: W / 2, y: H - L(48, 40), op: pr(b, 22, 0.5) * (1 - exit) });
    if (PORT) src.style.fontSize = "14px";
  };
});

// ============ S4 votacao 32-44 ============
scene(32, 44, (s) => {
  const V = D.votacao;
  const t1 = el("div", "abs disp am", s.cam, V.proposicao);
  t1.style.fontSize = L(86, 80) + "px";
  const t2 = el("div", "abs", s.cam, `${V.tema} · ${V.turno} · 06/07/2023`);
  t2.style.cssText += `font-size:${L(32, 30)}px;font-weight:700;white-space:nowrap`;
  const cv = el("canvas", "abs", s.cam);
  cv.width = W; cv.height = H;
  const cx = cv.getContext("2d");
  // seats
  const N = 491, rows = 12;
  const R = L(540, 470), r0 = L(270, 225);
  const radii = Array.from({ length: rows }, (_, i) => r0 + ((R - r0) * i) / (rows - 1));
  const sumR = radii.reduce((a, b) => a + b, 0);
  let counts = radii.map((r) => Math.round((N * r) / sumR));
  counts[rows - 1] += N - counts.reduce((a, b) => a + b, 0);
  const seats = [];
  radii.forEach((r, i) => {
    for (let j = 0; j < counts[i]; j++) {
      const th = Math.PI - (Math.PI * j) / (counts[i] - 1);
      seats.push({ r, th });
    }
  });
  seats.sort((a, b) => b.th - a.th || a.r - b.r);
  const dotR = ((R - r0) / (rows - 1)) * 0.42;
  const parties = [...V.partidos].sort((a, b) => b.sim / (b.sim + b.nao + b.abst) - a.sim / (a.sim + a.nao + a.abst) || b.sim + b.nao - a.sim - a.nao);
  const votes = [];
  for (const p of parties) {
    for (let i = 0; i < p.sim; i++) votes.push(C.verdeL);
    for (let i = 0; i < p.abst; i++) votes.push(C.amarelo);
    for (let i = 0; i < p.nao; i++) votes.push(C.nao);
  }
  const RR = rng(3);
  const dots = seats.map((st, i) => ({ ...st, col: votes[i], sx: (RR() - 0.5) * 260, sy: (RR() - 0.5) * 260, cxo: (RR() - 0.5) * 900, cyo: -200 - RR() * 500, jit: RR() * 0.35, fr: i / N }));
  // counters
  const mk = (lbl, col) => {
    const w = el("div", "abs", s.cam);
    w.style.textAlign = "center";
    const n = el("div", "disp", w); n.style.fontSize = L(62, 54) + "px"; n.style.color = col;
    const l = el("div", "cap", w, lbl); l.style.fontSize = L(20, 18) + "px"; l.style.color = "#c9d6f0"; l.style.marginTop = "8px";
    return { w, n };
  };
  const cs = [mk("sim", C.verdeL), mk("não", C.nao), mk("abst.", C.amarelo)];
  const cv_ = [V.sim, V.nao, V.abst];
  const stamp = el("div", "abs disp", s.cam, "APROVADA");
  stamp.style.cssText += `font-size:${L(40, 36)}px;color:${C.verdeL};border:5px solid ${C.verdeL};border-radius:14px;padding:8px 20px 4px;letter-spacing:0.02em`;
  // party bars
  const top8 = [...V.partidos].sort((a, b) => b.sim + b.nao + b.abst - (a.sim + a.nao + a.abst)).slice(0, 8);
  const bmax = top8[0].sim + top8[0].nao + top8[0].abst;
  const bw = L(420, 560);
  const pbars = top8.map((p, i) => {
    const row = el("div", "pbar", s.cam);
    const lb = el("div", "lbl", row, p.sigla);
    lb.style.width = L(200, 190) + "px"; lb.style.fontSize = L(22, 21) + "px";
    const trk = el("div", "trk", row);
    const segs = [[p.sim, C.verdeL], [p.abst, C.amarelo], [p.nao, C.nao]].map(([v, c]) => {
      const sg = el("div", "seg", trk); sg.style.background = c; return { v, sg };
    });
    const num = el("div", "num", row, `<span style="color:${C.verdeL}">${p.sim}</span> <span class="mut">·</span> <span style="color:${C.nao}">${p.nao}</span>${p.abst ? ` <span class="mut">·</span> <span style="color:${C.amarelo}">${p.abst}</span>` : ""}`);
    return { row, trk, segs, tot: p.sim + p.nao + p.abst, i };
  });
  const legend = el("div", "abs src", s.cam, `votos nominais por partido · <span style="color:${C.verdeL}">sim</span> · <span style="color:${C.nao}">não</span> · <span style="color:${C.amarelo}">abst.</span>`);
  legend.style.fontSize = "19px";
  const src = el("div", "abs src", s.cam, `Fonte: Câmara dos Deputados · votação ${V.id} · ${N} votos`);
  return (b) => {
    const [dx, dy] = shake(b, [32, 37.5], 12);
    tf(s.cam, { x: dx, y: dy, s: 1 + 0.03 * pr(b, 32, 12), c: false });
    const tp = E.outExpo(pr(b, 32.1, 0.5));
    tf(t1, { x: L(110, W / 2), y: L(120, 105), c: PORT, op: tp, s: lerp(1.3, 1, tp) });
    if (!PORT) t1.style.transformOrigin = "0 50%";
    tf(t2, { x: L(110, W / 2), y: L(225, 175), c: PORT, op: E.out3(pr(b, 32.5, 0.5)) });
    // hemicycle placement
    const mv = PORT ? 0 : E.inOut3(pr(b, 38, 1));
    const hx = PORT ? W / 2 : lerp(W / 2, 600, mv);
    const hy = PORT ? 790 : lerp(900, 920, mv);
    const hs = PORT ? 1 : lerp(1, 0.8, mv);
    cx.clearRect(0, 0, W, H);
    for (const d of dots) {
      const a = 32 + d.fr * 1.5 + d.jit;
      const p = E.out3(pr(b, a, 1.1));
      if (b < a) continue;
      const ex = hx + Math.cos(d.th) * d.r * hs, ey = hy - Math.sin(d.th) * d.r * hs;
      const sx = W / 2 + d.sx, sy = H / 2 + d.sy;
      const qx = (sx + ex) / 2 + d.cxo * 0.5, qy = (sy + ey) / 2 + d.cyo * 0.4;
      const x = (1 - p) ** 2 * sx + 2 * (1 - p) * p * qx + p * p * ex;
      const y = (1 - p) ** 2 * sy + 2 * (1 - p) * p * qy + p * p * ey;
      const rv = 34.8 + (1 - Math.cos(d.th)) * 0.6;
      const cq = pr(b, rv, 0.25);
      const pop = 1 + 0.7 * Math.sin(Math.PI * cq);
      cx.fillStyle = cq > 0 ? mix("#9fb3d9", d.col, cq) : "rgba(159,179,217,0.75)";
      cx.beginPath(); cx.arc(x, y, dotR * hs * pop * lerp(0.6, 1, p), 0, 7); cx.fill();
    }
    cs.forEach((c, i) => {
      const p = E.outBack(pr(b, 35 + i * 0.2, 0.5));
      c.n.textContent = int(cv_[i] * E.out3(pr(b, 35, 2)));
      const sp = L(175, 150) * hs;
      tf(c.w, { x: hx + (i - 1) * sp, y: hy - L(62, 55) * hs, s: p * hs, op: b >= 35 ? 1 : 0 });
    });
    const sp = pr(b, 37.5, 0.3);
    tf(stamp, { x: hx, y: hy - L(185, 160) * hs, s: lerp(2.6, 1, E.outBack(sp, 2)) * hs, r: -7, op: b >= 37.5 ? Math.min(1, sp * 3) : 0 });
    // bars
    const bx = L(1060, 60), by = L(370, 945), step = L(66, 44);
    pbars.forEach((r) => {
      const a = 38.4 + r.i * 0.18;
      const p = E.out3(pr(b, a, 0.5));
      tf(r.row, { x: bx + (1 - p) * 80, y: by + r.i * step, c: false, op: b >= a ? p : 0 });
      const g = E.out3(pr(b, a + 0.1, 0.9));
      r.trk.style.width = (r.tot / bmax) * bw * g + "px";
      r.trk.style.height = L(32, 28) + "px";
      r.segs.forEach((sg) => (sg.sg.style.width = (sg.v / r.tot) * 100 + "%"));
    });
    tf(legend, { x: bx + L(216, 206), y: by - L(44, 40), c: false, op: pr(b, 38.4, 0.5) });
    tf(src, { x: L(110, W / 2), y: H - L(48, 40), c: PORT, op: pr(b, 33, 0.5) });
  };
});

// ============ S5 site montage 44-56 ============
scene(44, 56, (s) => {
  const FW = L(1400, 960), FH = L(790, 1080);
  const head = el("div", "abs cap", s.cam, "tudo aberto em <b style='color:#fff'>emenda.online</b>");
  head.style.fontSize = L(24, 22) + "px";
  const fr = el("div", "frame", s.cam);
  fr.style.width = FW + "px"; fr.style.height = FH + "px";
  const bar = el("div", "bar", fr);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c) => (el("div", "dot", bar).style.background = c));
  const url = el("div", "url", bar);
  const nav = el("div", "nav", fr);
  el("div", "logo", nav, "emenda<i>.online</i>");
  const navItems = (PORT ? ["Dinheiro", "Municípios", "Proposições"] : ["Dinheiro", "Municípios", "Deputados", "Proposições", "Emendas"]).map((t) => el("div", "", nav, t));
  const body = el("div", "body", fr);
  body.style.top = "122px";
  const BW = FW, BH = FH - 122;
  const panes = [];
  // --- pane A: sankey
  {
    const p = el("div", "pane", body);
    el("h3", "", p, "Para onde vai o dinheiro");
    el("div", "sub", p, `${bi(D.total_pago)} pagos em emendas · 2014–2026 · por tipo e função`);
    const sw = BW - 76, sh = BH - 150;
    const svg = sv("svg", { width: sw, height: sh, viewBox: `0 0 ${sw} ${sh}` }, p);
    svg.style.marginTop = "22px";
    svg.style.overflow = "visible";
    const S = D.sankey;
    const colO = { Individual: C.verde, "Emenda Pix": "#e0b800", Bancada: "#2457d6", Comissão: "#14a39a", Relator: "#7b61ff" };
    const lw = L(250, 165), rw = L(270, 255);
    const nx0 = lw, nx1 = sw - rw, nwid = 18;
    const tot = S.links.reduce((a, l) => a + l[2], 0);
    const gap = 16;
    const k = (sh - gap * 4) / tot;
    const lay = (names, side) => {
      let y = 0;
      return Object.fromEntries(names.map((n) => {
        const v = S.links.filter((l) => l[side] === n).reduce((a, l) => a + l[2], 0);
        const o = { y, h: v * k, v, off: 0 };
        y += v * k + gap;
        return [n, o];
      }));
    };
    const LO = lay(S.origens, 0), RD = lay(S.destinos, 1);
    const nodes = [];
    for (const [n, o] of Object.entries(LO)) {
      const r = sv("rect", { x: nx0 - nwid, y: o.y, width: nwid, height: o.h, rx: 4, fill: colO[n] }, svg);
      const t = sv("text", { x: nx0 - nwid - 12, y: o.y + o.h / 2, "text-anchor": "end", "dominant-baseline": "middle", "font-size": L(21, 17), "font-weight": 700, fill: "#0b1530" }, svg);
      t.innerHTML = `${n} <tspan fill="#5a6b8c" font-weight="600">${nf1(o.v)}</tspan>`;
      nodes.push({ r, t, side: 0 });
    }
    for (const [n, o] of Object.entries(RD)) {
      const r = sv("rect", { x: nx1, y: o.y, width: nwid, height: o.h, rx: 4, fill: "#24324f" }, svg);
      const t = sv("text", { x: nx1 + nwid + 12, y: o.y + o.h / 2, "dominant-baseline": "middle", "font-size": L(21, 17), "font-weight": 700, fill: "#0b1530" }, svg);
      t.innerHTML = `${n} <tspan fill="#5a6b8c" font-weight="600">${nf1(o.v)}</tspan>`;
      nodes.push({ r, t, side: 1 });
    }
    const links = S.links.map((l, i) => {
      const a = LO[l[0]], z = RD[l[1]], th = l[2] * k;
      const y0 = a.y + a.off + th / 2, y1 = z.y + z.off + th / 2;
      a.off += th; z.off += th;
      const mxx = (nx0 + nx1) / 2;
      const d = `M${nx0},${y0} C${mxx},${y0} ${mxx},${y1} ${nx1},${y1}`;
      const base = sv("path", { d, fill: "none", stroke: colO[l[0]], "stroke-width": Math.max(1.5, th), "stroke-opacity": 0.42, pathLength: 1, "stroke-dasharray": "1 1" }, svg);
      const flow = sv("path", { d, fill: "none", stroke: "#fff", "stroke-width": Math.min(5, Math.max(1, th * 0.18)), "stroke-opacity": 0.55, pathLength: 1, "stroke-dasharray": "0.015 0.06", "stroke-linecap": "round" }, svg);
      return { base, flow, i, pix: l[0] === "Emenda Pix" };
    });
    panes.push({ p, url: "emenda.online/<b>dinheiro</b>", nav: 0, update: (b) => {
      nodes.forEach((n, i) => {
        const q = E.outBack(pr(b, 44.4 + (i % 5) * 0.08 + n.side * 0.3, 0.5));
        n.r.style.transform = `scaleY(${q})`; n.r.style.transformBox = "fill-box"; n.r.style.transformOrigin = "50% 50%";
        n.t.style.opacity = clamp(q);
      });
      links.forEach((l) => {
        const q = E.inOut3(pr(b, 44.7 + l.i * 0.07, 1.1));
        l.base.setAttribute("stroke-dashoffset", 1 - q);
        l.flow.setAttribute("stroke-dashoffset", (-b * 0.12).toFixed(4));
        l.flow.style.opacity = q >= 1 ? 1 : 0;
        const glow = l.pix ? Math.exp(-(((b - 46.6) / 0.5) ** 2)) : 0;
        l.base.setAttribute("stroke-opacity", (0.42 + 0.5 * glow).toFixed(3));
      });
    } });
  }
  // --- pane B: municipio
  {
    const M = D.municipio;
    const p = el("div", "pane", body);
    el("h3", "", p, `${M.nome} <span style="color:#5a6b8c;font-weight:600">· ${M.uf}</span>`);
    el("div", "sub", p, `Município · IBGE ${M.ibge} · emendas recebidas 2014–2026`);
    const grid = el("div", "", p);
    grid.style.cssText = `display:grid;grid-template-columns:${L("1fr 1fr", "1fr")};gap:22px;margin-top:24px`;
    const colA = el("div", "", grid), colB = el("div", "", grid);
    colA.style.cssText = colB.style.cssText = "display:flex;flex-direction:column;gap:20px";
    const kr = el("div", "", colA); kr.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:18px";
    const k1 = el("div", "kpi", kr); el("div", "k", k1, "recebido");
    const kv = el("div", "v g", k1);
    const k2 = el("div", "kpi", kr); el("div", "k", k2, "prefeito (2025–28)");
    el("div", "v", k2, `<span style="font-size:30px">${M.prefeito.nome}</span>`);
    el("div", "", k2, `<span class="badge" style="font-size:14px;margin-top:6px">${M.prefeito.partido}</span> <span style="font-size:14px;color:#5a6b8c">fonte: ${M.prefeito.fonte}</span>`);
    const fb = el("div", "kpi", colA); el("div", "k", fb, "despesas por função");
    const fmax = M.funcoes[0][1];
    const fbars = M.funcoes.map(([n, v]) => {
      const r = el("div", "hb", fb); r.style.marginTop = "12px";
      const lb = el("div", "", r, n); lb.style.width = "220px";
      const t = el("div", "t", r);
      const vl = el("div", "", r, mi(v)); vl.style.color = "#0b1530";
      return { t, v, w: (v / fmax) * L(300, 420), vl };
    });
    const tb = el("div", "tbl", colB);
    const hd = el("div", "tr", tb, `<span style="flex:1">favorecido</span><span style="width:200px">CNPJ</span><span style="width:120px;text-align:right">recebido</span>`);
    const rows = M.favorecidos.map(([n, c, v]) => el("div", "tr", tb, `<span style="flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis">${n}</span><span class="mono" style="width:200px">${c}</span><span style="width:120px;text-align:right;font-weight:800;color:${C.verde}">${mi(v)}</span>`));
    const note = el("div", "sub", colB, "favorecidos com sede no município · Portal da Transparência");
    note.style.fontSize = "15px";
    panes.push({ p, url: `emenda.online/<b>municipio/${M.ibge}</b>`, nav: 1, update: (b) => {
      kv.textContent = mi(M.pago * E.out3(pr(b, 48.2, 1.6)));
      fbars.forEach((f, i) => {
        const q = E.out3(pr(b, 48.5 + i * 0.12, 0.8));
        f.t.style.width = Math.max(4, f.w * q) + "px";
        f.vl.style.opacity = q;
      });
      rows.forEach((r, i) => {
        const q = E.outExpo(pr(b, 49.2 + i * 0.25, 0.5));
        r.style.transform = `translateX(${(1 - q) * 60}px)`; r.style.opacity = q;
      });
    } });
  }
  // --- pane C: proposicoes
  {
    const p = el("div", "pane", body);
    el("h3", "", p, "Proposições e votações");
    el("div", "sub", p, "votos nominais da Câmara dos Deputados, por proposição");
    const list = el("div", "", p);
    list.style.cssText = "display:flex;flex-direction:column;gap:22px;margin-top:26px";
    const items = D.proposicoes.map((q) => {
      const c = el("div", "kpi", list);
      c.style.padding = "24px 28px";
      const [y, m, d] = q.data.split("-");
      el("div", "", c, `<span style="font-family:'Space Grotesk';font-weight:700;font-size:38px;color:#0b1530">${q.sigla}</span> <span class="badge" style="font-size:14px;vertical-align:8px;margin-left:8px;background:${C.verde};color:#fff">APROVADA</span>`);
      el("div", "", c, `<span style="font-size:20px;font-weight:600;color:#33415f">${q.tema} · ${q.evento} · ${d}/${m}/${y}</span>`);
      const tr = el("div", "", c);
      tr.style.cssText = "display:flex;height:30px;border-radius:8px;overflow:hidden;margin-top:16px;background:#e9eef5";
      const tot = q.sim + q.nao + q.abst;
      const segs = [[q.sim, C.verde], [q.abst, "#e0b800"], [q.nao, C.nao]].map(([v, col]) => { const sg = el("div", "", tr); sg.style.background = col; return { sg, v: v / tot }; });
      const nums = el("div", "", c);
      nums.style.cssText = "display:flex;gap:28px;margin-top:12px;font-size:20px;font-weight:800";
      const ns = [["sim", q.sim, C.verde], ["não", q.nao, C.nao], ["abst.", q.abst, "#b38f00"]].map(([l, v, col]) => {
        const e = el("span", "", nums); e.style.color = col; return { e, l, v };
      });
      return { c, segs, ns };
    });
    const vdep = el("div", "kpi", list);
    vdep.innerHTML = `<div class="k">também no site</div><div style="font-size:22px;font-weight:700;margin-top:6px;color:#33415f">deputados · senadores · partidos · emendas por autor · estados</div>`;
    panes.push({ p, url: "emenda.online/<b>proposicoes</b>", nav: PORT ? 2 : 3, update: (b) => {
      items.forEach((it, i) => {
        const a = 52.2 + i * 0.4;
        const q = E.outExpo(pr(b, a, 0.6));
        it.c.style.transform = `translateY(${(1 - q) * 50}px)`; it.c.style.opacity = q;
        const g = E.out3(pr(b, a + 0.2, 1.2));
        let acc = 0;
        it.segs.forEach((sg) => { sg.sg.style.width = sg.v * 100 * g + "%"; acc += sg.v; });
        it.ns.forEach((n) => (n.e.textContent = `${n.l} ${int(n.v * g)}`));
      });
      const q = E.outExpo(pr(b, 53.2, 0.6));
      vdep.style.opacity = q; vdep.style.transform = `translateY(${(1 - q) * 40}px)`;
    } });
  }
  // chips
  const chipDefs = [
    ["Sankey do dinheiro", 44.6, 47.8, "", L([330, 150], [270, 122]), -4],
    ["Emenda Pix em destaque", 46.4, 47.8, "v", L([330, 985], [790, 1255]), 3],
    ["Município + prefeito", 48.3, 51.8, "", L([330, 150], [280, 122]), -3],
    ["Despesas por função", 49.0, 51.8, "w", L([290, 975], [270, 1255]), 2],
    ["CNPJ dos favorecidos", 49.6, 51.8, "v", L([1630, 960], [790, 1255]), 3],
    ["Proposições", 52.3, 55.8, "", L([330, 150], [260, 122]), -3],
    ["Votos por deputado", 53.0, 55.8, "v", L([1630, 960], [790, 1255]), 3],
  ].map(([t, a, z, cls, pos, r]) => ({ e: el("div", "chip " + cls, s.cam, t), a, z, pos, r }));
  const src = el("div", "abs src", s.cam, "dados: Portal da Transparência/CGU · Câmara dos Deputados · TSE · IBGE");
  return (b) => {
    const [dx, dy] = shake(b, [44, 48, 52], 9);
    tf(s.cam, { x: dx, y: dy, s: 1 + 0.025 * pr(b, 44, 12), c: false });
    const fi = E.outExpo(pr(b, 44, 1));
    const drift = (b - 44) / 12;
    tf(fr, { x: W / 2, y: L(590, 700) + (1 - fi) * 500, rx: lerp(28, 6, fi) - drift * 4, ry: lerp(-22, -7, fi) + drift * 12, s: lerp(0.75, 1, fi) * L(1, 1) });
    tf(head, { x: W / 2, y: L(70, 58), op: E.out3(pr(b, 44.3, 0.5)) });
    const cur = b < 48 ? 0 : b < 52 ? 1 : 2;
    panes.forEach((p, i) => {
      // whip between panes: incoming from right, outgoing to left
      const inP = i === 0 ? 1 : E.out5(pr(b, 44 + i * 4 - 0.15, 0.4));
      const outP = i === 2 ? 0 : E.in3(pr(b, 48 + i * 4 - 0.2, 0.25));
      const vis = i === cur || (outP > 0 && outP < 1);
      p.p.style.display = vis ? "block" : "none";
      p.p.style.transform = `translateX(${((1 - inP) * 0.6 - outP * 0.6) * FW}px)`;
      p.p.style.filter = (1 - inP) + outP > 0.02 ? `blur(${((1 - inP) + outP) * 14}px)` : "none";
      if (vis) p.update(b);
    });
    url.innerHTML = panes[cur].url;
    navItems.forEach((n, i) => n.classList.toggle("on", i === panes[cur].nav));
    chipDefs.forEach((c) => {
      const p = E.outBack(pr(b, c.a, 0.45), 2.2);
      const o = 1 - pr(b, c.z, 0.2);
      tf(c.e, { x: c.pos[0], y: c.pos[1] + Math.sin(b * 1.4 + c.a) * 6, s: p * (1 - (1 - o) * 0.3), r: c.r, op: b >= c.a ? o : 0 });
    });
    tf(src, { x: W / 2, y: H - L(30, 36), op: PORT ? 0 : pr(b, 45, 0.5) });
    if (PORT) src.style.fontSize = "15px";
  };
});

// ============ S6 logo 56-64 ============
scene(56, 64, (s) => {
  // official brand: apps/web/public/brand (copied to assets/brand)
  const lock = el("div", "abs", s.cam);
  lock.style.cssText += `display:flex;align-items:center;gap:${L(44, 38)}px`;
  const mh = L(170, 120);
  const mark = el("div", "", lock, MARK_SVG);
  const msvg = mark.querySelector("svg");
  msvg.setAttribute("width", mh); msvg.setAttribute("height", mh);
  msvg.style.display = "block";
  const cols = [...msvg.querySelectorAll("rect")].slice(1, 4);
  cols.forEach((r) => { r.style.transformBox = "fill-box"; r.style.transformOrigin = "50% 100%"; });
  // wordmark as text (product renamed to emenda.online; brand SVG still says the old name)
  const wmWrap = el("div", "", lock);
  const wm = el("div", "disp", wmWrap, `emenda<span style="color:${C.verdeL}">.online</span>`);
  wm.style.cssText += `font-size:${L(150, 100)}px;letter-spacing:-0.02em;line-height:1;padding-bottom:0.12em`;
  const tri = el("div", "abs", s.cam);
  tri.style.cssText += "height:14px;border-radius:7px;overflow:hidden;display:flex";
  [C.verde, C.amarelo, "#2b63e0"].forEach((c) => (el("div", "", tri).style.cssText = `flex:1;background:${c}`));
  const tag = el("div", "abs disp", s.cam, "Transparência de verdade");
  tag.style.fontSize = L(74, 66) + "px";
  const siga = el("div", "abs cap", s.cam, "siga o dinheiro público");
  siga.style.cssText += `font-size:${L(26, 24)}px;color:${C.amarelo}`;
  const handle = el("div", "abs chip", s.cam, "@klee00z");
  handle.style.fontSize = L(40, 38) + "px";
  const foot = el("div", "abs src", s.cam, "código aberto · GPL-3.0 · dados públicos");
  foot.style.fontSize = L(22, 21) + "px";
  const credit = el("div", "abs src", s.cam, "música: Lutier (github.com/ctresb)");
  credit.style.fontSize = "15px";
  return (b) => {
    const [dx, dy] = shake(b, [56, 60], 14);
    tf(s.cam, { x: dx, y: dy, s: 1 + 0.06 * E.out3(pr(b, 56, 8)), c: false });
    const ly = H * L(0.4, 0.4);
    const lp = E.outExpo(pr(b, 56, 0.6));
    tf(lock, { x: W / 2, y: ly, s: lerp(1.6, 1, lp), op: Math.min(1, pr(b, 56, 0.15) * 3), blur: (1 - lp) * 18 });
    cols.forEach((r, i) => {
      const q = E.outBack(pr(b, 56.1 + [0.12, 0, 0.24][i], 0.5), 2.2);
      r.style.transform = `scaleY(${q.toFixed(4)})`;
    });
    const wq = E.out5(pr(b, 56.25, 0.7));
    wmWrap.style.clipPath = `inset(0 ${((1 - wq) * 100).toFixed(2)}% 0 0)`;
    wm.style.transform = `translateX(${((1 - wq) * -40).toFixed(1)}px)`;
    const lw = L(1100, 860);
    const tp = E.inOut3(pr(b, 56.6, 0.6));
    tri.style.width = lw * tp + "px";
    tf(tri, { x: W / 2 - lw / 2, y: ly + L(140, 125), c: false, op: tp > 0 ? 1 : 0 });
    const tg = E.outExpo(pr(b, 57.1, 0.6));
    tf(tag, { x: W / 2, y: ly + L(255, 235) + (1 - tg) * 60, op: tg, blur: (1 - tg) * 10 });
    tf(siga, { x: W / 2, y: ly + L(340, 320), op: E.out3(pr(b, 57.8, 0.5)) });
    const hp = E.outBack(pr(b, 60, 0.45), 2.6);
    tf(handle, { x: W / 2, y: ly + L(450, 450), s: hp, r: lerp(-10, 0, hp), op: b >= 60 ? 1 : 0 });
    tf(foot, { x: W / 2, y: H - L(70, 90), op: E.out3(pr(b, 60.5, 0.5)) * 0.9 });
    tf(credit, { x: W / 2, y: H - L(38, 55), op: E.out3(pr(b, 60.8, 0.5)) * 0.8 });
  };
});

// ---------- overlays: wipes + flash ----------
const wipe = el("div", "abs", stage);
wipe.style.cssText += `width:${W}px;height:${H}px;pointer-events:none`;
const bandCols = [C.verde, C.amarelo, "#1d4fd0", "#ffffff"];
const bands = bandCols.map((c) => { const e = el("div", "band", wipe); e.style.background = c; return e; });
const flash = el("div", "abs", stage);
flash.style.cssText += `width:${W}px;height:${H}px;background:#fff;pointer-events:none`;
const CUTS = [8, 20, 32, 44, 56];

function render(b) {
  drawBg(b);
  for (const s of scenes) {
    const on = b >= s.a && b < s.b;
    s.root.style.display = on ? "block" : "none";
    if (on) s.update(b);
  }
  // wipe across each cut: bands sweep left->right, covering the frame at the cut
  let best = null;
  for (const c of CUTS) if (b >= c - 0.45 && b < c + 0.4) best = c;
  if (best !== null) {
    const p = (b - (best - 0.45)) / 0.85; // 0..1
    const span = W * 1.9;
    bands.forEach((e, i) => {
      const q = clamp(p * 1.25 - i * 0.07);
      const x = -W * 1.2 + E.inOut3(q) * (span + W * 0.6);
      e.style.width = W * (i === 3 ? 0.08 : 0.7) + "px";
      e.style.transform = `translateX(${x + (i === 3 ? W * 0.62 : 0)}px) skewX(-18deg)`;
      e.style.display = "block";
    });
  } else bands.forEach((e) => (e.style.display = "none"));
  const fl = [0, 32, 56].reduce((a, h) => a + (b >= h ? Math.exp(-(b - h) * 7) : 0), 0);
  flash.style.opacity = clamp(fl * 0.55).toFixed(3);
}

await document.fonts.ready;
await Promise.all(D.deputados.map((d) => new Promise((ok) => { const i = new Image(); i.onload = i.onerror = ok; i.src = "../" + d.foto; })));
window.seek = (t) => render((t * BPM) / 60);
window.reelReady = true;
render(Number(Q.get("b") || 0));
