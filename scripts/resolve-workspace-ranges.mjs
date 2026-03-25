/**
 * Resolves `workspace:` protocol ranges in all workspace package.json files,
 * replacing them with concrete version ranges.
 *
 * This is intended to run ephemerally in CI before `changeset publish`,
 * so that npm (which doesn't understand workspace: ranges) publishes
 * correct dependency versions. The changes should NOT be committed.
 *
 * Handles: workspace:^ → ^x.y.z, workspace:~ → ~x.y.z, workspace:* → x.y.z
 *
 * @see https://github.com/changesets/changesets/issues/432
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const output = execSync("yarn workspaces list --json", {
  encoding: "utf-8",
  cwd: rootDir,
});

const workspaces = output.split("\n").filter(Boolean).map(JSON.parse);

console.log("Rewriting 'workspace:' dependency ranges in packages...");

const packageMap = new Map();
for (const { location } of workspaces) {
  const pkg = JSON.parse(
    readFileSync(resolve(rootDir, location, "package.json"), "utf-8"),
  );
  if (pkg.name && pkg.version) {
    packageMap.set(pkg.name, { version: pkg.version, private: !!pkg.private });
  }
}

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];
let totalResolved = 0;

for (const { location, name } of workspaces) {
  const pkgPath = resolve(rootDir, location, "package.json");
  const raw = readFileSync(pkgPath, "utf-8");
  const pkg = JSON.parse(raw);

  if (pkg.private) {
    continue;
  }

  let modified = false;

  for (const field of DEP_FIELDS) {
    const deps = pkg[field];
    if (!deps) continue;

    for (const [dep, range] of Object.entries(deps)) {
      if (typeof range !== "string" || !range.startsWith("workspace:")) {
        continue;
      }

      const depInfo = packageMap.get(dep);
      if (!depInfo) {
        console.warn(
          `  ⚠ ${name}: ${dep} has ${range} but no workspace package found`,
        );
        continue;
      }

      if (depInfo.private) {
        continue;
      }

      const { version } = depInfo;

      const specifier = range.slice("workspace:".length);
      let resolved;
      switch (specifier) {
        case "*":
          resolved = version;
          break;
        case "^":
          resolved = `^${version}`;
          break;
        case "~":
          resolved = `~${version}`;
          break;
        default:
          resolved = specifier;
          break;
      }

      deps[dep] = resolved;
      modified = true;
      totalResolved++;
    }
  }

  if (modified) {
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`  ✓ ${name}`);
  }
}

console.log(`Rewrote ${totalResolved} 'workspace:' dependency ranges`);

// With enableTransparentWorkspaces: false (the repo default), Yarn only treats
// `workspace:` protocol references as local packages. After rewriting those to
// concrete ranges, a subsequent `yarn install` needs transparent workspaces so
// that Yarn matches e.g. ^0.0.2 to the local workspace at version 0.0.2.
const yarnrcPath = resolve(rootDir, ".yarnrc.yml");
const yarnrc = readFileSync(yarnrcPath, "utf-8");
const twMatch = yarnrc.match(/enableTransparentWorkspaces:\s*(\S+)/);
if (!twMatch) {
  writeFileSync(
    yarnrcPath,
    yarnrc.trimEnd() + "\nenableTransparentWorkspaces: true\n",
  );
  console.log("Added enableTransparentWorkspaces: true to .yarnrc.yml");
} else if (twMatch[1] === "true") {
  console.log(".yarnrc.yml already has enableTransparentWorkspaces: true");
} else {
  const yarnrcPatched = yarnrc.replace(
    twMatch[0],
    "enableTransparentWorkspaces: true",
  );
  writeFileSync(yarnrcPath, yarnrcPatched);
  console.log("Patched .yarnrc.yml: enableTransparentWorkspaces → true");
}
