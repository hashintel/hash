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
) => {
  const files = getFilesOnly(directoryPath);

  for (const file of files) {
    let content = fs.readFileSync(file, "utf8");

    for (const [oldImport, newImport] of Object.entries(importMappings)) {
      content = content.replaceAll(oldImport, newImport);
    }

    fs.writeFileSync(file, content, "utf8");
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

const oldUtilityTypeStatement = `// This file was generated from \`libs/@blockprotocol/type-system/rust/tests/codegen.rs\`

import type { Real } from "@rust/hash-codec/types";
import type { Brand } from "@local/advanced-types/brand";`;

const newUtilityTypeStatement = `type Real = number;
type BrandedBase<Base, Kind extends Record<string, unknown>> = Base & {
  // The property prefixes are chosen such that they shouldn't appear in intellisense.

  /** The type of the value space that is branded */
  readonly "#base": Base;
  /** The unique name for the branded type */
  readonly "#kind": Kind;
};

/**
 * The type-branding type to support nominal (name based) types
 */
type Brand<Base, Kind extends string> = Base extends BrandedBase<
  infer NestedBase,
  infer NestedKind
>
  ? BrandedBase<NestedBase, NestedKind & { [_ in Kind]: true }>
  : BrandedBase<Base, { [_ in Kind]: true }>;`;

const vendorInUtilityTypes = (content: string) => {
  return content
    .replace(
      'import type { Real } from "@rust/hash-codec/types";',
      "type Real = number;",
    )
    .replace(
      'import type { Brand } from "@local/advanced-types/brand";',
      `type BrandedBase<Base, Kind extends Record<string, unknown>> = Base & {
  // The property prefixes are chosen such that they shouldn't appear in intellisense.

  /** The type of the value space that is branded */
  readonly "#base": Base;
  /** The unique name for the branded type */
  readonly "#kind": Kind;
};

/**
 * The type-branding type to support nominal (name based) types
 */
type Brand<Base, Kind extends string> = Base extends BrandedBase<
  infer NestedBase,
  infer NestedKind
>
  ? BrandedBase<NestedBase, NestedKind & { [_ in Kind]: true }>
  : BrandedBase<Base, { [_ in Kind]: true }>;
  `,
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

    const typeSystemContent = fs.readFileSync(sourceTypeSystemPath, "utf8");
    const vendoredTypeSystemContent = vendorInUtilityTypes(typeSystemContent);
    fs.writeFileSync(targetTypeSystemPath, vendoredTypeSystemContent, "utf8");

    // 3. Copy @index.snap.d.ts to src/native/type-system-rs/types.d.ts
    const sourceTypesPath = path.join(
      packageRoot,
      "..",
      "rust",
      "types",
      "index.snap.d.ts",
    );
    const targetTypesPath = path.join(typeSystemRsDir, "types.d.ts");

    const typesContent = fs.readFileSync(sourceTypesPath, "utf8");
    const vendoredTypesContent = vendorInUtilityTypes(typesContent);
    fs.writeFileSync(targetTypesPath, vendoredTypesContent, "utf8");

    // 4. Update import references in src/native
    updateImportReferences(path.join(packageRoot, "src", "native"), {
      '"@blockprotocol/type-system-rs"': '"./type-system-rs/type-system.d.ts"',
      "@blockprotocol/type-system-rs/types": "./type-system-rs/types.d.ts",
    });

    // 5. Update import references in src (but not subfolders)
    console.log("Updating import references in src...");
    updateImportReferences(path.join(packageRoot, "src"), {
      '"@blockprotocol/type-system-rs"':
        '"./native/type-system-rs/type-system.d.ts"',
      "@blockprotocol/type-system-rs/types":
        "./native/type-system-rs/types.d.ts",
    });

    // 6. Update package.json
    updatePackageJson();

    console.log("Prepublish script completed successfully!");
  } catch (error) {
    console.error("Error in prepublish script:", error);
    process.exit(1);
  }
};

main();
