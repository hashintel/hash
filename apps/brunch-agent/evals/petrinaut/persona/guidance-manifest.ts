import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const agent = "apps/brunch-agent/src/agents/petrinaut";
const library = "libs/@hashintel/brunch-agent";
const filesWithin = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        // Local-only scratch (gitignored `**/_scratch/`) must not move the fingerprint.
        if (entry.isDirectory())
          return entry.name === "_scratch"
            ? []
            : filesWithin(join(directory, entry.name));
        return [join(directory, entry.name)];
      }),
    )
  ).flat();
};

/** Source fingerprint for reproduction and drift detection, not an inference result. */
export const guidanceManifest = async () => {
  const directories = [
    `${agent}/prompts`,
    `${agent}/skills`,
    `${agent}/tools`,
    // The Ledger lives in the library so the website can render it.
    `${library}/src/ledger`,
  ];
  const paths = [
    `${agent}/agent.ts`,
    `${agent}/guidance.ts`,
    `${agent}/interview-budget-instruction.ts`,
    `${library}/src/ledger.ts`,
    "apps/brunch-agent/src/shared/petrinaut-tools.ts",
    "yarn.lock",
    ...(
      await Promise.all(
        directories.map(async (directory) =>
          (await filesWithin(join(repoRoot, directory))).map((path) =>
            relative(repoRoot, path),
          ),
        ),
      )
    ).flat(),
  ];
  const files = await Promise.all(
    paths.sort().map(async (path) => ({
      path,
      sha256: createHash("sha256")
        .update(await readFile(join(repoRoot, path)))
        .digest("hex"),
    })),
  );
  return {
    sha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    files,
  };
};

/** A run cannot silently resume against different guidance. */
export const verifyGuidanceResume = async (retained: unknown) => {
  if (
    typeof retained !== "object" ||
    retained === null ||
    !("sha256" in retained)
  )
    throw new Error("This run has no guidance manifest; start a fresh run.");
  const current = await guidanceManifest();
  if (current.sha256 !== retained.sha256)
    throw new Error(
      "Guidance changed since this run; restore its sources before resuming, or start a fresh run.",
    );
  return current;
};
