// Hermetic experiment: copy installed packages, verify pins, edit copies only.
// Run from repo root: node <this-file> [baseline|flue-only|two-boundary|candidate]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const evidence = fileURLToPath(new URL(".", import.meta.url));
const mode = process.argv[2] ?? "candidate";
assert(["baseline", "flue-only", "two-boundary", "candidate"].includes(mode));
const edits = JSON.parse(
  readFileSync(new URL("candidate-edits.json", import.meta.url)),
);
const pins = JSON.parse(
  readFileSync(new URL("installed-inputs.json", import.meta.url)),
);
const hash = (data) => createHash("sha256").update(data).digest("hex");
const verify = () => {
  for (const [path, expected] of Object.entries(pins.files))
    assert.equal(hash(readFileSync(join(root, path))), expected, path);
};
verify();
const scratch = mkdtempSync(join(root, ".native-schema-probe-"));
try {
  for (const name of [
    "@flue/runtime",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-agent-core",
  ]) {
    const target = join(scratch, "node_modules", name);
    mkdirSync(join(target, ".."), { recursive: true });
    cpSync(join(root, "node_modules", name), target, { recursive: true });
  }
  // The new public declaration imports only installed Standard spec types.
  // This does not alter a package manifest or resolve/download a dependency.
  const applied = [];
  for (const file of edits) {
    if (
      mode === "baseline" ||
      (mode !== "candidate" && file.stage === "ownership") ||
      (mode === "flue-only" && !file.path.startsWith("@flue/"))
    )
      continue;
    const path = join(scratch, "node_modules", file.path);
    let content = readFileSync(path, "utf8");
    for (const edit of file.edits) {
      assert.equal(
        content.split(edit.old).length - 1,
        edit.count ?? 1,
        `Exact match: ${file.path}`,
      );
      content = content.replaceAll(edit.old, edit.new);
    }
    writeFileSync(path, content);
    applied.push({ path: file.path, sha256: hash(content) });
  }
  if (mode === "candidate") {
    let patch = "";
    for (const path of new Set(applied.map((entry) => entry.path))) {
      try {
        execFileSync(
          "diff",
          [
            "-U0",
            "-L",
            `a/${path}`,
            "-L",
            `b/${path}`,
            join(root, "node_modules", path),
            join(scratch, "node_modules", path),
          ],
          { encoding: "utf8" },
        );
      } catch (error) {
        assert.equal(error.status, 1);
        patch += error.stdout;
      }
    }
    writeFileSync(join(evidence, "candidate.patch"), patch);
  }
  for (const file of ["probe.mjs", "type-contract.ts", "tsconfig.json"])
    cpSync(join(evidence, file), join(scratch, file));
  writeFileSync(
    join(scratch, "context.json"),
    JSON.stringify({ root, evidence, mode, applied }),
  );
  execFileSync(
    process.execPath,
    ["--experimental-strip-types", join(scratch, "probe.mjs")],
    { cwd: scratch, stdio: "inherit", timeout: 60000 },
  );
  if (mode === "candidate") {
    execFileSync(
      join(root, "node_modules/.bin/tsgo"),
      ["--project", join(scratch, "tsconfig.json")],
      { cwd: scratch, stdio: "inherit" },
    );
    execFileSync(
      join(root, "node_modules/.bin/oxlint"),
      [
        "--type-aware",
        "--type-check",
        "--tsconfig",
        join(scratch, "tsconfig.json"),
        join(scratch, "type-contract.ts"),
      ],
      { cwd: scratch, stdio: "inherit" },
    );
    mkdirSync(join(scratch, "test"));
    mkdirSync(join(scratch, "src"));
    cpSync(
      join(root, "apps/brunch-agent/test/provider-admission.test.ts"),
      join(scratch, "test/provider-admission.test.ts"),
    );
    cpSync(
      join(root, "apps/brunch-agent/src/provider-admission.ts"),
      join(scratch, "src/provider-admission.ts"),
    );
    writeFileSync(
      join(scratch, "vitest.config.mjs"),
      "export default { test: { include: ['test/**/*.test.ts'] } };\n",
    );
    execFileSync(
      join(root, "node_modules/.bin/vitest"),
      [
        "run",
        "--root",
        scratch,
        "--config",
        join(scratch, "vitest.config.mjs"),
      ],
      { cwd: scratch, stdio: "inherit", timeout: 60000 },
    );
  }
} finally {
  verify();
  rmSync(scratch, { recursive: true, force: true });
}
