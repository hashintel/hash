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

  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
};

const main = () => {
  try {
    console.log("Removing devDependencies from package.json...");
    updatePackageJson();
    console.log("Prepublish script completed successfully!");
  } catch (error) {
    console.error("Error in prepublish script:", error);
    process.exit(1);
  }
};

main();
