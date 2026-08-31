#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");

const updatePackageJson = () => {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    devDependencies?: Record<string, string>;
    dependencies: Record<string, string>;
  };

  delete packageJson.devDependencies;

  delete packageJson.dependencies["@blockprotocol/type-system-rs"];

  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
};

/**
 * `Real` is the only type the generated declarations pull from another crate. Inlining it keeps the
 * published package free of a dependency on the unpublished `@rust/hash-codec`.
 */
const inlineUtilityTypes = () => {
  const generatedDir = path.join(packageRoot, "src", "generated");

  for (const file of fs.readdirSync(generatedDir)) {
    const filePath = path.join(generatedDir, file);

    fs.writeFileSync(
      filePath,
      fs
        .readFileSync(filePath, "utf8")
        .replace(
          'import type { Real } from "@rust/hash-codec/types";',
          "type Real = number;",
        ),
      "utf8",
    );
  }
};

const main = () => {
  try {
    inlineUtilityTypes();
    updatePackageJson();

    console.log("Prepublish script completed successfully!");
  } catch (error) {
    console.error("Error in prepublish script:", error);
    process.exit(1);
  }
};

main();
