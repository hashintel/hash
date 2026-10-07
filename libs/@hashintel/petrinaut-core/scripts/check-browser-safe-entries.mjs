/**
 * Fails if a browser-facing entry point reaches Node-only code.
 *
 * Type checking accepts imports that browser bundlers cannot resolve. Inspecting the emitted imports catches these dependencies without building a consuming application.
 *
 * Run after `yarn build`, since it inspects `dist`.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const packageRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");

/**
 * Entries a browser bundle may import, and what they must never reach.
 *
 * `hir`, `compiled-model` and `diagnostics` are deliberately absent: they are
 * Node-only entries and intentionally depend on the compiler.
 */
const BROWSER_SAFE_ENTRIES = ["index.js", "webgpu.js", "hir-runtime.js"];

/** Bare specifiers that mean "this cannot run in a browser". */
const NODE_ONLY = new Set([
  "@typescript/typescript6",
  "module",
  "fs",
  "fs/promises",
  "path",
  "os",
  "crypto",
  "child_process",
  "worker_threads",
  "url",
  "util",
  "typescript",
]);

/**
 * Follows relative imports from `entry` and returns every bare specifier
 * reached, mapped to the first file that imported it.
 *
 * @param {string} entry
 * @returns {Map<string, string>}
 */
function collectBareImports(entry) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Map<string, string>} */
  const bare = new Map();
  /** @type {string[]} */
  const queue = [entry];

  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);

    const source = readFileSync(file, "utf8");

    // Static and dynamic import specifiers, plus CJS requires, as they appear in
    // the built output.
    /** @type {string[]} */
    const specifiers = [];
    for (const pattern of [
      /(?:from|import)\s*\(?\s*["']([^"']+)["']/gu,
      /require\(\s*["']([^"']+)["']\s*\)/gu,
    ]) {
      for (const [, specifier] of source.matchAll(pattern)) {
        specifiers.push(specifier);
      }
    }

    for (const specifier of specifiers) {
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier);
        queue.push(existsSync(target) ? target : `${target}.js`);
      } else {
        const bareName = specifier.startsWith("node:")
          ? specifier.slice("node:".length)
          : specifier;
        if (!bare.has(bareName)) {
          bare.set(bareName, file);
        }
      }
    }
  }

  return bare;
}

let failed = false;

for (const entry of BROWSER_SAFE_ENTRIES) {
  const entryPath = resolve(packageRoot, "dist", entry);
  const bare = collectBareImports(entryPath);
  const offenders = [...bare].filter(([name]) => NODE_ONLY.has(name));

  if (offenders.length === 0) {
    const external = [...bare.keys()];
    process.stdout.write(
      `  ok   ${entry}${external.length > 0 ? ` (external: ${external.join(", ")})` : " (no external imports)"}\n`,
    );
    continue;
  }

  failed = true;
  process.stdout.write(`  FAIL ${entry}\n`);
  for (const [name, importer] of offenders) {
    process.stdout.write(
      `         reaches "${name}" via ${importer.replace(`${packageRoot}/`, "")}\n`,
    );
  }
}

if (failed) {
  process.stdout.write(
    "\nA browser-facing entry reaches Node-only code. Consuming apps will fail to\n" +
      "bundle with `Module not found`. Move the Node-only dependency behind a\n" +
      "separate entry point rather than guarding the import site.\n",
  );
  process.exit(1);
}

process.stdout.write(
  "\nAll browser-facing entries are free of Node-only imports.\n",
);
