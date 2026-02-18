import path from "node:path";
import fs from "node:fs";

import chalk from "chalk";

import { getWorkspaceInfoLookup, monorepoRootDirPath } from "./shared/monorepo";

const depSections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

interface Violation {
  file: string;
  section: string;
  dep: string;
  range: string;
}

const script = async () => {
  console.log(
    "Checking workspace protocol usage in internal dependencies...\n",
  );

  const workspaceInfoLookup = await getWorkspaceInfoLookup();
  const workspaceNames = new Set(Object.keys(workspaceInfoLookup));

  // Collect all package.json paths from workspace info
  const packageJsonPaths = [
    path.join(monorepoRootDirPath, "package.json"),
    ...Object.values(workspaceInfoLookup).map((info) =>
      path.resolve(monorepoRootDirPath, info.location, "package.json"),
    ),
  ];

  const violations: Violation[] = [];

  for (const pkgPath of packageJsonPaths) {
    if (!fs.existsSync(pkgPath)) {
      continue;
    }

    const raw = fs.readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as Record<string, unknown>;

    for (const section of depSections) {
      const deps = pkg[section];
      if (typeof deps !== "object" || deps === null) {
        continue;
      }

      for (const [depName, range] of Object.entries(
        deps as Record<string, string>,
      )) {
        if (workspaceNames.has(depName) && range !== "workspace:*") {
          violations.push({
            file: path.relative(monorepoRootDirPath, pkgPath),
            section,
            dep: depName,
            range,
          });
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log(
      chalk.green("✓ All internal workspace dependencies use workspace:*"),
    );
    process.exit(0);
  }

  console.log(
    chalk.red(
      `✗ Found ${violations.length} internal dependency range${violations.length === 1 ? "" : "s"} not using workspace:*\n`,
    ),
  );

  for (const v of violations) {
    console.log(
      `  ${chalk.cyan(v.file)} → ${chalk.yellow(v.section)} → ${chalk.bold(v.dep)}: ${chalk.red(v.range)} (expected ${chalk.green("workspace:*")})`,
    );
  }

  console.log();
  process.exit(1);
};

void (async () => {
  await script();
})();
