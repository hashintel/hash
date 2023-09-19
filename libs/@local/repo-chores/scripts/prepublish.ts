import path from "node:path";

import chalk from "chalk";
import execa from "execa";
import fs from "fs-extra";

import { UserFriendlyError } from "./shared/errors";
import { checkIfDirHasUncommittedChanges } from "./shared/git";
import {
  derivePackageInfoFromEnv,
  outputPackageInfo,
} from "./shared/package-infos";
import { updateJson } from "./shared/update-json";

const replaceWithDistPath = (path: string, extension: ".d.ts" | ".js") =>
  path.replace("dist", "src").replace(".ts", extension);

const script = async () => {
  console.log(chalk.bold("Cleaning up before publishing..."));

  const packageInfo = await derivePackageInfoFromEnv();
  outputPackageInfo(packageInfo);

  if (await checkIfDirHasUncommittedChanges(packageInfo.path)) {
    throw new UserFriendlyError(
      `Please commit or revert changes in ${packageInfo.path} before running this script`,
    );
  }

  if (!(await fs.pathExists(path.resolve(packageInfo.path, ".npmignore")))) {
    throw new UserFriendlyError(
      `Please create .npmignore in ${packageInfo.path} before running this script`,
    );
  }

  process.stdout.write(`Removing dist...`);

  await fs.remove(path.resolve(packageInfo.path, "dist"));

  process.stdout.write(" Done\n");
  process.stdout.write(`Building...`);

  // tsconfig.json is supposed to configured for local development and linting.
  // We need to override some options to generate a build that is ready for publishing.
  await execa(
    "tsc",
    // prettier-ignore
    [
      "--project", "tsconfig.json",
      
      "--declaration", "true",
      "--jsx", "react-jsx",
      "--noEmit", "false",
      "--outDir", "dist",
      "--target", "es2020",
    ],
    {
      cwd: packageInfo.path,
      stdout: "inherit",
    },
  );

  process.stdout.write(" Done\n");

  process.stdout.write(`Updating package.json...`);

  const expectedMainName = "src/main.ts";

  await updateJson(
    path.resolve(packageInfo.path, "package.json"),
    (packageJson) => {
      if ("main" in packageJson) {
        /* eslint-disable @typescript-eslint/no-unsafe-member-access,@typescript-eslint/restrict-template-expressions,no-param-reassign -- see comment on updateJson() for potential improvement */
        if (packageJson.main === expectedMainName) {
          throw new UserFriendlyError(
            `Unexpected value for field "main" in package.json. Please align this package with other publishable packages for consistency. Expected: "${expectedMainName}". Got: "${packageJson.main}"`,
          );
        }
        packageJson.main = "dist/main.js";

        if (packageJson.types !== "src/main.ts") {
          throw new UserFriendlyError(
            `Unexpected value for field "types" in package.json. Please align this package with other publishable packages for consistency. Expected: "${expectedMainName}". Got: "${packageJson.types}"`,
          );
        }
        packageJson.types = "dist/main.d.ts";
      } else if (packageJson.exports) {
        for (const [key, exportPath] of packageJson.exports) {
          packageJson.exports[key] = replaceWithDistPath(
            exportPath as string,
            ".js",
          );
        }
        for (const [key, typePathArray] of packageJson.typesVersions["*"]) {
          packageJson.typesVersions["*"][key] = (typePathArray as string[]).map(
            (typePath: string) => replaceWithDistPath(typePath, ".d.ts"),
          );
        }
      } else {
        throw new UserFriendlyError(
          "Unrecognised package.json export format – please either a single 'main' export or an 'exports' group.",
        );
      }

      delete packageJson.devDependencies;
      /* eslint-enable @typescript-eslint/no-unsafe-member-access,@typescript-eslint/restrict-template-expressions,no-param-reassign */
    },
  );

  process.stdout.write(" Done\n");
};

export default script();
