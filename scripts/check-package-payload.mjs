/**
 * Verifies that a package's payload is present and non-empty at pack time.
 *
 * This is intended to run as part of `prepack` (with the package directory as
 * the working directory), so that `npm pack` / `changeset publish` fails loudly
 * instead of shipping a tarball whose entry points are missing or empty — as
 * happened with @hashintel/ds-helpers 0.1.1 and 0.2.1, where concurrent
 * sibling publishes rewrote the generated `styled-system/` output mid-pack.
 *
 * Checks every literal relative file target referenced from `main`, `module`,
 * `types`, `bin`, and `exports` (walking nested condition objects). Wildcard
 * targets (`./dist/components/*.js` style) are checked by requiring the
 * directory portion to exist and contain at least one file.
 *
 * Zero dependencies on purpose: it must be runnable in the publish
 * environment before/without a workspace install.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const packageDir = resolve(process.argv[2] ?? process.cwd());
const packageJsonPath = join(packageDir, "package.json");

if (!existsSync(packageJsonPath)) {
  console.error(`check-package-payload: no package.json found in ${packageDir}`);
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const packageName = packageJson.name ?? packageDir;

/** @type {Set<string>} */
const targets = new Set();

/** @param {unknown} value */
const collect = (value) => {
  if (typeof value === "string") {
    // Only literal relative file targets — a "." key or condition name is
    // never passed here, and the package.json self-reference is always fine.
    if (value === "./package.json" || value === "package.json") {
      return;
    }
    targets.add(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) {
      collect(entry);
    }
  } else if (value && typeof value === "object") {
    // exports subpath map or nested condition object ("import", "types", …),
    // or a `bin` name → path map: the string leaves are the file targets.
    for (const entry of Object.values(value)) {
      collect(entry);
    }
  }
};

for (const field of ["main", "module", "types", "bin", "exports"]) {
  collect(packageJson[field]);
}

/**
 * @param {string} dir
 * @returns {boolean} whether the directory (recursively) contains a file
 */
const containsFile = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) {
      return true;
    }
    if (entry.isDirectory() && containsFile(join(dir, entry.name))) {
      return true;
    }
  }
  return false;
};

/** @type {string[]} */
const problems = [];

for (const target of [...targets].sort()) {
  if (target.includes("*")) {
    // Wildcard pattern: require the directory portion to exist and be
    // non-empty. `./dist/components/*.js` → `./dist/components`.
    const beforeWildcard = target.slice(0, target.indexOf("*"));
    const dir = resolve(
      packageDir,
      beforeWildcard.includes("/")
        ? beforeWildcard.slice(0, beforeWildcard.lastIndexOf("/"))
        : ".",
    );
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      problems.push(`${target} → directory ${dir} does not exist`);
    } else if (!containsFile(dir)) {
      problems.push(`${target} → directory ${dir} contains no files`);
    }
    continue;
  }

  const resolved = resolve(packageDir, target);
  if (!resolved.startsWith(packageDir + sep)) {
    problems.push(`${target} → resolves outside the package directory`);
    continue;
  }
  if (!existsSync(resolved)) {
    problems.push(`${target} → file does not exist`);
    continue;
  }
  const stats = statSync(resolved);
  if (stats.isDirectory()) {
    if (!containsFile(resolved)) {
      problems.push(`${target} → directory is empty`);
    }
  } else if (stats.size === 0) {
    problems.push(`${target} → file is empty (0 bytes)`);
  }
}

if (targets.size === 0) {
  console.error(
    `check-package-payload: ${packageName} declares no file targets in main/module/types/bin/exports — refusing to pack a payload that cannot be verified`,
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error(
    `check-package-payload: ${packageName} payload is missing or empty:`,
  );
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(
  `check-package-payload: ${packageName} — all ${targets.size} file target(s) present and non-empty`,
);
