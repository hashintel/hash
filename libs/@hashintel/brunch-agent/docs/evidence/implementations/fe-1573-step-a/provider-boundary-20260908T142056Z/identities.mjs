// Run from repository root; read-only inputs, one curated local evidence output.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const base = "550abe7dc76110c1fe5de240821f477c50d8d645";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const protectedPaths = [
  "yarn.lock",
  "apps/brunch-agent/package.json",
  "apps/brunch-agent/src/app.ts",
  "apps/brunch-agent/src/provider-admission.ts",
  "apps/brunch-agent/src/agents/chat-agent/agent.ts",
  "libs/@hashintel/brunch-agent/MISSION.md",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/flue.ts",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/tools/canonical-schema-carrier.ts",
  "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/tools/petrinaut-construction.ts",
  "libs/@hashintel/petrinaut-core/src/ai.ts",
  "libs/@hashintel/petrinaut-core/src/action-schemas.ts",
  "libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/usage-ledger.json",
  "libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/attempt-ledger.md",
];
const protectedSources = Object.fromEntries(
  protectedPaths.map((path) => {
    const content = readFileSync(path);
    assert.deepEqual(
      content,
      execFileSync("git", ["show", `${base}:${path}`], {
        maxBuffer: content.length + 1024,
      }),
    );
    return [path, { sha256: sha256(content), unchangedFromBase: true }];
  }),
);
const packages = Object.fromEntries(
  [
    "@earendil-works/pi-ai",
    "@earendil-works/pi-agent-core",
    "@flue/runtime",
    "@valibot/to-json-schema",
    "valibot",
    "zod",
    "@anthropic-ai/sdk",
    "@earendil-works/pi-ai/node_modules/@anthropic-ai/sdk",
  ].map((path) => {
    const content = readFileSync(`node_modules/${path}/package.json`);
    const json = JSON.parse(content);
    return [
      path,
      {
        name: json.name,
        version: json.version,
        packageJsonSha256: sha256(content),
      },
    ];
  }),
);
const installedSources = Object.fromEntries(
  [
    "@earendil-works/pi-ai/README.md",
    "@earendil-works/pi-ai/dist/providers/anthropic.js",
    "@earendil-works/pi-ai/dist/providers/data/anthropic.json",
    "@earendil-works/pi-ai/dist/api/anthropic-messages.js",
    "@earendil-works/pi-ai/dist/api/constrained-sampling.js",
    "@earendil-works/pi-ai/dist/models.js",
    "@earendil-works/pi-ai/dist/utils/event-stream.js",
    "@earendil-works/pi-ai/dist/utils/provider-retry.js",
    "@earendil-works/pi-ai/node_modules/@anthropic-ai/sdk/resources/messages/messages.mjs",
    "@earendil-works/pi-ai/node_modules/@anthropic-ai/sdk/internal/request-options.mjs",
    "@earendil-works/pi-agent-core/dist/agent.js",
    "@flue/runtime/dist/schema-DIDpvZZa.mjs",
    "@flue/runtime/dist/conversation-stream-store-CXwRWonS.mjs",
    "@flue/runtime/dist/dispatch-nU3cIlT-.mjs",
    "@flue/runtime/docs/guide/observability.md",
    "@flue/runtime/docs/reference/events.md",
  ].map((path) => [path, sha256(readFileSync(`node_modules/${path}`))]),
);
writeFileSync(
  new URL("identities.json", import.meta.url),
  `${JSON.stringify(
    {
      base,
      node: process.version,
      packages,
      protectedSources,
      installedSources,
      scope:
        "Evidence-only, zero paid usage. No production source, policy, dependency version, or ledger edits.",
    },
    null,
    2,
  )}\n`,
);
console.log("Protected source equality and installed identities captured");
