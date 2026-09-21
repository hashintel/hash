import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { writeProofArtifacts } from "../persona/proof-artifacts.ts";
import { deriveComparison } from "./summary.ts";

import type { BrowserArmResult } from "./browser-run.ts";
import type { MatchedParityConfiguration } from "./configuration.ts";
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
  readonly arm: "stock" | "brunch";
  readonly scenarioId: string;
}

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
  stock: BrowserArmResult,
  brunch: BrowserArmResult,
  execution: {
    readonly stock: ArmExecutionAction;
    readonly brunch: ArmExecutionAction;
  },
) => {
  const comparison = {
    ...deriveComparison(stock.artifact, brunch.artifact),
    execution,
  };
  await atomicWrite(join(directory, "comparison.json"), json(comparison));
  await atomicWrite(
    join(directory, "comparison.md"),
    [
      `# ${comparison.scenario.label}`,
      "",
      "Mechanical checks only; inspect both raw transcripts and documents for quality.",
      "",
      `Execution: Stock ${execution.stock}; Brunch ${execution.brunch}.`,
      "",
      "| Arm | Elapsed ms | Model steps | Tool calls | Places | Transitions | Scenarios | Metrics | Complete |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
      ...([comparison.stock, comparison.brunch] as const).map(
        (summary) =>
          `| ${summary.arm} | ${summary.elapsedMs} | ${summary.modelStepCount ?? "unknown"} | ${summary.toolCallCount} | ${summary.placeCount} | ${summary.transitionCount} | ${summary.scenarioCount} | ${summary.metricCount} | ${summary.mechanicallyComplete ? "yes" : "no"} |`,
      ),
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
  await atomicWrite(
    join(outputRoot, "run.json"),
    json({
      configuration,
      scenarios,
      startedAt: metadata.startedAt,
      arms: metadata.arms,
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
