import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { matchedParityArms } from "./configuration.ts";

import type { BrowserArmResult } from "./browser-run.ts";
import type {
  EvaluationArm,
  MatchedParityConfiguration,
} from "./configuration.ts";
import type { MatchedParityScenario } from "./scenarios.ts";
import type { MatchedParityArtifact } from "./summary.ts";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8"));

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const requiredArtifactFiles = [
  "artifact.json",
  "document.json",
  "diagnostics.json",
  "raw-transcript.json",
  "transcript.txt",
] as const;

const assertArtifactShape = (
  value: unknown,
  directory: string,
): MatchedParityArtifact => {
  if (
    !record(value) ||
    value.schemaVersion !== 2 ||
    typeof value.arm !== "string" ||
    !matchedParityArms.includes(value.arm as EvaluationArm) ||
    value.mode !== value.arm ||
    !record(value.configuration) ||
    !record(value.configuration.stock) ||
    !record(value.configuration.brunch) ||
    !record(value.configuration.arms) ||
    !record(value.scenario) ||
    !record(value.document) ||
    typeof value.document.title !== "string" ||
    !record(value.document.sdcpn) ||
    typeof value.elapsedMs !== "number" ||
    !Number.isFinite(value.elapsedMs) ||
    value.elapsedMs < 0 ||
    !record(value.spend) ||
    (value.spend.observedUsd !== null &&
      (typeof value.spend.observedUsd !== "number" ||
        !Number.isFinite(value.spend.observedUsd) ||
        value.spend.observedUsd < 0)) ||
    !Array.isArray(value.toolCalls)
  )
    throw new Error(
      `Refusing incomplete retained arm artifact at ${directory}.`,
    );
  return value as unknown as MatchedParityArtifact;
};

const assertConfigurationMatch = (
  retained: MatchedParityArtifact,
  current: MatchedParityConfiguration,
  arm: EvaluationArm,
  directory: string,
) => {
  const retainedConfiguration = retained.configuration as unknown as {
    readonly arms: Record<string, unknown>;
    readonly brunch: Record<string, unknown>;
    readonly provider: unknown;
    readonly stock: Record<string, unknown>;
  };
  if (
    retainedConfiguration.provider !== current.provider ||
    retainedConfiguration.stock.model !== current.stock.model ||
    retainedConfiguration.stock.reasoning !== current.stock.reasoning ||
    retainedConfiguration.brunch.model !== current.brunch.model ||
    retainedConfiguration.brunch.reasoning !== current.brunch.reasoning ||
    !isDeepStrictEqual(retainedConfiguration.arms[arm], current.arms[arm])
  )
    throw new Error(
      `Refusing retained arm artifact with arm/mode/provider/model/reasoning mismatch at ${directory}.`,
    );
};

/**
 * Return one proven-complete retained arm, or undefined only when no prior arm
 * directory exists. Legacy stock/brunch artifacts remain historical evidence
 * but cannot be relabeled or resumed as any S/F/I/A/B arm.
 */
export const loadCompletedArm = async (input: {
  readonly arm: EvaluationArm;
  readonly configuration: MatchedParityConfiguration;
  readonly directory: string;
  readonly resumeCompleted: boolean;
  readonly scenario: MatchedParityScenario;
}): Promise<BrowserArmResult | undefined> => {
  if (!input.resumeCompleted) return undefined;
  try {
    const directoryStat = await stat(input.directory);
    if (!directoryStat.isDirectory())
      throw new Error(
        `Refusing retained arm artifact path that is not a directory: ${input.directory}.`,
      );
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }

  let artifactValue: unknown;
  let rawDocument: unknown;
  let diagnostics: unknown;
  let rawTranscript: unknown;
  let transcriptText: string;
  try {
    [artifactValue, rawDocument, diagnostics, rawTranscript, transcriptText] =
      await Promise.all([
        readJson(join(input.directory, requiredArtifactFiles[0])),
        readJson(join(input.directory, requiredArtifactFiles[1])),
        readJson(join(input.directory, requiredArtifactFiles[2])),
        readJson(join(input.directory, requiredArtifactFiles[3])),
        readFile(join(input.directory, requiredArtifactFiles[4]), "utf8"),
      ]);
  } catch (error) {
    throw new Error(
      `Refusing incomplete retained arm artifact at ${input.directory}; all required raw artifact files must be readable.`,
      { cause: error },
    );
  }

  const artifact = assertArtifactShape(artifactValue, input.directory);
  if (artifact.arm !== input.arm || artifact.mode !== input.arm)
    throw new Error(
      `Refusing retained arm/mode mismatch at ${input.directory}: expected ${input.arm}, found ${artifact.arm}/${artifact.mode}.`,
    );
  if (!isDeepStrictEqual(artifact.scenario, input.scenario))
    throw new Error(
      `Refusing retained scenario mismatch at ${input.directory}.`,
    );
  assertConfigurationMatch(
    artifact,
    input.configuration,
    input.arm,
    input.directory,
  );
  if (
    !record(rawDocument) ||
    rawDocument.title !== artifact.document.title ||
    !isDeepStrictEqual(rawDocument.sdcpn, artifact.document.sdcpn) ||
    !isDeepStrictEqual(diagnostics, artifact.diagnostics) ||
    !transcriptText.trim()
  )
    throw new Error(
      `Refusing internally inconsistent retained arm artifact at ${input.directory}.`,
    );

  return {
    artifact,
    rawDocument,
    rawTranscript,
    transcriptText,
  };
};
