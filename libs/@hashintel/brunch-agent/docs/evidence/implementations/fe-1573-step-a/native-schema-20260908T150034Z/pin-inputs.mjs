import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const edits = JSON.parse(
  readFileSync(new URL("candidate-edits.json", import.meta.url)),
);
const packages = [
  "@flue/runtime",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@standard-schema/spec",
  "@hashintel/petrinaut-core",
  "@hashintel/brunch-agent",
  "zod",
  "valibot",
  "@valibot/to-json-schema",
  "@earendil-works/pi-ai/node_modules/@anthropic-ai/sdk",
];
const paths = [
  ...edits.map((file) => `node_modules/${file.path}`),
  ...packages.map((name) => `node_modules/${name}/package.json`),
  "node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js",
  "node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js.map",
  "node_modules/@earendil-works/pi-agent-core/dist/types.js.map",
  "node_modules/@earendil-works/pi-ai/dist/utils/validation.js",
  "node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.js.map",
  "node_modules/@flue/runtime/dist/node/index.mjs",
  "node_modules/@flue/runtime/dist/tool-NmMNtPCM.d.mts",
  "node_modules/@flue/runtime/docs/guide/tools.md",
  "node_modules/@flue/runtime/docs/reference/agent-api.md",
  "node_modules/zod/v4/core/to-json-schema.js",
  "node_modules/@standard-schema/spec/dist/index.d.ts",
  "apps/brunch-agent/src/provider-admission.ts",
  "apps/brunch-agent/src/app.ts",
  "libs/@hashintel/petrinaut-core/src/action-schemas.ts",
  "libs/@hashintel/petrinaut-core/src/ai.ts",
  "libs/@hashintel/petrinaut-core/dist/ai.js",
  "libs/@hashintel/brunch-agent/packages/core/dist/client-tools.js",
  "libs/@hashintel/petrinaut-core/src/schemas/entity-schemas.ts",
  "libs/@hashintel/brunch-agent/packages/core/src/client-tools.ts",
  "apps/brunch-agent/test/provider-admission.test.ts",
  "libs/@hashintel/brunch-agent/MISSION.md",
  "libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/usage-ledger.json",
  "libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/attempt-ledger.md",
  "yarn.lock",
];
writeFileSync(
  new URL("installed-inputs.json", import.meta.url),
  `${JSON.stringify(
    {
      node: process.version,
      authority:
        "2aabffbd27fa3f01913f40ab4bc45074ba50971a (local cherry-pick 6c599c87fc)",
      packages: Object.fromEntries(
        packages.map((name) => [
          name,
          JSON.parse(readFileSync(`node_modules/${name}/package.json`)).version,
        ]),
      ),
      files: Object.fromEntries(
        paths.map((path) => [
          path,
          createHash("sha256").update(readFileSync(path)).digest("hex"),
        ]),
      ),
    },
    null,
    2,
  )}\n`,
);
