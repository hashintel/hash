import fs from "node:fs/promises";

import execa from "execa";
import globby from "globby";
import sortPackageJson from "sort-package-json";

import { monorepoRootDirPath } from "./shared/monorepo";

const fix = async (packageJsonPath: string, { lint }: { lint: boolean }) => {
  const contents = await fs.readFile(packageJsonPath, "utf8");
  const sorted = sortPackageJson(contents);

  const { stdout: output } = await execa(
    "biome",
    ["format", `--stdin-file-path=${packageJsonPath}`],
    {
      input: sorted,
    },
  );

  if (contents === output) {
    return;
  }

  if (lint) {
    throw new Error(
      `Please run \`yarn fix:package-json\` to fix ${packageJsonPath}`,
    );
  } else {
    await fs.writeFile(packageJsonPath, output);
  }
};

const fixTimed = async (
  packageJsonPath: string,
  { lint }: { lint: boolean },
) => {
  const operation = lint ? "lint" : "fix";

  const start = Date.now();
  try {
    await fix(packageJsonPath, { lint });
  } finally {
    const took = Date.now() - start;
    console.log(`Took ${took}ms to ${operation} ${packageJsonPath}`);
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    throw new Error(
      "Command usage: node scripts/sort-package-json.ts <lint|fix> [package.json paths]",
    );
  }

  // the first element is either `lint` or `fix`
  const isLint = args[0] === "lint";

  // the remaining elements (if they exist) are the package.json paths
  // to fix or lint
  let matches = args.slice(1);

  if (matches.length === 0) {
    // find all package.json files
    matches = await globby(["**/package.json"], {
      cwd: monorepoRootDirPath,
      gitignore: true,
    });
  }

  await Promise.all(
    matches.map((match) =>
      fixTimed(`${monorepoRootDirPath}/${match}`, { lint: isLint }),
    ),
  );
};

await main();
