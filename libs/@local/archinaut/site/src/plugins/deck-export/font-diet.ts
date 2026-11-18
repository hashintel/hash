/**
 * Keeps an exported deck's inlined fonts to what its slides can draw. Every
 * font goes into the file as a data URL, so each face left out is weight
 * the file no longer carries:
 *
 * - of the two text faces, the Latin and Greek subsets of Inter and the
 *   Latin subset of JetBrains Mono; a character outside them falls back to
 *   a system face;
 * - of KaTeX's faces, the woff2 files alone, which every browser that runs
 *   the player reads, and only the families the deck's formulas use, known
 *   from the class names KaTeX gave the rendered formulas.
 */

const keptSubsets: Record<string, readonly string[]> = {
  "inter-": ["latin", "greek"],
  "jetbrains-mono-": ["latin"],
};

/** A Fontsource sheet without the `@font-face` rules of the subsets left out. */
export const withoutUnusedSubsets = (css: string): string =>
  css.replace(
    /\/\*[^*]*\*\/\s*@font-face\s*\{[^}]*url\(\.\/files\/([a-z-]+)-wght-normal\.woff2\)[^}]*\}\s*/gu,
    (rule, stem: string) => {
      const face = Object.keys(keptSubsets).find((prefix) =>
        stem.startsWith(prefix),
      );
      return face === undefined ||
        keptSubsets[face]?.includes(stem.slice(face.length)) === true
        ? rule
        : "";
    },
  );

/** KaTeX's sheet naming its woff2 files alone, without the woff and ttf fallbacks. */
export const withWoff2Only = (css: string): string =>
  css.replace(
    /,\s*url\([^)]+\.woff\)\s*format\("woff"\)\s*,\s*url\([^)]+\.ttf\)\s*format\("truetype"\)/gu,
    "",
  );

/** Which KaTeX families the rendered formulas need, by the classes that set them. */
const katexFamilies: Record<string, RegExp> = {
  KaTeX_AMS: /\b(?:amsrm|mathbb|textbb)\b/u,
  KaTeX_Caligraphic: /\bmathcal\b/u,
  KaTeX_Fraktur: /\b(?:mathfrak|textfrak)\b/u,
  KaTeX_Main: /\bkatex\b/u,
  KaTeX_Math: /\bkatex\b/u,
  KaTeX_SansSerif: /\b(?:mathsf|textsf|mathsfit)\b/u,
  KaTeX_Script: /\b(?:mathscr|textscr)\b/u,
  KaTeX_Size1: /\b(?:delimsizing|large-op|small-op|delim-size1)\b/u,
  KaTeX_Size2: /\b(?:delimsizing|large-op|delim-size)\b/u,
  KaTeX_Size3: /\b(?:delimsizing|delim-size)\b/u,
  KaTeX_Size4: /\b(?:delimsizing|delim-size)\b/u,
  KaTeX_Typewriter: /\b(?:mathtt|texttt)\b/u,
};

/** The built stylesheet without the KaTeX families the built code never asks for. */
export const withoutUnusedKatexFamilies = (css: string, code: string): string =>
  css.replace(
    /@font-face\s*\{[^}]*font-family:\s*"?(KaTeX_[A-Za-z0-9]+)"?[^}]*\}/gu,
    (rule, family: string) =>
      katexFamilies[family]?.test(code) === false ? "" : rule,
  );
