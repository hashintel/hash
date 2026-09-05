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

/** @type {{ name: string, failing: (css: string) => boolean }[]} */
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
      failures.push(`${file}: ${check.name}`);
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
