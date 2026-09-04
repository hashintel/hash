import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = join(import.meta.dirname, "../../..");
const brunchRoot = join(repositoryRoot, "libs/@hashintel/brunch-agent");
const archivePath = join(
  brunchRoot,
  "docs/archive/evaluations/flue-skill-composition-side-quest-runs.tar.gz",
);
const archiveSha256 =
  "99d5302fb42807b9e9d77d4c432f4b52b77aeea4f7312cd6fb8f104452e3fc2a";
const campaigns = [
  "flue-skill-composition-side-quest-v1",
  "flue-skill-composition-side-quest-v2",
  "flue-skill-composition-side-quest-v3",
] as const;

test("the retired side-quest runs recover without a historical Git ref", async () => {
  const recoveryDirectory = await mkdtemp(
    join(tmpdir(), "brunch-retired-runs-"),
  );
  try {
    expect(
      createHash("sha256")
        .update(await readFile(archivePath))
        .digest("hex"),
    ).toBe(archiveSha256);
    await execFileAsync("tar", ["-xzf", archivePath, "-C", recoveryDirectory], {
      cwd: repositoryRoot,
    });

    const entries = (
      await Promise.all(
        campaigns.map(async (campaign) => {
          const ledger = await readFile(
            join(
              brunchRoot,
              `docs/evidence/evaluations/${campaign}/retired-runs.sha256`,
            ),
            "utf8",
          );
          return ledger
            .trim()
            .split("\n")
            .map((line) => {
              const separator = line.indexOf("  ");
              if (separator === -1) {
                throw new Error(`Malformed retired-run ledger entry: ${line}`);
              }
              return {
                expectedHash: line.slice(0, separator),
                path: line.slice(separator + 2),
              };
            });
        }),
      )
    ).flat();

    expect(entries).toHaveLength(47);
    await Promise.all(
      entries.map(async ({ expectedHash, path }) => {
        const recovered = await readFile(join(recoveryDirectory, path));
        expect(createHash("sha256").update(recovered).digest("hex")).toBe(
          expectedHash,
        );
      }),
    );
  } finally {
    await rm(recoveryDirectory, { recursive: true, force: true });
  }
});
