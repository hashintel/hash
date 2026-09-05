/**
 * Checks the built stylesheets for rewrites that silently disable the chrome.
 *
 * This exists because one already happened. A CSS minifier folded the scroll
 * timeline into the `animation` shorthand — `animation: linear both
 * pnd-fade-grow scroll(root)` — and no browser accepts a timeline there, so the
 * declaration was invalid and `animation-name` computed to `none`. The fade
 * bands were dead in every built page while the unminified dev server kept
 * working, and nothing failed: the header script stands down whenever the
 * browser supports the CSS path, which it did.
 *
 * A build that produces no bands should not be publishable, so the shapes that
 * carried that bug are asserted against here rather than left to a reader.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const assetsDir = path.join(import.meta.dirname, "..", "dist", "_astro");

/** A timeline inside the `animation` shorthand: the rewrite that broke it. */
const timelineInShorthand =
  /animation\s*:[^;}]*\b(?:scroll|view)\s*\(|animation\s*:[^;}]*--pnd-nav-scroll/u;

/**
 * Every custom property naming a resting opacity, wherever it is declared.
 *
 * @param {string} css
 * @returns {Set<string>}
 */
const idleOpacityTokens = (css) =>
  new Set(
    [...css.matchAll(/(--pnd-[a-z-]*idle-opacity)\s*:/gu)].map(
      (match) => match[1],
    ),
  );

/**
 * The body of the `prefers-reduced-transparency` rule, braces balanced.
 *
 * @param {string} css
 * @returns {string | null}
 */
const reducedTransparencyBlock = (css) => {
  const opening = css.search(/@media[^{]*prefers-reduced-transparency[^{]*\{/u);

  if (opening === -1) {
    return null;
  }

  let depth = 0;

  for (let at = css.indexOf("{", opening); at < css.length; at += 1) {
    if (css[at] === "{") {
      depth += 1;
    } else if (css[at] === "}") {
      depth -= 1;

      if (depth === 0) {
        return css.slice(opening, at + 1);
      }
    }
  }

  return null;
};

/**
 * Which resting opacities the reduced-transparency rule forgets to lift.
 *
 * A reader who asks for less transparency should get all of the chrome at full
 * strength, and each of these tokens holds back one piece of it. Nothing ties a
 * new token to that rule, so splitting one out silently leaves its element
 * faded — which is how the left rail came to be the only thing still at 52.5%
 * for exactly the readers who had asked it not to be.
 *
 * @param {string} css
 * @returns {string[]}
 */
const unreset = (css) => {
  const tokens = idleOpacityTokens(css);

  if (tokens.size === 0) {
    return [];
  }

  const block = reducedTransparencyBlock(css);

  if (block === null) {
    return [...tokens];
  }

  return [...tokens].filter((token) => !block.includes(`${token}:`));
};

/**
 * @type {{
 *   name: string,
 *   failing: (css: string) => boolean,
 *   detail?: (css: string) => string,
 * }[]}
 */
const checks = [
  {
    name: "no scroll timeline folded into the `animation` shorthand",
    failing: (css) => timelineInShorthand.test(css),
  },
  {
    name: "the scroll-driven bands still declare a timeline",
    failing: (css) =>
      css.includes("pnd-fade-grow") && !css.includes("animation-timeline:"),
  },
  {
    name: "`--pnd-fade-progress` is still registered, so it can interpolate",
    failing: (css) =>
      css.includes("pnd-fade-grow") &&
      !css.includes("@property --pnd-fade-progress"),
  },
  {
    name: "every resting opacity is lifted under prefers-reduced-transparency",
    failing: (css) => unreset(css).length > 0,
    detail: (css) => unreset(css).join(", "),
  },
];

const files = (await readdir(assetsDir)).filter((name) =>
  name.endsWith(".css"),
);

if (files.length === 0) {
  console.error(`no stylesheets in ${assetsDir}; run the build first`);
  process.exit(1);
}

const failures = [];

for (const file of files) {
  const css = await readFile(path.join(assetsDir, file), "utf8");

  for (const check of checks) {
    if (check.failing(css)) {
      const detail = check.detail?.(css);
      failures.push(`${file}: ${check.name}${detail ? ` (${detail})` : ""}`);
    }
  }
}

if (failures.length > 0) {
  console.error("built CSS check failed:");
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

console.log(`built CSS check passed over ${files.length} stylesheets`);
