import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = "113c8ada6f9a74d097bfbeb1b944db8c39223759";
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const protectedPaths = [
  "libs/@hashintel/brunch-agent/MISSION.md",
  "libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/usage-ledger.json",
  "libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/attempt-ledger.md",
  "libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/provider-boundary-20260908T142056Z/handoff.md",
  "libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/provider-boundary-20260908T142056Z/usage.test.ts",
  "libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/provider-boundary-20260908T142056Z/usage.json",
  "apps/brunch-agent/src/evaluations/runbook/schema-carrier-probe.ts",
  "apps/brunch-agent/src/provider-admission.ts",
  "apps/brunch-agent/src/agents/chat-agent/agent.ts",
  "apps/brunch-agent/src/conversation/root-arc.ts",
  "apps/brunch-agent/test/workpiece-revisions.test.ts",
  "apps/brunch-agent/test/workpiece-revisions.integration.ts",
  "apps/brunch-agent/test/architecture/boundaries.integration.ts",
  "apps/brunch-agent/package.json",
  "package.json",
  "yarn.lock",
];
const protectedFiles = Object.fromEntries(
  protectedPaths.map((path) => {
    const current = readFileSync(join(root, path));
    const previous = execFileSync("git", ["show", `${base}:${path}`], {
      cwd: root,
      maxBuffer: current.length + 1024 * 1024,
    });
    assert(
      current.equals(previous),
      `${path} changed from protected integration base`,
    );
    return [path, { sha256: hash(current), unchangedFromBase: true }];
  }),
);
const sourcePaths = [
  "apps/brunch-agent/src/app.ts",
  "apps/brunch-agent/src/provider-accounting.ts",
  "apps/brunch-agent/src/provider-accounting/request-ledger.ts",
  "apps/brunch-agent/test/provider-accounting.test.ts",
  "apps/brunch-agent/test/provider-accounting.integration.ts",
  "node_modules/@flue/runtime/dist/conversation-stream-store-CXwRWonS.mjs",
  "node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.js",
  "node_modules/@earendil-works/pi-ai/dist/models.js",
  "node_modules/@earendil-works/pi-agent-core/dist/agent.js",
];
const sourceFiles = Object.fromEntries(
  sourcePaths.map((path) => [path, hash(readFileSync(join(root, path)))]),
);
const packages = Object.fromEntries(
  [
    "@flue/runtime",
    "@flue/sdk",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-agent-core",
    "valibot",
  ].map((name) => [
    name,
    JSON.parse(
      readFileSync(join(root, "node_modules", name, "package.json"), "utf8"),
    ).version,
  ]),
);
writeFileSync(
  new URL("identities.json", import.meta.url),
  `${JSON.stringify({ base, node: process.version, packages, protectedFiles, sourceFiles }, null, 2)}\n`,
);
process.stdout.write(
  "Accounting source and protected ledger identities verified.\n",
);
