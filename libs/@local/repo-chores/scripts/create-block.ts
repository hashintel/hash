import path from "node:path";

import { JsonObject } from "@blockprotocol/core";
import execa from "execa";
import fs from "fs-extra";

import { monorepoRootDirPath } from "./shared/monorepo";

const script = async () => {
  const args = process.argv.slice(2);

  const blockName = args[0];

  if (!blockName) {
    console.log(
      "Please provide a block name as the first argument, e.g. yarn create-block my-block",
    );
    process.exit();
  }

  const blocksFolder = path.join(monorepoRootDirPath, "blocks");

  console.log("************ Creating block ************");

  await execa("npx", ["create-block-app@latest", ...args], {
    cwd: path.join(monorepoRootDirPath, "blocks"),
    stdout: "inherit",
  });

  console.log("********* Configuring for repo *********");
  const newBlockFolder = path.join(blocksFolder, blockName);

  const packageJsonPath = path.join(newBlockFolder, "package.json");

  const packageJsonString = fs.readFileSync(packageJsonPath, "utf-8");

  const packageJson = JSON.parse(packageJsonString) as JsonObject;

  packageJson.name = `@blocks/${blockName}`;
  packageJson.license = "(MIT OR Apache-2.0)";
  packageJson.author = "HASH";
  packageJson.repository = {
    type: "git",
    url: "https://github.com/hashintel/hash.git#main",
    directory: `blocks/${blockName}`,
  };

  (packageJson.blockprotocol as JsonObject).displayName =
    `${blockName[0]!.toUpperCase()}${blockName.slice(1)}`;
  (packageJson.blockprotocol as JsonObject).name = `@hash/${blockName}`;

  (packageJson.scripts as JsonObject)["fix:eslint"] = "eslint --fix .";
  (packageJson.scripts as JsonObject)["lint:eslint"] =
    "eslint --report-unused-disable-directives .";
  (packageJson.scripts as JsonObject).format =
    "prettier --write --ignore-unknown src/types/generated/*.ts";

  (packageJson.devDependencies as JsonObject)["@local/eslint-config"] =
    "0.0.0-private";

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

  for (const file of fs.readdirSync(
    path.join(__dirname, "create-block", "additional-block-files"),
  )) {
    fs.copyFileSync(
      path.join(__dirname, "create-block", "additional-block-files", file),
      path.join(newBlockFolder, file),
    );
  }

  for (const file of fs.readdirSync(
    path.join(__dirname, "create-block", "replacement-block-files"),
  )) {
    fs.copyFileSync(
      path.join(__dirname, "create-block", "replacement-block-files", file),
      path.join(newBlockFolder, file),
    );
  }

  const indexFile = path.join(newBlockFolder, "src", "index.ts");
  fs.writeFileSync(
    indexFile,
    `/* eslint-disable canonical/filename-no-index */\n${fs
      .readFileSync(indexFile)
      .toString()}`,
  );

  fs.rmSync(path.join(newBlockFolder, ".gitignore"));
};

void (async () => {
  await script();
})();
