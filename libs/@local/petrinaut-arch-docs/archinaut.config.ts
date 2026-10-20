/**
 * The Petrinaut instance of archinaut. Packages, rules and ignore patterns are
 * the ones `architecture.config.ts` already holds, so the two generators read
 * one list while they coexist.
 */

import { fileURLToPath } from "node:url";

import { defineConfig, resolveSourceUrlPrefix } from "@local/archinaut";

import { config } from "./architecture.config";

export default defineConfig({
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  packages: config.packages,
  rules: config.rules,
  ignoredDirectories: config.ignoredDirectories,
  ignoredFilePattern: config.ignoredFilePattern,
  contentDirectory: "libs/@local/petrinaut-arch-docs/content",
  outputDirectory: "libs/@local/petrinaut-arch-docs/bundle",
  cacheDirectory: "node_modules/.cache/archinaut",
  sourceUrlPrefix: resolveSourceUrlPrefix(process.env),
  site: {
    title: "Docs",
    description:
      "How the Petrinaut packages fit together — generated from annotations in the source.",
    url: "https://docs.petrinaut.org",
    logo: "libs/@local/petrinaut-arch-docs/assets/petrinaut-helmet.png",
    favicon: "libs/@local/petrinaut-arch-docs/assets/favicon.ico",
  },
});
