import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { cssEase, duration, easing } from "./tokens";

// As curvas usadas em CSS (styles.css) devem ser as mesmas dos tokens TS.
const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

describe("tokens CSS = tokens TS", () => {
  test.each(Object.entries(easing))("--motion-ease-%s", (name, e) => expect(css).toContain(`--motion-ease-${name}: ${cssEase(e)};`));
  test.each(Object.entries(duration))("--motion-dur-%s", (name, d) => expect(css).toContain(`--motion-dur-${name}: ${Math.round(d * 1000)}ms;`));
  test("reduced-motion desliga view transitions", () => expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*::view-transition-group\(\*\)/));
});
