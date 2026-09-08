import { execFileSync } from "node:child_process";
// Run from repository root after rebuilding the affected packages.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const evidence = new URL(".", import.meta.url);
const brunch = "libs/@hashintel/brunch-agent";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const paths = [
  "yarn.lock",
  `${brunch}/packages/plugin-sdcpn/src/tools/canonical-schema-carrier.ts`,
  `${brunch}/packages/plugin-sdcpn/test/schema-carrier.test.ts`,
  `${brunch}/packages/plugin-sdcpn/test/carrier-feasibility.test.ts`,
  `${brunch}/packages/plugin-sdcpn/package.json`,
  `${brunch}/packages/plugin-sdcpn/vite.config.ts`,
  "apps/brunch-agent/package.json",
  "apps/brunch-agent/test/schema-carrier.test.ts",
  "apps/brunch-agent/src/evaluations/runbook/schema-carrier-probe.ts",
  "apps/brunch-agent/src/evaluations/runbook/load-built-application.ts",
  "apps/brunch-agent/src/evaluations/runbook/headless-petrinaut-client.ts",
  ...[
    "ai.ts",
    "action-schemas.ts",
    "command-schemas.ts",
    "parameter-values.ts",
    "schemas/entity-schemas.ts",
    "schemas/scenario-schema.ts",
    "validation/display-name.ts",
    "validation/entity-name.ts",
    "validation/variable-name.ts",
    "simulation/authoring/scenario/ad-hoc/ad-hoc-state-schema.ts",
  ].map((file) => `libs/@hashintel/petrinaut-core/src/${file}`),
  "node_modules/@flue/runtime/dist/schema-DIDpvZZa.mjs",
  "node_modules/@flue/runtime/dist/conversation-stream-store-CXwRWonS.mjs",
  "node_modules/@flue/runtime/dist/types-CVx9SjIx.d.mts",
  "node_modules/@valibot/to-json-schema/dist/index.mjs",
  "node_modules/valibot/dist/index.mjs",
  "node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.js",
  "node_modules/@earendil-works/pi-ai/dist/api/constrained-sampling.js",
  "node_modules/zod/v4/core/json-schema-processors.js",
];
const protectedPaths = [
  `${brunch}/MISSION.md`,
  `${brunch}/packages/plugin-sdcpn/src/tools/petrinaut-construction.ts`,
  `${brunch}/packages/plugin-sdcpn/src/flue.ts`,
  `${brunch}/packages/plugin-sdcpn/src/transition-record.ts`,
  `${brunch}/docs/evidence/implementations/fe-1573-step-a/usage-ledger.json`,
  `${brunch}/docs/evidence/implementations/fe-1573-step-a/attempt-ledger.md`,
  "apps/brunch-agent/src/agents/chat-agent/agent.ts",
];
const filesIn = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesIn(join(directory, entry.name))
      : [join(directory, entry.name)],
  );
const dependencyPaths = [
  "valibot",
  "@valibot/to-json-schema",
  "zod",
  "@flue/runtime",
  "@earendil-works/pi-ai",
  "@anthropic-ai/sdk",
  "@earendil-works/pi-ai/node_modules/@anthropic-ai/sdk",
].map((name) => `node_modules/${name}/package.json`);
const identities = {
  base: "e1b2989738",
  implementationCommit: git("rev-parse", "HEAD"),
  branch: git("branch", "--show-current"),
  node: process.version,
  toolchain: {
    yarnBeforeCacheRemoval: "4.16.0",
    fallback:
      "Invoked installed package-script executables directly after Corepack cache recreation failed with EPERM; no dependency changes",
  },
  dependencies: dependencyPaths.map((path) => {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return {
      path,
      name: data.name,
      version: data.version,
      sha256: sha256(readFileSync(path)),
    };
  }),
  sources: Object.fromEntries(
    paths.map((path) => [path, sha256(readFileSync(path))]),
  ),
  builds: Object.fromEntries(
    [
      `${brunch}/packages/plugin-sdcpn/dist`,
      "libs/@hashintel/petrinaut-core/dist",
      "apps/brunch-agent/dist",
    ]
      .flatMap(filesIn)
      .map((path) => [relative(root, path), sha256(readFileSync(path))]),
  ),
  protected: Object.fromEntries(
    protectedPaths.map((path) => {
      const before = sha256(
        execFileSync("git", ["show", `e1b2989738:${path}`]),
      );
      const after = sha256(readFileSync(path));
      if (before !== after) throw new Error(`Protected path changed: ${path}`);
      return [path, { before, after, unchanged: true }];
    }),
  ),
  env: "Copied main-worktree root .env.local to this checkout, mode 0600, ignored; contents and hashes intentionally excluded",
};
writeFileSync(
  new URL("identity-manifest.json", evidence),
  `${JSON.stringify(identities, null, 2)}\n`,
);
console.log("IDENTITIES_CAPTURED");
