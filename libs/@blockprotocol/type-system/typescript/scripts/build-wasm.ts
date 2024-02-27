// @todo consider using execa
import * as child_process from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import fs from "fs-extra";

export const packageDirPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// The PathObject definition in Node's path package
type PathObject = {
  dir: string;
  root: string;
  base: string;
  name: string;
  ext: string;
};

const runWasmPack = () => {
  console.log(`Running wasm-pack targeting "web"`);
  const result = child_process.spawnSync("wasm-pack", [
    "build",
    "--target",
    "web",
    "--out-name",
    "type-system",
    "--scope",
    "blockprotocol",
    "--release",
    ".",
    "-Zbuild-std=panic_abort,std",
    "-Zbuild-std-features=panic_immediate_abort",
  ]);

  if (result.error) {
    throw new Error(`Running wasm-pack failed: ${result.error}`);
  }

  if (result.status !== 0) {
    console.log(result.stdout.toString());
    console.log(result.stderr.toString());
    throw new Error("Running wasm-pack failed");
  }
};

const moveSrcFiles = (packagePath: PathObject) => {
  const destinationPath = path.resolve(packageDirPath, "wasm");

  console.log(
    `Moving src files of ${path.format(packagePath)} to ${destinationPath}`,
  );

  fs.copySync(path.format(packagePath), destinationPath, {
    overwrite: true,
    filter: (src) => {
      if (fs.statSync(src).isDirectory()) {
        return true;
      }
      // Only copy src files
      return [".js", ".d.ts", ".wasm"].some((ending) => src.endsWith(ending));
    },
  });
};

const cleanUp = (packagePath: PathObject) => {
  fs.rmSync(path.format(packagePath), { recursive: true });
};

const buildWasmPackage = () => {
  runWasmPack();

  const pkgFolderPath = path.parse(path.resolve("./pkg/"));

  moveSrcFiles(pkgFolderPath);
  cleanUp(pkgFolderPath);
};

buildWasmPackage();
