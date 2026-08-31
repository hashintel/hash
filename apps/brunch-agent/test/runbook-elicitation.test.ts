import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

const testDirectory = import.meta.dirname;
const runnerPath = join(
  testDirectory,
  "../src/evaluations/runbook/elicitation-run.ts",
);
const repositoryRoot = join(testDirectory, "../../..");
const MODEL_KEY_NAME = ["ANTHROPIC", "API", "KEY"].join("_");

test("relocated source cannot write into the frozen v1 campaign", async () => {
  const { exitCode, stderr } = await runNodeScript(runnerPath, repositoryRoot, {
    [MODEL_KEY_NAME]: "not-used-before-source-guard",
    BRUNCH_CHAT_MODEL: "claude-sonnet-4-5",
    BRUNCH_RUNBOOK_EXPERT_MODEL: "claude-sonnet-4-5",
    BRUNCH_RUNBOOK_HARD_STOP: "8",
    BRUNCH_RUNBOOK_LATENCY_STOP_MS: "180000",
  });

  expect(exitCode).not.toBe(0);
  expect(stderr).toContain(
    "vestera-prospective-baseline-v1 belongs to source commit",
  );
});

test("the prospective runner records a recoverable IR without construction or capture machinery", async () => {
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "brunch-runbook-elicitation-"),
  );
  try {
    const { exitCode, stdout, stderr } = await runNodeScript(
      runnerPath,
      repositoryRoot,
      {
        BRUNCH_CHAT_MODEL: "claude-haiku-4-5",
        BRUNCH_RUNBOOK_EXPERT_MODEL: "faux-vestera-expert",
        BRUNCH_RUNBOOK_HARD_STOP: "2",
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
      .find((line) => line.startsWith("RUNBOOK_ELICITATION_RESULT "));
    expect(resultLine, stdout).toBeDefined();
    const result = JSON.parse(
      resultLine!.slice("RUNBOOK_ELICITATION_RESULT ".length),
    ) as {
      artifactBase: string;
      hasIr: boolean;
      interviewTurns: number;
      resourceFilesRead: string[];
      toolNames: string[];
      wroteCaptureStore: boolean;
    };
    expect(result.hasIr).toBe(true);
    expect(result.interviewTurns).toBe(2);
    expect(result.toolNames).toEqual(["activate_skill", "read_skill_resource"]);
    expect(result.toolNames).not.toEqual(
      expect.arrayContaining([
        "brunch_ask",
        "brunch_sweep",
        "addPlace",
        "addTransition",
      ]),
    );
    expect(result.resourceFilesRead).toEqual([
      "elicitation.md",
      "ir-template.md",
    ]);
    expect(result.wroteCaptureStore).toBe(false);

    const files = await readdir(outputDirectory);
    expect(files).toEqual(
      expect.arrayContaining([
        `${result.artifactBase.split("/").at(-1)}.ir.md`,
        `${result.artifactBase.split("/").at(-1)}.json`,
        `${result.artifactBase.split("/").at(-1)}.md`,
      ]),
    );
    const record = JSON.parse(
      await readFile(`${result.artifactBase}.json`, "utf8"),
    ) as {
      instrument: {
        sourceCommit: string;
        fileSha256: Record<string, string>;
      };
      finalizationMessage: string;
    };
    expect(record.instrument.sourceCommit).toMatch(/^[0-9a-f]{40}$/u);
    expect(record.instrument.fileSha256).toHaveProperty(
      "libs/@hashintel/brunch-agent/evaluations/cases/vestera-scheduling/opening-message.md",
    );
    expect(record.instrument.fileSha256).toHaveProperty(
      "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md",
    );
    expect(record.finalizationMessage).toContain("not expert evidence");
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("the prospective runner retains evidence when the expert returns no text", async () => {
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "brunch-runbook-elicitation-failure-"),
  );
  try {
    const { exitCode, stdout } = await runNodeScript(
      join(testDirectory, "../src/runbook-elicitation-run.ts"),
      join(testDirectory, "../../.."),
      {
        BRUNCH_CHAT_MODEL: "claude-haiku-4-5",
        BRUNCH_RUNBOOK_EXPERT_MODEL: "faux-vestera-expert",
        BRUNCH_RUNBOOK_HARD_STOP: "2",
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
        BRUNCH_RUNBOOK_EMPTY_EXPERT: "1",
      },
    );
    expect(exitCode).toBe(1);
    const resultLine = stdout
      .split("\n")
      .find((line) => line.startsWith("RUNBOOK_ELICITATION_RESULT "));
    expect(resultLine, stdout).toBeDefined();
    const result = JSON.parse(
      resultLine!.slice("RUNBOOK_ELICITATION_RESULT ".length),
    ) as {
      artifactBase: string;
      failure: string;
    };
    expect(result.failure).toBe("The simulated expert returned no text");
    expect(await readdir(outputDirectory)).toEqual(
      expect.arrayContaining([
        `${result.artifactBase.split("/").at(-1)}.ir.md`,
        `${result.artifactBase.split("/").at(-1)}.json`,
        `${result.artifactBase.split("/").at(-1)}.md`,
      ]),
    );
    const record = JSON.parse(
      await readFile(`${result.artifactBase}.json`, "utf8"),
    ) as {
      failure: string;
      stopReason: string;
    };
    expect(record).toMatchObject({
      failure: "The simulated expert returned no text",
      stopReason: "expert-error",
    });
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
