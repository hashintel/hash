import * as envalid from "envalid";
import RegexParser from "regex-parser";

import { getWorkspaceInfoLookup } from "./shared/monorepo";

const script = async () => {
  const env = envalid.cleanEnv(process.env, {
    BLOCK_DIR_NAME_FILTER: envalid.str({
      desc: "Regex to filter block dir names",
      default: "",
    }),
    OUTPUT_FORMAT: envalid.str({
      choices: ["raw", "json"],
      default: "raw",
    }),
  });

  const blockDirNameFilterRegex = env.BLOCK_DIR_NAME_FILTER
    ? RegexParser(env.BLOCK_DIR_NAME_FILTER)
    : undefined;

  const outputFormat = env.OUTPUT_FORMAT;

  if (outputFormat === "raw") {
    console.log("Listing block dir names...");
  }

  const yarnWorkspaceInfoLookup = await getWorkspaceInfoLookup();

  const blockDirNames = Object.entries(yarnWorkspaceInfoLookup)
    .map(([, { location }]) => location)
    .filter((location) => location.startsWith("blocks"))
    .map((location) => location.slice(7));

  const filteredBlockDirNames = blockDirNames.filter((blockDirName) =>
    blockDirNameFilterRegex
      ? blockDirName.match(blockDirNameFilterRegex)
      : true,
  );

  if (outputFormat === "raw") {
    for (const blockDirName of blockDirNames) {
      console.log(
        filteredBlockDirNames.includes(blockDirName)
          ? `✅ ${blockDirName}`
          : `❌ ${blockDirName}`,
      );
    }

    console.log(
      `Total number of blocks: ${blockDirNames.length}${
        blockDirNameFilterRegex
          ? `, filtered: ${filteredBlockDirNames.length}`
          : ""
      }`,
    );
  }

  if (outputFormat === "json") {
    console.log(JSON.stringify(filteredBlockDirNames));
  }
};

void (async () => {
  await script();
})();
