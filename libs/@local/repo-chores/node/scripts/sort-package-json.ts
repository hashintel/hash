import fs from "node:fs/promises";
import path from "node:path";

import chalk from "chalk";
import { execa } from "execa";
import ignore from "ignore";
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
      stripFinalNewline: false,
    },
  );

  if (contents === output) {
    return { failed: [] };
  }

  if (lint) {
    return {
      failed: [packageJsonPath],
    };
  } else {
    await fs.writeFile(packageJsonPath, output);
    return { failed: [] };
  }
};

const fixTimed = async (
  packageJsonPath: string,
  { lint }: { lint: boolean },
) => {
  const start = Date.now();
  const operation = lint ? "lint" : "fix";

  const output = await fix(packageJsonPath, { lint });

  const took = Date.now() - start;
  console.log(chalk.gray(`Took ${took}ms to ${operation} ${packageJsonPath}`));

  return output;
};

const main = async () => {
  const now = Date.now();

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
    const nowGlob = Date.now();

    // find all package.json files
    const ignoreFile = ignore().add(
      await fs.readFile(`${monorepoRootDirPath}/.gitignore`, "utf8"),
    );

    matches = await Array.fromAsync(
      fs.glob(["package.json", "**/package.json"], {
        cwd: monorepoRootDirPath,
        exclude: (directoryOrFile) => {
          let pathname = path.relative(
            monorepoRootDirPath,
            `${directoryOrFile.parentPath}/${directoryOrFile.name}`,
          );

          if (directoryOrFile.isBlockDevice()) {
            pathname = `${pathname}/`;
          }

          return ignoreFile.ignores(pathname);
        },
        withFileTypes: true,
      }),
    ).then((files) => files.map((file) => `${file.parentPath}/${file.name}`));

    const tookGlob = Date.now() - nowGlob;
    console.log(`Took ${tookGlob}ms to find all package.json files`);
  } else {
    matches = matches.map((match) =>
      match.startsWith("/") ? match : `${monorepoRootDirPath}/${match}`,
    );
  }

  console.log(`Found ${matches.length} package.json files`);
  const { failed } = await Promise.all(
    matches.map((match) => fixTimed(match, { lint: isLint })),
  ).then((results) =>
    results.reduce(
      (acc, result) => ({
        failed: [...acc.failed, ...result.failed],
      }),
      { failed: [] },
    ),
  );

  const took = Date.now() - now;
  console.log(`Total time: ${took}ms`);

  if (failed.length > 0) {
    for (const file of failed) {
      console.log(chalk.red("[ERROR]"), file);
    }

    process.exit(1);
  }
};

await main();
