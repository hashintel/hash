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

const versionMap = new Map();
for (const { location } of workspaces) {
  const pkg = JSON.parse(
    readFileSync(resolve(rootDir, location, "package.json"), "utf-8"),
  );
  if (pkg.name && pkg.version) {
    versionMap.set(pkg.name, pkg.version);
  }
}

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];
let totalResolved = 0;

for (const { location, name } of workspaces) {
  const pkgPath = resolve(rootDir, location, "package.json");
  const raw = readFileSync(pkgPath, "utf-8");
  const pkg = JSON.parse(raw);
  let modified = false;

  for (const field of DEP_FIELDS) {
    const deps = pkg[field];
    if (!deps) continue;

    for (const [dep, range] of Object.entries(deps)) {
      if (typeof range !== "string" || !range.startsWith("workspace:")) {
        continue;
      }

      const version = versionMap.get(dep);
      if (!version) {
        console.warn(
          `  ⚠ ${name}: ${dep} has ${range} but no workspace version found`,
        );
        continue;
      }

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

console.log(`Resolved ${totalResolved} workspace: ranges`);
