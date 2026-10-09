import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  selectGuidanceVariant,
  selfContainedGuidanceVariants,
  type GuidanceVariant,
} from "../../agents/chat-agent/guidance-variant.ts";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const app = "apps/brunch-agent/src/agents/chat-agent";
const packages = "libs/@hashintel/brunch-agent/packages";
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
const armSources = (arm: GuidanceVariant) => `${app}/guidance/${arm}`;
const isArmSource = (path: string) =>
  selfContainedGuidanceVariants.some(
    (arm) =>
      path.startsWith(`${armSources(arm)}/`) ||
      path === `${armSources(arm)}.ts`,
  );

/** Source fingerprint for reproduction and drift detection, not an inference result. */
export const guidanceManifest = async (variant: GuidanceVariant) => {
  const selfContained = selfContainedGuidanceVariants.find(
    (arm) => arm === variant,
  );
  const directories =
    variant === "baseline"
      ? [
          `${packages}/core/src/prompts`,
          `${packages}/core/src/skills/elicitation`,
          `${packages}/plugin-sdcpn/src/prompts`,
          `${packages}/plugin-sdcpn/src/skills/sdcpn-modelling`,
        ]
      : selfContained === undefined
        ? [`${app}/guidance`]
        : [armSources(selfContained)];
  const identityOnly = ["/identity-ledger.md", "/ledger-vocabulary.ts"];
  const sharedLedger = [
    `${packages}/core/src/ledger-tools.ts`,
    ...(await filesWithin(join(repoRoot, `${packages}/core/src/ledger`))).map(
      (path) => relative(repoRoot, path),
    ),
    `${packages}/plugin-sdcpn/src/ledger-profile.ts`,
  ];
  // The manual arm's Ledger lives in the plugin so the website can render it.
  const manualLedger = [
    `${packages}/plugin-sdcpn/src/ledger2.ts`,
    ...(
      await filesWithin(join(repoRoot, `${packages}/plugin-sdcpn/src/ledger2`))
    ).map((path) => relative(repoRoot, path)),
  ];
  const paths = [
    `${app}/agent.ts`,
    `${app}/guidance.ts`,
    `${app}/guidance-variant.ts`,
    ...(selfContained === undefined
      ? sharedLedger
      : [
          `${armSources(selfContained)}.ts`,
          ...(selfContained === "manual" ? manualLedger : []),
        ]),
    `${packages}/plugin-sdcpn/src/flue.ts`,
    "yarn.lock",
    ...(
      await Promise.all(
        directories.map(async (directory) =>
          (await filesWithin(join(repoRoot, directory))).map((path) =>
            relative(repoRoot, path),
          ),
        ),
      )
    )
      .flat()
      .filter(
        (path) =>
          selfContained !== undefined ||
          (!isArmSource(path) &&
            (variant === "feedback" ||
              variant === "identity" ||
              !path.endsWith("/feedback.md")) &&
            (variant === "identity" ||
              !identityOnly.some((suffix) => path.endsWith(suffix)))),
      ),
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
    variant,
    sha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    files,
  };
};

/** Old runs are baseline; new runs cannot silently resume against different guidance. */
export const verifyGuidanceResume = async (retained: unknown) => {
  if (retained === undefined) return guidanceManifest("baseline");
  if (
    typeof retained !== "object" ||
    retained === null ||
    !("variant" in retained) ||
    typeof retained.variant !== "string" ||
    !("sha256" in retained)
  )
    throw new Error("Invalid retained guidance manifest");
  const current = await guidanceManifest(
    selectGuidanceVariant(retained.variant),
  );
  if (current.sha256 !== retained.sha256)
    throw new Error(
      "Guidance changed since this run; restore its sources before resuming, or start a fresh run.",
    );
  return current;
};
