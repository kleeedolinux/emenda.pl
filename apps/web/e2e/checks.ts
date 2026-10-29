// Checagens de layout executadas DENTRO do navegador (serializadas por page.evaluate: nada de escopo externo).
// Cada achado: { check, msg }. `[data-clip-ok]` marca corte intencional (ex.: rolo de dígitos).
export interface Achado { check: string; msg: string }
export interface Opts { celular: boolean }

export function auditar(opts: { celular: boolean }): { check: string; msg: string }[] {
  const out: { check: string; msg: string }[] = [];
  // cache: a mesma caixa é consultada por várias checagens (layout não muda durante a auditoria)
  const estilos = new Map<Element, CSSStyleDeclaration>();
  const gcs = (e: Element) => { let c = estilos.get(e); if (!c) { c = getComputedStyle(e); estilos.set(e, c); } return c; };
  const add = (check: string, msg: string) => out.push({ check, msg });
  const vw = document.documentElement.clientWidth;
  const NUM = /\d/;
  const desc = (el: Element) => {
    const parts: string[] = [];
    let e: Element | null = el;
    for (let i = 0; e && i < 4; i++, e = e.parentElement) {
      const c = typeof (e as HTMLElement).className === "string" ? (e as HTMLElement).className.trim().split(/\s+/).slice(0, 4).join(".") : "";
      parts.unshift(e.tagName.toLowerCase() + (c ? "." + c : ""));
    }
    return parts.join(" > ");
  };
  const skip = (el: Element) => el.closest('.ticker, [aria-hidden="true"], .sr-only, [data-clip-ok], svg, [inert]') !== null;
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = gcs(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const ownText = (el: Element) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? "").join("").trim();
  const unidades = /R\$|\b(mil|mi|bi|tri|k|pp|p\.p\.)\b/gi;
  const letras = (t: string) => (t.replace(unidades, "").match(/\p{L}/gu) ?? []).length;
  const rolagemX = (o: string) => o === "auto" || o === "scroll";
  const emRolagemX = (el: Element, ate: Element | null = null) => {
    for (let a = el.parentElement; a && a !== document.body && a !== ate; a = a.parentElement) if (rolagemX(gcs(a).overflowX)) return true;
    return false;
  };
  const truncado = (el: Element) => {
    for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
      const cs = gcs(a);
      if (cs.textOverflow === "ellipsis" || (cs.webkitLineClamp && cs.webkitLineClamp !== "none")) return true;
    }
    return false;
  };
  const flutuante = (el: Element) => el.closest("[data-radix-popper-content-wrapper], [role=dialog], [role=tooltip], [role=menu]") !== null;
  const linhas = (n: Node) => {
    const r = document.createRange();
    r.selectNodeContents(n);
    return new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size;
  };
  const R = (r: DOMRect) => `[${Math.round(r.left)},${Math.round(r.right)}x${Math.round(r.top)},${Math.round(r.bottom)}]`;

  // NUMEROS: transbordo, corte por ancestral, quebra de linha
  const cands = new Set<Element>();
  document.querySelectorAll("[data-num], .tabular, .tabular-nums, dd, td, th").forEach((e) => cands.add(e));
  document.querySelectorAll("main span, main b, main strong, main p, main div, main a, header span").forEach((e) => {
    const t = ownText(e);
    if (t && t.length <= 40 && NUM.test(t)) cands.add(e);
  });
  for (const el of cands) {
    if (skip(el) || !visible(el) || truncado(el)) continue;
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    if (!text || !NUM.test(text) || text.length > 60) continue;
    const cs = gcs(el);
    const r = el.getBoundingClientRect();
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && cs.overflowX !== "visible" && letras(text) <= 3) {
      add("NUM-OVERFLOW", `"${text}" sw=${el.scrollWidth} cw=${el.clientWidth} @ ${desc(el)}`);
      continue;
    }
    let cortado = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const acs = gcs(a);
      if (rolagemX(acs.overflowX)) break;
      const hx = acs.overflowX === "hidden" || acs.overflowX === "clip";
      const hy = acs.overflowY === "hidden" || acs.overflowY === "clip";
      if (hx || hy) {
        const ar = a.getBoundingClientRect();
        if ((hx && (r.right > ar.right + 1 || r.left < ar.left - 1)) || (hy && (r.bottom > ar.bottom + 1 || r.top < ar.top - 1))) {
          add("CLIPPED", `"${text}" el=${R(r)} by=${R(ar)} @ ${desc(el)} | clip: ${desc(a)}`);
          cortado = true;
          break;
        }
      }
    }
    if (cortado) continue;
    const own = ownText(el);
    if (!own || !NUM.test(own) || own.length > 24 || letras(own) > 2) continue;
    const tn = [...el.childNodes].find((n) => n.nodeType === 3 && NUM.test(n.textContent ?? ""));
    if (tn && linhas(tn) > 1) add("NUM-WRAP", `"${own}" w=${Math.round(r.width)} @ ${desc(el)}`);
  }

  // VIEWPORT / CUT: qualquer folha visível fora da tela ou cortada por overflow oculto
  const folhas = [...document.querySelectorAll<HTMLElement>("body *")].filter((e) => !skip(e) && (ownText(e).length > 0 || /^(BUTTON|IMG|INPUT|SELECT|TEXTAREA)$/.test(e.tagName)));
  for (const el of folhas) {
    if (!visible(el) || flutuante(el) || truncado(el)) continue;
    const cs = gcs(el);
    if (cs.position === "fixed") continue;
    const r = el.getBoundingClientRect();
    const t = (ownText(el) || el.tagName).slice(0, 40);
    if ((r.right > vw + 1 || r.left < -1) && !emRolagemX(el)) {
      add("VIEWPORT", `"${t}" [${Math.round(r.left)},${Math.round(r.right)}] vw=${vw} @ ${desc(el)}`);
      continue;
    }
    if (NUM.test(ownText(el))) continue;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const acs = gcs(a);
      if (rolagemX(acs.overflowX)) break;
      if (acs.overflowX === "hidden" || acs.overflowX === "clip") {
        const ar = a.getBoundingClientRect();
        if (r.right > ar.right + 2 || r.left < ar.left - 2) add("CLIPPED", `"${t}" ${R(r)} by ${R(ar)} @ ${desc(el)} | clip: ${desc(a)}`);
        break;
      }
    }
  }

  // BADGE-LINES: selo com mais de 2 linhas
  const ehSelo = (e: Element) => {
    const c = String((e as HTMLElement).className ?? "");
    return /rounded-(full|md|xl)/.test(c) && /(ring-1|bg-)/.test(c) && /text-(xs|\[1[01]px\])/.test(c) && /px-/.test(c);
  };
  for (const el of document.querySelectorAll<HTMLElement>("span, a, b")) {
    if (!ehSelo(el) || skip(el) || !visible(el)) continue;
    const lh = parseFloat(gcs(el).lineHeight) || 16;
    const h = el.getBoundingClientRect().height;
    if (h > lh * 2.6 + 8) add("BADGE-LINES", `"${(el.textContent ?? "").trim().slice(0, 40)}" h=${Math.round(h)} lh=${lh} @ ${desc(el)}`);
  }

  // MIDWORD: palavra partida entre linhas (hífen/barra são quebras legítimas)
  {
    const tw = document.createTreeWalker(document.querySelector("#root") ?? document.body, NodeFilter.SHOW_TEXT);
    let n = 0;
    for (let node = tw.nextNode(); node && n < 40; node = tw.nextNode()) {
      const t = node.textContent ?? "";
      if (t.trim().length < 4) continue;
      const pe = node.parentElement!;
      if (skip(pe) || !visible(pe)) continue;
      const re = /[^\s ]{4,}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t))) {
        if (/[-/–—_.@?!]/.test(m[0])) continue;
        const r = document.createRange();
        r.setStart(node, m.index);
        r.setEnd(node, m.index + m[0].length);
        const tops = new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top)));
        if (tops.size > 1) { add("MIDWORD", `"${m[0].slice(0, 30)}" in "${t.trim().slice(0, 40)}" @ ${desc(pe)}`); n++; }
      }
    }
  }

  // CARD-OVERFLOW: conteúdo saindo do cartão
  for (const card of document.querySelectorAll<HTMLElement>(".card")) {
    if (!visible(card) || skip(card)) continue;
    const cr = card.getBoundingClientRect();
    for (const el of card.querySelectorAll<HTMLElement>("*")) {
      if (skip(el) || !visible(el)) continue;
      if (!(ownText(el) || /^(BUTTON|IMG|INPUT|SELECT)$/.test(el.tagName))) continue;
      const cs = gcs(el);
      if (cs.position === "absolute" || cs.position === "fixed") continue;
      let sc = false;
      for (let a = el.parentElement; a && a !== card; a = a.parentElement) if (gcs(a).overflowX !== "visible") { sc = true; break; }
      if (sc) continue;
      const r = el.getBoundingClientRect();
      if (r.right > cr.right + 1 || r.left < cr.left - 1) {
        add("CARD-OVERFLOW", `"${(ownText(el) || el.tagName).slice(0, 40)}" ${R(r)} card=${R(cr)} @ ${desc(el)}`);
        break;
      }
    }
  }

  // TH-CRUSH: coluna mais estreita que a palavra mais longa do cabeçalho
  for (const th of document.querySelectorAll<HTMLElement>("th")) {
    if (!visible(th) || skip(th)) continue;
    const cs = gcs(th);
    const livre = th.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const tw = document.createTreeWalker(th, NodeFilter.SHOW_TEXT);
    let maior = 0, palavra = "";
    for (let node = tw.nextNode(); node; node = tw.nextNode()) {
      const t = node.textContent ?? "";
      const re = /\S+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t))) {
        const r = document.createRange();
        r.setStart(node, m.index);
        r.setEnd(node, m.index + m[0].length);
        const w = Math.max(...[...r.getClientRects()].map((q) => q.width), 0);
        const rects = [...r.getClientRects()].filter((q) => q.width > 0).length;
        const total = rects > 1 ? [...r.getClientRects()].reduce((s, q) => s + q.width, 0) : w;
        if (total > maior) { maior = total; palavra = m[0]; }
      }
    }
    if (maior > livre + 1 && th.scrollWidth >= th.clientWidth) add("TH-CRUSH", `"${palavra}" palavra=${Math.round(maior)} coluna=${Math.round(livre)} @ ${desc(th)}`);
  }

  // STACK-SCROLL: tabela em modo cartão (display:block) não pode precisar de rolagem lateral
  for (const t of document.querySelectorAll<HTMLElement>("table")) {
    if (!visible(t) || gcs(t).display !== "block") continue;
    const c = t.parentElement!;
    if (c.scrollWidth > c.clientWidth + 1) add("STACK-SCROLL", `sw=${c.scrollWidth} cw=${c.clientWidth} @ ${desc(t)}`);
  }

  // TAP: alvos de toque no celular (controles 44px; links 24px — WCAG 2.5.5/2.5.8). Links dentro de prosa são isentos.
  // Área efetiva = caixa do elemento ∪ ::before/::after absolutos, recortada por ancestrais com overflow oculto.
  if (opts.celular) {
    const area = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      let l = r.left, t = r.top, d = r.right, b = r.bottom;
      // pseudo absoluto: o bloco de contenção é o próprio elemento (se posicionado) ou o ancestral posicionado ("link esticado")
      let cb: HTMLElement = el;
      for (const ps of ["::before", "::after"]) {
        const c = getComputedStyle(el, ps);
        if (c.content === "none" || c.content === "normal" || c.position !== "absolute") continue;
        let base: HTMLElement = el;
        if (gcs(el).position === "static") { base = el.parentElement!; while (base !== document.body && gcs(base).position === "static") base = base.parentElement!; }
        const br = base.getBoundingClientRect();
        const px = (v: string) => (v.endsWith("px") ? parseFloat(v) : 0);
        l = Math.min(l, br.left + px(c.left)); t = Math.min(t, br.top + px(c.top));
        d = Math.max(d, br.right - px(c.right)); b = Math.max(b, br.bottom - px(c.bottom));
        if (base !== el) cb = base;
      }
      // overflow corta o pseudo só a partir do bloco de contenção para cima
      for (let a: HTMLElement | null = cb; a && a !== document.body; a = a.parentElement) {
        const o = gcs(a);
        if (o.overflowX === "visible" && o.overflowY === "visible") continue;
        const ar = a.getBoundingClientRect();
        if (o.overflowX !== "visible") { l = Math.max(l, ar.left); d = Math.min(d, ar.right); }
        if (o.overflowY !== "visible") { t = Math.max(t, ar.top); b = Math.min(b, ar.bottom); }
      }
      return { l, t, d, b, w: Math.max(0, d - l), h: Math.max(0, b - t) };
    };
    const ctrl = "button, select, input:not([type=hidden]), textarea, summary, [role=tab], [role=button], [role=switch], [role=checkbox], [role=menuitem], [role=combobox]";
    type Alvo = { el: HTMLElement; link: boolean; a: ReturnType<typeof area> };
    const alvos: Alvo[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(`${ctrl}, a[href]`)) {
      if (!visible(el) || el.closest('[aria-hidden="true"], .sr-only, [inert]')) continue;
      if (el.matches("input[type=checkbox], input[type=radio]") && el.closest("label")) continue;
      // WCAG 2.5.8 "equivalente": a mesma ação existe noutro controle grande da página.
      if (el.closest("[data-tap-equiv]")) continue;
      // WCAG 2.5.8 "essencial": formas de mapa/gráfico (a geografia define o tamanho)
      if (el.parentElement?.closest("svg")) continue;
      // parcialmente fora de uma faixa com rolagem lateral: posição de rolagem, não tamanho
      {
        const r = el.getBoundingClientRect();
        let fora = false;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (!rolagemX(gcs(a).overflowX)) continue;
          const ar = a.getBoundingClientRect();
          if (r.left < ar.left - 1 || r.right > ar.right + 1) { fora = true; break; }
        }
        if (fora) continue;
      }
      const link = el.tagName === "A" && !el.matches(ctrl);
      if (link) {
        // WCAG 2.5.8 "inline": link dentro de frase/bloco de texto
        if (gcs(el).display === "inline") {
          let bloco = el.parentElement;
          while (bloco && gcs(bloco).display.startsWith("inline")) bloco = bloco.parentElement;
          const proprio = (el.textContent ?? "").trim().length;
          if (bloco && (bloco.textContent ?? "").trim().length > proprio + 2) continue;
        }
      }
      const a = area(el);
      if (a.w < 1 || a.h < 1) continue; // recolhido (acordeão fechado): não está na tela
      alvos.push({ el, link, a });
    }
    const pequeno = (x: Alvo) => x.a.h < (x.link ? 24 : 44) - 0.5 || x.a.w < (x.link ? 24 : 44) - 0.5;
    const centro = (x: Alvo) => [(x.a.l + x.a.d) / 2, (x.a.t + x.a.b) / 2] as const;
    const distRet = (cx: number, cy: number, a: Alvo["a"]) => Math.hypot(Math.max(a.l - cx, 0, cx - a.d), Math.max(a.t - cy, 0, cy - a.b));
    for (const x of alvos) {
      if (!pequeno(x)) continue;
      if (x.link) {
        // WCAG 2.5.8 "espaçamento": círculo de 24px no centro não toca outro alvo (nem o círculo de outro alvo pequeno)
        const [cx, cy] = centro(x);
        const perto = alvos.some((o) => {
          if (o === x || o.el.contains(x.el) || x.el.contains(o.el)) return false;
          if (pequeno(o)) { const [ox, oy] = centro(o); return Math.hypot(cx - ox, cy - oy) < 24; }
          return distRet(cx, cy, o.a) < 12;
        });
        if (!perto) continue;
      }
      add("TAP", `${x.link ? "link" : x.el.tagName.toLowerCase()} ${Math.round(x.a.w)}x${Math.round(x.a.h)} "${(x.el.getAttribute("aria-label") ?? x.el.textContent ?? "").trim().slice(0, 30)}" @ ${desc(x.el)}`);
    }
  }

  // OVERLAP: irmãos em fluxo normal que se sobrepõem
  for (const pai of document.querySelectorAll<HTMLElement>("#root *")) {
    const pd = gcs(pai).display;
    const caixa = /flex|grid/.test(pd);
    const filhos = [...pai.children].filter((c) => {
      if (skip(c) || !visible(c)) return false;
      const cs = gcs(c);
      // caixas inline em fluxo de texto se sobrepõem por natureza (linhas quebradas)
      if (!caixa && cs.display.startsWith("inline")) return false;
      if (cs.display === "contents" || cs.display === "table-cell" || cs.display === "table-row") return false;
      if (cs.position === "absolute" || cs.position === "fixed" || cs.position === "sticky") return false;
      if (parseFloat(cs.marginLeft) < 0 || parseFloat(cs.marginTop) < 0 || parseFloat(cs.marginRight) < 0) return false;
      return (c.textContent ?? "").trim().length > 0;
    });
    if (filhos.length < 2 || filhos.length > 60) continue;
    if (/^(col|row)-start|col-start-1/.test(String((filhos[0] as HTMLElement).className))) continue;
    const pcs = gcs(pai);
    if (pcs.display.includes("grid") && filhos.some((c) => gcs(c).gridRowStart !== "auto")) continue;
    const rs = filhos.map((c) => c.getBoundingClientRect());
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i]!, b = rs[j]!;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 3 && oy > 3) {
          add("OVERLAP", `"${(filhos[i]!.textContent ?? "").trim().slice(0, 25)}" x "${(filhos[j]!.textContent ?? "").trim().slice(0, 25)}" ${R(a)} ${R(b)} @ ${desc(pai)}`);
          i = rs.length;
          break;
        }
      }
  }

  // STICKY: no rolador do documento, não pode ficar por baixo do cabeçalho e precisa de fundo opaco
  {
    const header = document.querySelector<HTMLElement>("body header");
    const hh = header ? header.getBoundingClientRect().height : 0;
    for (const el of document.querySelectorAll<HTMLElement>("#root *")) {
      const cs = gcs(el);
      if (cs.position !== "sticky" || el === header || !visible(el) || el.closest("header") === header && header) continue;
      let rolador: Element | null = null;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = gcs(a);
        if (o.overflowY !== "visible" || o.overflowX !== "visible") { rolador = a; break; }
      }
      const fundo = (e: HTMLElement) => {
        for (let a: HTMLElement | null = e; a; a = a.parentElement) {
          if (a === el.parentElement) break;
          const bg = gcs(a).backgroundColor;
          // rgb(), rgba(r, g, b, a), oklab(... / a), color(srgb ... / a)
          const alfa = bg === "transparent" ? "0" : (bg.match(/\/\s*([\d.]+)\s*\)$/)?.[1] ?? bg.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/)?.[1] ?? "1");
          const ac = gcs(a) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
          const desfoque = ac.backdropFilter || ac.webkitBackdropFilter;
          if (parseFloat(alfa) >= 0.95 || (parseFloat(alfa) >= 0.75 && desfoque && desfoque !== "none")) return true;
        }
        return false;
      };
      if (!rolador && cs.top !== "auto" && parseFloat(cs.top) < hh - 1) add("STICKY", `top=${cs.top} < cabeçalho ${Math.round(hh)} @ ${desc(el)}`);
      // Barra fixa (≥60% da largura do pai) precisa cobrir o que passa por baixo; coluna lateral e camada de aviso não.
      const barra = el.getBoundingClientRect().width >= 0.6 * (el.parentElement?.getBoundingClientRect().width ?? 0);
      if (barra && cs.pointerEvents !== "none" && !fundo(el)) add("STICKY", `fundo transparente (${cs.backgroundColor}) @ ${desc(el)}`);
    }
  }

  // SVG: gráfico que não escala (maior que o contêiner)
  for (const svg of document.querySelectorAll<SVGSVGElement>("#root svg")) {
    if (svg.parentElement?.closest("svg") || !visible(svg)) continue;
    if (svg.closest('[aria-hidden="true"], .pointer-events-none')) continue; // decoração que sangra de propósito
    const r = svg.getBoundingClientRect();
    if (r.width < 48) continue;
    const pai = svg.parentElement!;
    if (emRolagemX(svg)) continue;
    const pr = pai.getBoundingClientRect();
    if (r.right > pr.right + 1 || r.width > vw) add("SVG", `${Math.round(r.width)}px > contêiner ${Math.round(pr.width)}px @ ${desc(svg)}`);
  }

  // IMG: proporção distorcida (object-fit: fill)
  for (const img of document.querySelectorAll<HTMLImageElement>("#root img")) {
    if (!visible(img) || !img.complete || !img.naturalWidth) continue;
    if (gcs(img).objectFit !== "fill") continue;
    const r = img.getBoundingClientRect();
    const nat = img.naturalWidth / img.naturalHeight, ren = r.width / r.height;
    if (Math.abs(nat - ren) / nat > 0.05) add("IMG", `natural ${nat.toFixed(2)} vs ${ren.toFixed(2)} @ ${desc(img)}`);
  }

  // PAGE-HSCROLL: a página rola na horizontal
  {
    const y = scrollY;
    scrollTo({ left: 400, top: y, behavior: "instant" });
    if (scrollX > 0) add("PAGE-HSCROLL", `scrollX=${scrollX} sw=${document.documentElement.scrollWidth} vw=${innerWidth}`);
    scrollTo({ left: 0, top: y, behavior: "instant" });
  }
  // PAGE-CRASH: erro de render
  {
    const pre = document.querySelector("pre");
    if (pre && /TypeError|Error:/.test(pre.textContent ?? "")) add("PAGE-CRASH", (pre.textContent ?? "").slice(0, 160));
  }
  const vistos = new Set<string>();
  return out.filter((a) => { const k = a.check + a.msg; if (vistos.has(k)) return false; vistos.add(k); return true; });
}
