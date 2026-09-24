import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { writeProofArtifacts } from "../persona/proof-artifacts.ts";
import { matchedParityArms } from "./configuration.ts";
import { deriveComparison } from "./summary.ts";

import type {
  BrowserArmFailureReport,
  BrowserArmResult,
} from "./browser-run.ts";
import type {
  EvaluationArm,
  MatchedParityConfiguration,
} from "./configuration.ts";
import type { MatchedParityScenario } from "./scenarios.ts";

const atomicWrite = async (path: string, content: string) => {
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.tmp`,
  );
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
};

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export type ArmExecutionAction = "executed" | "reused";
export interface ArmExecutionRecord {
  readonly action: ArmExecutionAction;
  readonly arm: EvaluationArm;
  readonly mode: EvaluationArm;
  readonly observedSpendUsd: number | null;
  readonly scenarioId: string;
}

/**
 * A failed arm is never a completed artifact; its diagnosis lives beside where
 * the artifact would have been. Resume ignores it because `artifact.json` is
 * absent.
 */
export const writeArmFailure = async (
  directory: string,
  report: BrowserArmFailureReport,
) => {
  await mkdir(directory, { recursive: true });
  await atomicWrite(join(directory, "failure.json"), json(report));
  return join(directory, "failure.json");
};

export const writeArmArtifacts = async (
  directory: string,
  result: BrowserArmResult,
) => {
  await mkdir(directory, { recursive: true });
  await Promise.all([
    atomicWrite(join(directory, "artifact.json"), json(result.artifact)),
    atomicWrite(join(directory, "document.json"), json(result.rawDocument)),
    atomicWrite(
      join(directory, "diagnostics.json"),
      json(result.artifact.diagnostics),
    ),
    atomicWrite(
      join(directory, "raw-transcript.json"),
      json(result.rawTranscript),
    ),
    atomicWrite(
      join(directory, "transcript.txt"),
      `${result.transcriptText.trimEnd()}\n`,
    ),
  ]);
  if (result.flueSnapshot !== undefined)
    await writeProofArtifacts(
      join(directory, "canonical-flue"),
      result.flueSnapshot,
    );
};

export const writeScenarioComparison = async (
  directory: string,
  results: Readonly<Record<EvaluationArm, BrowserArmResult>>,
  execution: Readonly<Record<EvaluationArm, ArmExecutionAction>>,
) => {
  const artifacts = Object.fromEntries(
    matchedParityArms.map((arm) => [arm, results[arm].artifact]),
  ) as Record<EvaluationArm, BrowserArmResult["artifact"]>;
  const comparison = {
    ...deriveComparison(artifacts),
    execution,
  };
  await atomicWrite(join(directory, "comparison.json"), json(comparison));
  await atomicWrite(
    join(directory, "comparison.md"),
    [
      `# ${comparison.scenario.label}`,
      "",
      "Mechanical checks only; inspect every raw transcript and document for quality.",
      "",
      `Execution: ${matchedParityArms.map((arm) => `${arm} ${execution[arm]}`).join("; ")}.`,
      "",
      "| Arm | Elapsed ms | Model steps | Observed USD | Tool calls | Places | Transitions | Scenarios | Metrics | Complete |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
      ...matchedParityArms.map((arm) => {
        const summary = comparison.arms[arm];
        return `| ${arm} | ${summary.elapsedMs} | ${summary.modelStepCount ?? "unknown"} | ${summary.observedSpendUsd ?? "unknown"} | ${summary.toolCallCount} | ${summary.placeCount} | ${summary.transitionCount} | ${summary.scenarioCount} | ${summary.metricCount} | ${summary.mechanicallyComplete ? "yes" : "no"} |`;
      }),
      "",
      "Contrasts: S→F transport drag; F→I Brunch architecture drag. Null deltas mean provider spend was unavailable.",
      "",
    ].join("\n"),
  );
};

export const writeRunRecord = async (
  outputRoot: string,
  configuration: MatchedParityConfiguration,
  scenarios: readonly MatchedParityScenario[],
  metadata: {
    readonly arms: readonly ArmExecutionRecord[];
    readonly startedAt: string;
  },
) => {
  await mkdir(outputRoot, { recursive: true });
  const knownObservedSpendUsd = metadata.arms.reduce(
    (sum, arm) => sum + (arm.observedSpendUsd ?? 0),
    0,
  );
  const unknownSpendArmCount = metadata.arms.filter(
    ({ observedSpendUsd }) => observedSpendUsd === null,
  ).length;
  await atomicWrite(
    join(outputRoot, "run.json"),
    json({
      configuration,
      scenarios,
      startedAt: metadata.startedAt,
      arms: metadata.arms,
      spend: {
        budgetUsd: configuration.budgetUsd,
        estimatedTotalUsd: null,
        knownObservedSpendUsd,
        remainingKnownAllowanceUsd:
          configuration.budgetUsd - knownObservedSpendUsd,
        unknownSpendArmCount,
      },
    }),
  );
};

export const writeManifest = async (outputRoot: string) => {
  const walk = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    return (
      await Promise.all(
        entries.map(async (entry) => {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) return walk(path);
          if (entry.name === "manifest.json" || entry.name.endsWith(".tmp"))
            return [];
          return [path.slice(outputRoot.length + 1)];
        }),
      )
    ).flat();
  };
  const { readFile } = await import("node:fs/promises");
  const paths = (await walk(outputRoot)).sort();
  const files = await Promise.all(
    paths.map(async (path) => ({
      path,
      sha256: createHash("sha256")
        .update(await readFile(join(outputRoot, path)))
        .digest("hex"),
    })),
  );
  await atomicWrite(
    join(outputRoot, "manifest.json"),
    json({ algorithm: "sha256", files }),
  );
};
