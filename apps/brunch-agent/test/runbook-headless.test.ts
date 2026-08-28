import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

const testDirectory = import.meta.dirname;

test("a headless createFlueClient drive recovers IR and a parsable PN without the capture store", async () => {
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
      hasIr: boolean;
      irHasUnknowns: boolean;
      parseOk: boolean;
      hadMissingPositions: boolean;
      toolNames: string[];
      resourceFilesRead: string[];
      wroteCaptureStore: boolean;
    };
    expect(result.hasIr).toBe(true);
    expect(result.irHasUnknowns).toBe(true);
    expect(result.parseOk).toBe(true);
    expect(result.hadMissingPositions).toBe(true);
    expect(result.toolNames).toContain("activate_skill");
    expect(result.toolNames).toContain("read_skill_resource");
    expect(result.toolNames).not.toContain("sweep");
    expect(result.toolNames).not.toContain("brunch_sweep");
    expect(result.toolNames).not.toContain("brunch_ask");
    expect(result.resourceFilesRead).toEqual([
      "elicitation.md",
      "ir-template.md",
      "pn-construction.md",
      "checks.md",
    ]);
    expect(result.wroteCaptureStore).toBe(false);
  } finally {
    await rm(dbDirectory, { recursive: true, force: true });
  }
});
