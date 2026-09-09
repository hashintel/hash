import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { selectedModel, sha256 } from "./preflight.ts";

const roots = [
  "apps/brunch-agent/src",
  "apps/brunch-agent/test",
  "apps/brunch-agent/dist",
  "apps/petrinaut-website/src",
  "apps/petrinaut-website/dist",
  "libs/@hashintel/brunch-agent/packages",
  "libs/@hashintel/petrinaut-core/src",
  "libs/@hashintel/petrinaut/src",
  "node_modules/@earendil-works/pi-ai/dist",
  "node_modules/@earendil-works/pi-agent-core/dist",
  "node_modules/@flue/runtime/dist",
  "node_modules/@flue/sdk/dist",
  "node_modules/@earendil-works/pi-ai/node_modules/@anthropic-ai/sdk",
];
const files = (path: string): string[] =>
  statSync(path).isDirectory()
    ? readdirSync(path)
        .sort()
        .flatMap((name) => files(join(path, name)))
    : [path];
export const instrumentManifest = () => {
  const paths = [
    ...roots.flatMap(files),
    process.execPath,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/sandbox-exec",
    "package.json",
    "yarn.lock",
    ".yarnrc.yml",
    ...files(".yarn/patches"),
    "apps/brunch-agent/package.json",
    "apps/brunch-agent/vite.config.ts",
    "apps/petrinaut-website/package.json",
    "apps/petrinaut-website/vite.config.ts",
    "libs/@hashintel/brunch-agent/MISSION.md",
    "libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery/loopback-only.sb",
    "libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery/deny-network.sb",
  ];
  return {
    label:
      "Synthetic-user/current-A5 real-provider instrument, not genuine Vestera",
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    runtime: process.version,
    bounds: selectedModel(),
    files: Object.fromEntries(
      [...new Set(paths)]
        .sort()
        .map((path) => [path, sha256(readFileSync(path))]),
    ),
    participants: [
      "Built production ChatAgent only; pre-authored user; deterministic unscored evaluation",
    ],
    network:
      "Build/dry process-tree denial; paid OS TCP-443-only plus application exact endpoint and TLS to owner-approved pinned IP; Chrome narrower loopback-only sandbox. macOS rejects numeric/hostname destination filters. Parent must explicitly accept the layered boundary; no OS destination-filtering claim.",
  };
};
export const verifyManifest = (path: string, expectedHash: string) => {
  const bytes = readFileSync(path);
  if (sha256(bytes) !== expectedHash)
    throw new Error("Reviewed manifest hash differs");
  const manifest = JSON.parse(bytes.toString()) as ReturnType<
    typeof instrumentManifest
  >;
  for (const [file, digest] of Object.entries(manifest.files)) {
    if (sha256(readFileSync(file)) !== digest)
      throw new Error(`Frozen instrument changed: ${file}`);
  }
  if (JSON.stringify(manifest.bounds) !== JSON.stringify(selectedModel()))
    throw new Error("Model catalogue changed");
  return manifest;
};
