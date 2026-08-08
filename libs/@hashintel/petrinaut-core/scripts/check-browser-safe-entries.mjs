/**
 * Fails if a browser-facing entry point reaches Node-only code.
 *
 * This exists because that mistake broke the frontend build twice in a row, and
 * neither `lint:tsc`, `lint:eslint` nor `test:unit` can see it — the import is
 * perfectly valid TypeScript. Only bundling the consumer catches it, and a full
 * `@apps/hash-frontend` build takes ~9 minutes, which is too slow to run before
 * every push.
 *
 * The failure mode it guards: an entry that transitively imports the HIR
 * frontend pulls in the TypeScript compiler, whose `require("module")` webpack
 * cannot resolve for the browser, so the consuming app fails with
 * `Module not found: Can't resolve 'module'`.
 *
 *   node scripts/check-browser-safe-entries.mjs
 *
 * Run after `yarn build`, since it inspects `dist`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const packageRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");

/**
 * Entries a browser bundle may import, and what they must never reach.
 *
 * `hir` and `compiled-model` are deliberately absent: they are Node/worker
 * entries and are *expected* to bundle the compiler.
 */
const BROWSER_SAFE_ENTRIES = ["index.js", "webgpu.js", "hir-runtime.js"];

/** Bare specifiers that mean "this cannot run in a browser". */
const NODE_ONLY = new Set([
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

    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }

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
        queue.push(target, `${target}.js`);
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
