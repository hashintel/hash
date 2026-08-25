import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import {
  CLOSING_TEXT,
  EXPERT_OBJECTIVE_QUOTE,
  FIRST_QUESTION,
  SECOND_QUESTION,
} from "./fixtures/baseline-harness-interviewer.ts";
import { runNodeScript } from "./run-node-script";

import type { HarnessRunRecord } from "../../../libs/@hashintel/brunch-agent/evaluations/protocols/process-model-elicitation/baseline/harness-run.ts";

const testDirectory = import.meta.dirname;
const contextRoot = join(
  testDirectory,
  "../../../libs/@hashintel/brunch-agent",
);
const runner = join(
  contextRoot,
  "evaluations/protocols/process-model-elicitation/baseline/harness-run.ts",
);
const expertStub = join(
  contextRoot,
  "packages/core/test/architecture/fixtures/baseline-anthropic-stub.ts",
);
const interviewer = join(
  testDirectory,
  "fixtures/baseline-harness-interviewer.ts",
);

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("condition 5 drives the shipped elicitor through the binding and reads the harness's facts back", async () => {
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "brunch-baseline-c5-test-"),
  );
  temporaryDirectories.push(outputDirectory);
  const expertReplies = [
    { text: EXPERT_OBJECTIVE_QUOTE },
    { text: "Better is fewer late promises, then fewer changeovers." },
    { text: "Alright. Anything else?" },
    { text: "Then I'll get back to the floor." },
    { text: "Cheers." },
  ];

  const { exitCode, stderr } = await runNodeScript(
    runner,
    join(testDirectory, "../../.."),
    {
      BRUNCH_BASELINE_TEST_OUTPUT_DIR: outputDirectory,
      BRUNCH_BASELINE_ANTHROPIC_MODULE: expertStub,
      BRUNCH_BASELINE_INTERVIEWER_PROVIDER_MODULE: interviewer,
      BASELINE_STUB_REPLIES: JSON.stringify(expertReplies),
      BRUNCH_SDCPN_MODEL: "claude-haiku-4-5",
    },
  );
  expect(exitCode, stderr).toBe(0);

  const run = JSON.parse(
    await readFile(join(outputDirectory, "condition-5.raw.json"), "utf8"),
  ) as HarnessRunRecord;

  // Turn 1 asks; the expert's reply is bound to that ask on the next dispatch.
  expect(run.turns[0]?.pendingQuestion).toBe(FIRST_QUESTION);
  expect(run.turns[0]?.expert?.content).toBe(EXPERT_OBJECTIVE_QUOTE);
  expect(
    run.turns[1]?.signals.some(
      (signal) => signal.tagName === "affordance-reply-bound",
    ),
  ).toBe(true);

  // Turn 2 sweeps the settled range: one capture applied, completion reported
  // by the harness, and the second question left pending.
  const sweep = run.turns[1]?.sweeps[0];
  expect(sweep?.status).toBe("applied");
  expect(sweep?.appliedCaptureIds).toHaveLength(1);
  expect(sweep?.completion).toMatchObject({ complete: false });
  expect(run.turns[1]?.pendingQuestion).toBe(SECOND_QUESTION);
  expect(run.turns[1]?.completion).toMatchObject({
    captures: 1,
    complete: false,
  });

  // Then the interviewer closes without asking; the runner counts three such
  // turns before the wrap and declares the interview stalled — no classifier.
  expect(run.turns.slice(2).map((turn) => turn.text)).toEqual([
    expect.arrayContaining([CLOSING_TEXT]),
    expect.arrayContaining([CLOSING_TEXT]),
    expect.arrayContaining([CLOSING_TEXT]),
  ]);
  expect(
    run.turns.slice(2).every((turn) => turn.pendingQuestion === undefined),
  ).toBe(true);
  expect(run.stopReason).toBe("stalled");
  expect(run.turns).toHaveLength(5);
  expect(run.usage.interviewer.calls).toBeGreaterThanOrEqual(5);
  expect(run.usage.expert.calls).toBe(4);

  // The store is the deliverable: the one capture, quoting the expert verbatim.
  expect(run.store.captures).toHaveLength(1);
  const [captures, model, transcript, system] = await Promise.all([
    readFile(join(outputDirectory, "condition-5-captures.json"), "utf8"),
    readFile(join(outputDirectory, "condition-5-model.md"), "utf8"),
    readFile(join(outputDirectory, "condition-5.md"), "utf8"),
    readFile(join(outputDirectory, "condition-5-system.md"), "utf8"),
  ]);
  expect(captures).toContain(EXPERT_OBJECTIVE_QUOTE);
  expect(model).toContain("### objective (1)");
  expect(model).toContain("Complete: **no**");
  expect(transcript).toContain("Stop reason: stalled");
  expect(transcript).toContain("> harness — sweep applied; applied 1");
  expect(transcript).toContain(FIRST_QUESTION);
  expect(system).toContain("brunch_ask");
});
