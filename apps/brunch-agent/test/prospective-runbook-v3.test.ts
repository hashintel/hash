import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

const testDirectory = import.meta.dirname;
const repositoryRoot = join(testDirectory, "../../..");
const runnerPath = join(
  testDirectory,
  "../src/evaluations/runbook/prospective-runbook-v3-run.ts",
);
const modelKeyName = ["ANTHROPIC", "API", "KEY"].join("_");

test("the hermetic v3 runner freezes the architecture-only comparison target", async () => {
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "brunch-architecture-v3-"),
  );
  try {
    const { exitCode, stdout, stderr } = await runNodeScript(
      runnerPath,
      repositoryRoot,
      {
        [modelKeyName]: "",
        BRUNCH_CHAT_MODEL: "claude-haiku-4-5",
        BRUNCH_RUNBOOK_EXPERT_MODEL: "faux-vestera-expert",
        BRUNCH_RUNBOOK_HARD_STOP: "2",
        BRUNCH_RUNBOOK_REPLICATION: "1",
        BRUNCH_RUNBOOK_OUTPUT_DIR: outputDirectory,
        BRUNCH_RUNBOOK_ALLOW_DIRTY_INSTRUMENT: "1",
        BRUNCH_RUNBOOK_ANTHROPIC_MODULE: join(
          testDirectory,
          "runbook-elicitation-faux-expert.ts",
        ),
        BRUNCH_RUNBOOK_INTERVIEWER_PROVIDER_MODULE: join(
          testDirectory,
          "runbook-elicitation-faux-provider.ts",
        ),
      },
    );

    expect(exitCode, stderr || stdout).toBe(0);
    const resultLine = stdout
      .split("\n")
      .find((line) => line.startsWith("PROSPECTIVE_RUNBOOK_V3_RESULT "));
    expect(resultLine).toBeDefined();
    const result = JSON.parse(
      resultLine!.slice("PROSPECTIVE_RUNBOOK_V3_RESULT ".length),
    ) as {
      outputNamespaceId: string;
      protocolId: string;
    };
    expect(result).toMatchObject({
      protocolId: "prospective-runbook-v3",
      outputNamespaceId: "vestera-architecture-candidate-v3",
    });

    const recordName = (await readdir(outputDirectory)).find((name) =>
      name.endsWith(".json"),
    );
    const record = JSON.parse(
      await readFile(join(outputDirectory, recordName!), "utf8"),
    ) as {
      comparisonTarget: {
        memberRunIds: string[];
        outputNamespaceId: string;
        qualityPopulation: string;
        runtimeAccounting: string;
      };
      instrument: {
        fileSha256: Record<string, string>;
      };
    };
    expect(record.comparisonTarget).toEqual({
      protocolId: "prospective-runbook-v1",
      outputNamespaceId: "vestera-prospective-baseline-v1",
      memberRunIds: [
        "runbook-elicitation-2026-08-31T10-50-28-709Z-20a4817f",
        "runbook-elicitation-2026-08-31T10-56-34-754Z-4b75737c",
      ],
      qualityPopulation: "valid-workpieces",
      runtimeAccounting: "reported-separately",
    });
    for (const runId of record.comparisonTarget.memberRunIds) {
      expect(record.instrument.fileSha256).toHaveProperty(
        `libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-prospective-baseline-v1/${runId}.ir.md`,
      );
      expect(record.instrument.fileSha256).toHaveProperty(
        `libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-prospective-baseline-v1/${runId}.omniscient.md`,
      );
      expect(record.instrument.fileSha256).toHaveProperty(
        `libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-prospective-baseline-v1/${runId}.cold.md`,
      );
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
