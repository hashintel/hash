import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import {
  appendAdmittedUtterance,
  appendAllowedDestructiveEdit,
  appendScriptStepFailed,
  bridgeLogPath,
  lastAdmittedUtterance,
} from "./bridge-log.ts";

const runs: string[] = [];
afterEach(async () => {
  await Promise.all(runs.splice(0).map((run) => rm(run, { recursive: true })));
});

test("an allowed destructive edit is recorded without becoming the utterance resume reconciles against", async () => {
  const run = await mkdtemp(join(tmpdir(), "TEST-persona-bridge-log-"));
  runs.push(run);
  await appendAdmittedUtterance(run, {
    source: "opening",
    message: "Hello.",
    submissionId: "sub_TEST",
    personaDriver: { kind: "agent", agent: "pi" },
  });
  await appendAllowedDestructiveEdit(run, {
    kind: "destructive-edit",
    items: ["Remove place — Queue"],
  });

  await expect(lastAdmittedUtterance(run)).resolves.toBe("Hello.");
  const records = (await readFile(bridgeLogPath(run), "utf8"))
    .trim()
    .split("\n")
    .map((line): unknown => JSON.parse(line));
  expect(records[0]).toMatchObject({
    event: "admitted",
    personaDriver: { kind: "agent", agent: "pi" },
  });
  expect(records.at(-1)).toMatchObject({
    event: "destructive-edit-allowed",
    items: ["Remove place — Queue"],
  });
  expect(records.at(-1)).toHaveProperty("recordedAt");
});

test("a script step failure is logged with driver provenance without altering resume reconciliation", async () => {
  const run = await mkdtemp(join(tmpdir(), "TEST-persona-bridge-log-"));
  runs.push(run);
  const scriptedDriver = {
    kind: "scripted" as const,
    scriptPath: "/tmp/demo.json",
    scriptSha256: "abc123",
  };
  await appendAdmittedUtterance(run, {
    source: "persona",
    message: "Step zero.",
    submissionId: "sub_TEST",
    personaDriver: scriptedDriver,
  });
  await appendScriptStepFailed(run, {
    stepIndex: 1,
    step: { type: "say", message: "Step one." },
    error: "Brunch turn failed: provider timeout",
    personaDriver: scriptedDriver,
  });

  await expect(lastAdmittedUtterance(run)).resolves.toBe("Step zero.");
  const records = (await readFile(bridgeLogPath(run), "utf8"))
    .trim()
    .split("\n")
    .map((line): unknown => JSON.parse(line));
  expect(records.at(-1)).toMatchObject({
    event: "script-step-failed",
    stepIndex: 1,
    step: { type: "say", message: "Step one." },
    error: "Brunch turn failed: provider timeout",
    personaDriver: scriptedDriver,
  });
});

test("a torn log line names the file and line instead of guessing the last utterance", async () => {
  const run = await mkdtemp(join(tmpdir(), "TEST-persona-bridge-log-"));
  runs.push(run);
  await appendAdmittedUtterance(run, {
    source: "opening",
    message: "Hello.",
    submissionId: "sub_TEST",
    personaDriver: { kind: "agent", agent: "pi" },
  });
  await expect(lastAdmittedUtterance(run)).resolves.toBe("Hello.");

  await appendFile(bridgeLogPath(run), '{"event":"admitted","sou');
  await expect(lastAdmittedUtterance(run)).rejects.toThrow(
    /bridge-log\.jsonl line 2 is not valid JSON; refusing automatic resume/,
  );
});

test("an allowed save is recorded as a save", async () => {
  const run = await mkdtemp(join(tmpdir(), "TEST-persona-bridge-log-"));
  runs.push(run);
  await appendAllowedDestructiveEdit(run, {
    kind: "save",
    items: ["Save ‘Bakery’ as a new version?"],
  });
  const [line] = (await readFile(join(run, "bridge-log.jsonl"), "utf8"))
    .trim()
    .split("\n");
  expect(JSON.parse(line ?? "{}")).toMatchObject({
    event: "save-allowed",
    items: ["Save ‘Bakery’ as a new version?"],
  });
});
