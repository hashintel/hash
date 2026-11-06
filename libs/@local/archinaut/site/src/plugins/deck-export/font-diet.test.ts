import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import {
  withoutUnusedKatexFamilies,
  withoutUnusedSubsets,
  withWoff2Only,
} from "./font-diet";

const require = createRequire(import.meta.url);
const sheet = (specifier: string) =>
  readFileSync(require.resolve(specifier), "utf8");

describe("withoutUnusedSubsets", () => {
  it("keeps Inter's Latin and Greek and JetBrains Mono's Latin", () => {
    const inter = withoutUnusedSubsets(
      sheet("@fontsource-variable/inter/index.css"),
    );
    expect(inter.match(/files\/[a-z-]+\.woff2/gu)).toEqual([
      "files/inter-greek-wght-normal.woff2",
      "files/inter-latin-wght-normal.woff2",
    ]);
    const mono = withoutUnusedSubsets(
      sheet("@fontsource-variable/jetbrains-mono/index.css"),
    );
    expect(mono.match(/files\/[a-z-]+\.woff2/gu)).toEqual([
      "files/jetbrains-mono-latin-wght-normal.woff2",
    ]);
  });
});

describe("KaTeX's faces", () => {
  const katex = sheet("katex/dist/katex.min.css");

  it("names woff2 files alone", () => {
    const trimmed = withWoff2Only(katex);
    expect(trimmed).not.toMatch(/\.woff\)|\.ttf\)/u);
    expect(trimmed.match(/\.woff2\)/gu)).toHaveLength(
      katex.match(/\.woff2\)/gu)?.length ?? -1,
    );
  });

  it("drops the families no rendered formula asks for", () => {
    const families = (css: string) =>
      [
        ...new Set(
          [
            ...css.matchAll(
              /@font-face\{[^}]*font-family:(KaTeX_[A-Za-z0-9]+)/gu,
            ),
          ].map(([, family]) => `font-family:${family}`),
        ),
      ].sort();
    expect(
      families(
        withoutUnusedKatexFamilies(katex, `"katex" "mord mathcal" "large-op"`),
      ),
    ).toEqual([
      "font-family:KaTeX_Caligraphic",
      "font-family:KaTeX_Main",
      "font-family:KaTeX_Math",
      "font-family:KaTeX_Size1",
      "font-family:KaTeX_Size2",
    ]);
    expect(families(withoutUnusedKatexFamilies(katex, "no formulas"))).toEqual(
      [],
    );
  });
});
