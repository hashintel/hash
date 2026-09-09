// Read-only verification of the existing driver's final manifest and retained bytes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const directory = dirname(fileURLToPath(import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const { verifyManifest } = await import(
  pathToFileURL(
    resolve("apps/brunch-agent/src/evaluations/real-provider-a5/manifest.ts"),
  )
);
const { petrinautAiTools } = await import("@hashintel/petrinaut-core/ai");
const path = resolve(directory, "final-freeze/manifest.json");
const preflight = JSON.parse(
  readFileSync(resolve(directory, "final-freeze/preflight.json")),
);
const manifest = verifyManifest(path, preflight.manifestSha256);
assert.equal(manifest.commit, "3f86c1461c2654b80b5eca0e7b5e65580146a9e0");
assert.equal(Object.keys(petrinautAiTools).length, 46);
assert.equal(manifest.bounds.model.id, "claude-sonnet-4-6");
assert.equal(manifest.bounds.maxOutputTokens, 4096);
assert.equal(manifest.bounds.reservedUsd, 7);
assert.equal(manifest.bounds.worstUsd, 6.06144);
assert.equal(preflight.credentialsAvailable, true);
const originals = JSON.parse(
  readFileSync(resolve(directory, "original-observation-pins.json")),
);
for (const pin of Object.values(originals)) {
  const original = readFileSync(pin.original);
  const archived = readFileSync(resolve(directory, pin.retained));
  const raw = pin.retained.endsWith(".gz") ? gunzipSync(archived) : archived;
  assert.equal(digest(original), pin.sha256);
  assert.equal(digest(raw), pin.sha256);
}
const ledgers = JSON.parse(
  readFileSync(resolve(directory, "cloned-ledger-unchanged.json")),
);
for (const [file, pin] of Object.entries(ledgers))
  assert.equal(digest(readFileSync(file)), pin.sha256);
const frozenBuildFiles = Object.keys(manifest.files).filter(
  (file) =>
    file.startsWith("apps/brunch-agent/dist/") ||
    file.startsWith("apps/petrinaut-website/dist/"),
);
assert(
  frozenBuildFiles.some((file) =>
    file.startsWith("apps/brunch-agent/dist/client/"),
  ),
);
const collect = (folder) =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? collect(resolve(folder, entry.name))
      : [resolve(folder, entry.name)],
  );
const retainedFiles = collect(directory).filter((file) =>
  file.includes("/observations/"),
);
console.log(
  JSON.stringify(
    {
      passed: true,
      manifestPath: path,
      manifestSha256: preflight.manifestSha256,
      pinnedFiles: Object.keys(manifest.files).length,
      pinnedAppAndWebsiteBuildFiles: frozenBuildFiles.length,
      canonicalRegistryNames: Object.keys(petrinautAiTools).length,
      originalAndArchivedFilesVerified: Object.keys(originals).length,
      retainedFiles: retainedFiles.length,
      clonedLedgersUnchanged: true,
      credentialAvailability: preflight.credentialsAvailable,
      credentialValidity: "Not probed",
      paidActivation: "Not active",
    },
    null,
    2,
  ),
);
