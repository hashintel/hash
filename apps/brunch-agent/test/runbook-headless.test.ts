import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

const testDirectory = import.meta.dirname;

test("the built ChatAgent constructs a validated net from the saved IR", async () => {
  const dbDirectory = await mkdtemp(join(tmpdir(), "brunch-runbook-"));
  try {
    const { exitCode, stdout, stderr } = await runNodeScript(
      join(testDirectory, "runbook-headless.integration.ts"),
      join(testDirectory, "../../.."),
      { BRUNCH_CHAT_DB_PATH: join(dbDirectory, "conversations.db") },
    );
    expect(exitCode, stderr || stdout).toBe(0);
    const resultLine = stdout
      .split("\n")
      .find((line) => line.startsWith("RUNBOOK_HEADLESS_HERMETIC "));
    expect(resultLine, stdout).toBeDefined();
    const result = JSON.parse(
      resultLine!.slice("RUNBOOK_HEADLESS_HERMETIC ".length),
    ) as {
      sourceIrUsed: boolean;
      parseOk: boolean;
      placeCount: number;
      transitionCount: number;
      toolNames: string[];
      resourceFilesRead: string[];
      validationRejections: string[];
      emittedFreeFormPnJson: boolean;
      userMessages: number;
      wroteCaptureStore: boolean;
    };
    expect(result.sourceIrUsed).toBe(true);
    expect(result.parseOk).toBe(true);
    expect(result.placeCount).toBeGreaterThan(0);
    expect(result.transitionCount).toBeGreaterThan(0);
    expect(result.toolNames).toContain("activate_skill");
    expect(result.toolNames).toContain("read_skill_resource");
    expect(result.toolNames).toEqual(
      expect.arrayContaining([
        "getLatestNetDefinition",
        "addType",
        "addParameter",
        "addPlace",
        "addTransition",
        "addArc",
      ]),
    );
    expect(result.toolNames).not.toContain("sweep");
    expect(result.toolNames).not.toContain("brunch_sweep");
    expect(result.toolNames).not.toContain("brunch_ask");
    expect(result.resourceFilesRead).toEqual([
      "elicitation.md",
      "ir-template.md",
      "pn-construction.md",
      "checks.md",
    ]);
    expect(result.validationRejections).toHaveLength(1);
    expect(result.validationRejections[0]).toContain(
      "expected number to be >0",
    );
    expect(result.emittedFreeFormPnJson).toBe(false);
    expect(result.userMessages).toBe(1);
    expect(result.wroteCaptureStore).toBe(false);
  } finally {
    await rm(dbDirectory, { recursive: true, force: true });
  }
});
