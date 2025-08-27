#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");

const getFilesOnly = (directoryPath: string) => {
  const files: string[] = [];

  const items = fs.readdirSync(directoryPath);

  for (const item of items) {
    const fullPath = path.join(directoryPath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // we need different logic for src/native vs src/
      continue;
    }

    files.push(fullPath);
  }

  return files;
};

const updateImportReferences = (
  directoryPath: string,
  importMappings: Record<string, string>,
  addSrcPrefix = false,
) => {
  const files = getFilesOnly(directoryPath);

  for (const file of files) {
    let content = fs.readFileSync(file, "utf8");

    for (const [oldImport, newImport] of Object.entries(importMappings)) {
      const regex = new RegExp(
        `from\\s+['"]${oldImport.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]`,
        "g",
      );

      if (regex.test(content)) {
        let replacement = newImport;
        if (addSrcPrefix) {
          replacement = `./src${newImport}`;
        }
        content = content.replace(regex, `from '${replacement}'`);
      }
    }
  }
};

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

const main = () => {
  console.log(
    "Removing @blockprotocol/type-system-rs dependency from published package...",
  );

  try {
    // 1. Create type-system-rs directory in src/native to hold vendored-in files
    const typeSystemRsDir = path.join(
      packageRoot,
      "src",
      "native",
      "type-system-rs",
    );

    fs.mkdirSync(typeSystemRsDir, { recursive: true });

    // 2. Copy @type-system.d.ts to src/native/type-system-rs/type-system.d.ts
    const sourceTypeSystemPath = path.join(
      packageRoot,
      "..",
      "rust",
      "pkg",
      "type-system.d.ts",
    );
    const targetTypeSystemPath = path.join(typeSystemRsDir, "type-system.d.ts");

    fs.copyFileSync(sourceTypeSystemPath, targetTypeSystemPath);

    // 3. Copy @index.snap.d.ts to src/native/type-system-rs/types.d.ts
    const sourceTypesPath = path.join(
      packageRoot,
      "..",
      "rust",
      "types",
      "index.snap.d.ts",
    );
    const targetTypesPath = path.join(typeSystemRsDir, "types.d.ts");

    fs.copyFileSync(sourceTypesPath, targetTypesPath);

    // 4. Update import references in src/native
    updateImportReferences(path.join(packageRoot, "src", "native"), {
      "@blockprotocol/type-system-rs": "./type-system-rs/type-system.d.ts",
      "@blockprotocol/type-system-rs/types": "./type-system-rs/types.d.ts",
    });

    // 5. Update import references in src (but not subfolders)
    console.log("Updating import references in src...");
    updateImportReferences(
      path.join(packageRoot, "src"),
      {
        "@blockprotocol/type-system-rs":
          "./native/type-system-rs/type-system.d.ts",
        "@blockprotocol/type-system-rs/types":
          "./native/type-system-rs/types.d.ts",
      },
      true,
    );

    // 6. Update package.json
    updatePackageJson();

    console.log("Prepublish script completed successfully!");
  } catch (error) {
    console.error("Error in prepublish script:", error);
    process.exit(1);
  }
};

main();
