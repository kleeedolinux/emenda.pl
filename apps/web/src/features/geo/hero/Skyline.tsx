// Ilustração original de Brasília em camadas (cerrado, Congresso Nacional, Esplanada, Catedral).
// Geometria calculada uma vez no módulo; cores via CSS vars (.hero) para tema claro/escuro.
import { forwardRef, type CSSProperties } from "react";

export const VB = { w: 1600, h: 460 } as const;
const VP = { x: 800, y: 300 } as const; // ponto de fuga (horizonte) no eixo da Esplanada
const LAWN = 520, BLOCK_W = 460, BLOCK_H = 84, GROUND = 28;
/** Topo das torres: origem do fluxo de dinheiro. */
export const TOWER_TOP = { x: 800, y: 112 } as const;

const r = (n: number) => Math.round(n * 10) / 10;
// Pseudoaleatório determinístico (janelas acesas, árvores).
const hash = (i: number) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };

// ---------- Esplanada: blocos dos ministérios em perspectiva de um ponto ----------
interface Block { front: string; end: string; floors: string; lit: string; z: number }
function blocks(side: -1 | 1): Block[] {
  const out: Block[] = [];
  const n = 9, z0 = 1.12, z1 = 2.2, d = 0.06;
  for (let i = n - 1; i >= 0; i--) {
    const z = z0 + ((z1 - z0) * i) / (n - 1);
    const xi = (zz: number) => VP.x + (side * LAWN) / zz;
    const xo = VP.x + (side * (LAWN + BLOCK_W)) / z;
    const top = (zz: number) => VP.y - BLOCK_H / zz, gnd = (zz: number) => VP.y + GROUND / zz;
    const a = Math.min(xi(z), xo), b = Math.max(xi(z), xo);
    const front = `M${r(a)},${r(top(z))}H${r(b)}V${r(gnd(z))}H${r(a)}Z`;
    const end = `M${r(xi(z))},${r(top(z))}L${r(xi(z + d))},${r(top(z + d))}V${r(gnd(z + d))}L${r(xi(z))},${r(gnd(z))}Z`;
    const floors: string[] = [], lit: string[] = [];
    const h = gnd(z) - top(z);
    for (let k = 1; k < 11; k++) {
      const y = top(z) + (h * k) / 11.5;
      floors.push(`M${r(a)},${r(y)}H${r(b)}`);
      // janelas acesas (só aparecem no escuro: --window)
      const seed = i * 31 + k * 7 + (side > 0 ? 500 : 0);
      if (hash(seed) > 0.55) {
        const span = (b - a) * (0.08 + hash(seed + 1) * 0.18);
        const x = a + (b - a - span) * hash(seed + 2);
        lit.push(`M${r(x)},${r(y - h / 23)}h${r(span)}`);
      }
    }
    const cols = Math.max(4, Math.round((b - a) / (26 / z)));
    for (let c = 1; c < cols; c++) { const x = a + ((b - a) * c) / cols; floors.push(`M${r(x)},${r(top(z))}V${r(gnd(z))}`); }
    out.push({ front, end, floors: floors.join(""), lit: lit.join(""), z });
  }
  return out;
}
const LEFT = blocks(-1), RIGHT = blocks(1);

// ---------- Congresso Nacional ----------
const PLATFORM_Y = 290, BASE_Y = 312;
const TOWER_L = { x: 773, w: 24 }, TOWER_R = { x: 803, w: 24 };
function towerWindows(x: number, w: number, seed: number) {
  const floors: string[] = [], lit: string[] = [];
  for (let y = TOWER_TOP.y + 6; y < PLATFORM_Y - 2; y += 6) {
    floors.push(`M${x},${y}h${w}`);
    for (let c = 0; c < 3; c++) if (hash(seed + y * 3 + c) > 0.5) lit.push(`M${r(x + 2 + c * 7.3)},${y - 3}h5.4`);
  }
  return { floors: floors.join(""), lit: lit.join("") };
}
const WL = towerWindows(TOWER_L.x, TOWER_L.w, 11), WR = towerWindows(TOWER_R.x, TOWER_R.w, 97);

/** Congresso: plataforma, rampa, cúpula da Câmara (bacia, à esquerda), do Senado (domo, à direita), torres + passarela. */
function Congresso({ id }: { id: string }) {
  return (
    <g id={id}>
      {/* plataforma (laje) e sombra */}
      <path d={`M596,${BASE_Y}H1004L996,${PLATFORM_Y + 14}H604Z`} fill="var(--bldg-3)" />
      <path d={`M590,${PLATFORM_Y}H1010V${PLATFORM_Y + 14}H590Z`} fill="var(--bldg)" stroke="var(--bldg-line)" strokeWidth="0.8" />
      <path d={`M590,${PLATFORM_Y + 4}H1010`} stroke="var(--glass-1)" strokeWidth="3" opacity="0.7" />
      {/* rampa */}
      <path d={`M612,${PLATFORM_Y}L548,${BASE_Y}H566L626,${PLATFORM_Y + 2}Z`} fill="var(--bldg-2)" stroke="var(--bldg-line)" strokeWidth="0.6" />
      {/* Câmara: bacia (côncava, para cima) */}
      <path d={`M634,258 C646,284 676,${PLATFORM_Y} 700,${PLATFORM_Y} C724,${PLATFORM_Y} 754,284 766,258 Z`} fill="url(#hs-bowl)" stroke="var(--bldg-line)" strokeWidth="0.8" />
      <ellipse cx="700" cy="258" rx="66" ry="8.5" fill="var(--bldg-2)" stroke="var(--bldg-line)" strokeWidth="0.8" />
      <ellipse cx="700" cy="257" rx="58" ry="5.6" fill="var(--bldg-3)" opacity="0.65" />
      {/* Senado: domo (convexo) */}
      <path d={`M858,${PLATFORM_Y} C860,262 880,248 906,248 C932,248 952,262 954,${PLATFORM_Y} Z`} fill="url(#hs-dome)" stroke="var(--bldg-line)" strokeWidth="0.8" />
      <path d="M874,262 C888,254 924,254 938,262" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.4" />
      {/* torres gêmeas (28 andares) com passarela no meio: o "H" */}
      <rect x={TOWER_L.x} y={TOWER_TOP.y} width={TOWER_L.w} height={PLATFORM_Y - TOWER_TOP.y} fill="url(#hs-tower)" stroke="var(--bldg-line)" strokeWidth="0.8" />
      <rect x={TOWER_R.x} y={TOWER_TOP.y} width={TOWER_R.w} height={PLATFORM_Y - TOWER_TOP.y} fill="url(#hs-tower)" stroke="var(--bldg-line)" strokeWidth="0.8" />
      <rect x={TOWER_L.x + TOWER_L.w} y={176} width={TOWER_R.x - TOWER_L.x - TOWER_L.w} height={22} fill="var(--bldg-2)" stroke="var(--bldg-line)" strokeWidth="0.6" />
      <path d={WL.floors + WR.floors} stroke="var(--bldg-line)" strokeOpacity="0.45" strokeWidth="0.6" />
      <path d={WL.lit + WR.lit} stroke="var(--window)" strokeWidth="2.6" />
      <rect x={TOWER_L.x} y={TOWER_TOP.y} width={TOWER_L.w} height={3} fill="var(--bldg-3)" />
      <rect x={TOWER_R.x} y={TOWER_TOP.y} width={TOWER_R.w} height={3} fill="var(--bldg-3)" />
      {/* colunas sob a laje */}
      <path d="M640,304V312M700,304V312M760,304V312M840,304V312M900,304V312M960,304V312" stroke="var(--bldg-line)" strokeWidth="2" opacity="0.5" />
    </g>
  );
}

// ---------- Catedral (coroa hiperboloide de 16 colunas) ----------
function Catedral({ cx, base, s = 1 }: { cx: number; base: number; s?: number }) {
  const cols: string[] = [];
  const n = 16, wb = 52 * s, ww = 18 * s, wt = 40 * s, h = 74 * s, waist = base - h * 0.42;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = Math.cos(a), front = Math.sin(a) > 0;
    if (!front && i % 2) continue;
    cols.push(`M${r(cx + k * wb)},${base}Q${r(cx + k * ww * 0.6)},${r(waist)} ${r(cx + k * wt)},${r(base - h)}`);
  }
  return (
    <g>
      <ellipse cx={cx} cy={base} rx={wb + 6 * s} ry={5 * s} fill="var(--bldg-3)" opacity="0.6" />
      <path d={`M${r(cx - wb)},${base}Q${r(cx - ww * 0.6)},${r(waist)} ${r(cx - wt)},${r(base - h)}L${r(cx + wt)},${r(base - h)}Q${r(cx + ww * 0.6)},${r(waist)} ${r(cx + wb)},${base}Z`} fill="url(#hs-glass)" opacity="0.75" />
      <path d={cols.join("")} fill="none" stroke="var(--bldg-line)" strokeWidth={5.4 * s} strokeLinecap="round" opacity="0.9" />
      <path d={cols.join("")} fill="none" stroke="var(--bldg)" strokeWidth={3.6 * s} strokeLinecap="round" />
      <path d={`M${cx},${r(base - h - 8 * s)}v${r(-14 * s)}M${r(cx - 5 * s)},${r(base - h - 16 * s)}h${r(10 * s)}`} stroke="var(--bldg-line)" strokeWidth={1.2 * s} />
    </g>
  );
}

// ---------- Árvores do cerrado (tronco torto, copa achatada) ----------
function Tree({ x, y, s = 1, ipe = false, seed = 1 }: { x: number; y: number; s?: number; ipe?: boolean; seed?: number }) {
  const lean = (hash(seed) - 0.5) * 10 * s;
  const fill = ipe ? "var(--ipe)" : "var(--tree)";
  return (
    <g>
      <path d={`M${x},${y}C${r(x + lean)},${r(y - 14 * s)} ${r(x - lean)},${r(y - 22 * s)} ${r(x + lean * 0.6)},${r(y - 30 * s)}M${r(x + lean * 0.2)},${r(y - 18 * s)}L${r(x + 9 * s)},${r(y - 27 * s)}`} stroke="var(--tree)" strokeWidth={2.2 * s} fill="none" strokeLinecap="round" />
      <ellipse cx={r(x + lean * 0.6)} cy={r(y - 33 * s)} rx={r(17 * s)} ry={r(7 * s)} fill={fill} />
      <ellipse cx={r(x + lean * 0.6 - 9 * s)} cy={r(y - 30 * s)} rx={r(9 * s)} ry={r(5 * s)} fill={fill} opacity="0.9" />
      <ellipse cx={r(x + lean * 0.6 + 10 * s)} cy={r(y - 31 * s)} rx={r(10 * s)} ry={r(5 * s)} fill={fill} opacity="0.85" />
    </g>
  );
}

const HILLS_FAR = "M0,286 C120,270 230,276 330,282 C450,268 560,272 680,284 C780,276 900,270 1010,280 C1130,266 1260,272 1360,282 C1460,272 1540,276 1600,280 V320 H0Z";
const HILLS_NEAR = "M0,298 C160,288 300,292 420,298 C560,290 700,294 800,300 C940,292 1080,290 1200,298 C1340,290 1480,292 1600,296 V330 H0Z";

const svgProps = (style?: CSSProperties) => ({
  viewBox: `0 0 ${VB.w} ${VB.h}`,
  preserveAspectRatio: "xMidYMax slice",
  className: "absolute inset-0 size-full",
  "aria-hidden": true,
  style,
});

/** Camada distante: colinas e árvores do cerrado. */
export function LayerFar() {
  return (
    <svg {...svgProps()}>
      <path d={HILLS_FAR} fill="var(--hill-far)" opacity="0.75" />
      <path d={HILLS_NEAR} fill="var(--hill-near)" opacity="0.55" />
      {[90, 170, 260, 380, 470, 1120, 1210, 1330, 1450, 1530].map((x, i) => <Tree key={x} x={x} y={292 + (i % 3) * 2} s={0.38 + hash(i) * 0.15} seed={i} />)}
    </svg>
  );
}

/** Camada média: gramado, espelho d'água com reflexo, Congresso. Expõe o topo das torres por ref. */
export const LayerMid = forwardRef<SVGCircleElement>(function LayerMid(_, ref) {
  return (
    <svg {...svgProps()}>
      <defs>
        <linearGradient id="hs-tower" x1="0" x2="1">
          <stop offset="0" stopColor="var(--glass-2)" />
          <stop offset="0.55" stopColor="var(--glass-1)" />
          <stop offset="1" stopColor="var(--bldg-2)" />
        </linearGradient>
        <linearGradient id="hs-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--glass-2)" />
          <stop offset="1" stopColor="var(--glass-1)" />
        </linearGradient>
        <radialGradient id="hs-dome" cx="0.35" cy="0.25" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="var(--bldg)" />
          <stop offset="1" stopColor="var(--bldg-3)" />
        </radialGradient>
        <linearGradient id="hs-bowl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--bldg)" />
          <stop offset="1" stopColor="var(--bldg-3)" />
        </linearGradient>
        <linearGradient id="hs-lawn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--lawn)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--lawn)" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="hs-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--water-1)" />
          <stop offset="1" stopColor="var(--water-2)" />
        </linearGradient>
        <linearGradient id="hs-refl-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="hs-refl-mask"><rect x="0" y={BASE_Y} width={VB.w} height="60" fill="url(#hs-refl-fade)" /></mask>
        <clipPath id="hs-pool"><path d={`M604,${BASE_Y + 2}H996L1120,366H480Z`} /></clipPath>
        <linearGradient id="hs-sweep" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* gramado da Esplanada convergindo ao Congresso */}
      <path d={`M560,${BASE_Y}H1040L1900,${VB.h}H-300Z`} fill="url(#hs-lawn)" />
      <path d={`M800,${BASE_Y}L780,${VB.h}M800,${BASE_Y}L820,${VB.h}`} stroke="var(--lawn)" strokeOpacity="0.5" />
      <Congresso id="hs-congresso" />
      {/* espelho d'água + reflexo */}
      <path d={`M604,${BASE_Y + 2}H996L1120,366H480Z`} fill="url(#hs-water)" />
      <g clipPath="url(#hs-pool)">
        <g mask="url(#hs-refl-mask)" opacity="0.6">
          <use href="#hs-congresso" transform={`translate(0 ${2 * BASE_Y + 4}) scale(1 -1)`} />
        </g>
      </g>
      <circle ref={ref} cx={TOWER_TOP.x} cy={TOWER_TOP.y - 4} r="1.5" fill="var(--color-amarelo)" />
    </svg>
  );
});

/** Camada próxima: ministérios em perspectiva, Catedral, ipês. */
export function LayerFront() {
  return (
    <svg {...svgProps()}>
      <defs>
        <linearGradient id="hs-facade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--glass-2)" />
          <stop offset="1" stopColor="var(--glass-1)" />
        </linearGradient>
        <linearGradient id="hs-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--bldg-2)" />
          <stop offset="1" stopColor="var(--bldg-3)" />
        </linearGradient>
      </defs>
      {[LEFT, RIGHT].map((row, s) => (
        <g key={s}>
          {row.map((b, i) => (
            <g key={i}>
              <path d={b.end} fill="url(#hs-shade)" stroke="var(--bldg-line)" strokeWidth="0.5" />
              <path d={b.front} fill="url(#hs-facade)" stroke="var(--bldg-line)" strokeWidth="0.6" />
              <path d={b.floors} stroke="var(--bldg-line)" strokeOpacity="0.35" strokeWidth={0.7 / Math.sqrt(b.z)} />
              <path d={b.lit} stroke="var(--window)" strokeWidth={3.4 / b.z} strokeDasharray={`${r(7 / b.z)} ${r(5 / b.z)}`} />
            </g>
          ))}
        </g>
      ))}
      <Catedral cx={1226} base={330} s={0.95} />
      <Tree x={360} y={372} s={1.25} ipe seed={3} />
      <Tree x={1340} y={378} s={1.4} ipe seed={8} />
      <Tree x={470} y={350} s={0.7} seed={5} />
      <Tree x={1110} y={352} s={0.75} seed={9} />
      <Tree x={250} y={392} s={1.1} seed={12} />
    </svg>
  );
}

// ---------- Efeitos animados em SVGs próprios e pequenos ----------
// Camada própria no compositor: o quadro repinta só o efeito, não a ilustração que está na mesma camada do parallax.
const FX_LAYER: CSSProperties = { willChange: "transform" };
// Animar dentro das camadas grandes forçaria re-rasterizar toda a ilustração a cada quadro.
// Aqui só o recorte + o reflexo são repintados.

/** Reflexo de luz nas torres/domo e ondulação no espelho d'água. */
export function LayerMidFx() {
  return (
    <svg {...svgProps(FX_LAYER)}>
      <defs>
        <clipPath id="hs-mid-glass">
          <rect x={TOWER_L.x} y={TOWER_TOP.y} width={TOWER_L.w} height={PLATFORM_Y - TOWER_TOP.y} />
          <rect x={TOWER_R.x} y={TOWER_TOP.y} width={TOWER_R.w} height={PLATFORM_Y - TOWER_TOP.y} />
          <path d={`M858,${PLATFORM_Y} C860,262 880,248 906,248 C932,248 952,262 954,${PLATFORM_Y} Z`} />
        </clipPath>
        <clipPath id="hs-pool-fx"><path d={`M604,${BASE_Y + 2}H996L1120,366H480Z`} /></clipPath>
      </defs>
      <g clipPath="url(#hs-pool-fx)">
        <g className="water-ripple" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.8" strokeDasharray="22 30">
          {[320, 328, 337, 347, 358].map((y, i) => <path key={y} d={`M440,${y}H1200`} strokeDashoffset={i * 17} />)}
        </g>
      </g>
      <g clipPath="url(#hs-mid-glass)">
        <rect className="glass-sweep" x="0" y="100" width="90" height="200" fill="url(#hs-sweep)" transform="skewX(-18)" />
      </g>
    </svg>
  );
}

/** Reflexo de luz nas fachadas de vidro dos ministérios. */
export function LayerFrontFx() {
  return (
    <svg {...svgProps(FX_LAYER)}>
      <defs><clipPath id="hs-front-glass">{[...LEFT, ...RIGHT].map((b, i) => <path key={i} d={b.front} />)}</clipPath></defs>
      <g clipPath="url(#hs-front-glass)">
        <rect className="glass-sweep" x="0" y="150" width="160" height="200" fill="url(#hs-sweep)" transform="skewX(-18)" style={{ animationDelay: "1.6s" }} />
      </g>
    </svg>
  );
}
