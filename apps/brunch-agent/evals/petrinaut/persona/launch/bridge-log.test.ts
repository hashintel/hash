import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import {
  appendAdmittedUtterance,
  appendAllowedDestructiveEdit,
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
    personaAgent: { agent: "pi" },
  });
  await appendAllowedDestructiveEdit(run, {
    items: ["Remove place — Queue"],
  });

  await expect(lastAdmittedUtterance(run)).resolves.toBe("Hello.");
  const records = (await readFile(bridgeLogPath(run), "utf8"))
    .trim()
    .split("\n")
    .map((line): unknown => JSON.parse(line));
  expect(records.at(-1)).toMatchObject({
    event: "destructive-edit-allowed",
    items: ["Remove place — Queue"],
  });
  expect(records.at(-1)).toHaveProperty("recordedAt");
});

test("a torn log line names the file and line instead of guessing the last utterance", async () => {
  const run = await mkdtemp(join(tmpdir(), "TEST-persona-bridge-log-"));
  runs.push(run);
  await appendAdmittedUtterance(run, {
    source: "opening",
    message: "Hello.",
    submissionId: "sub_TEST",
    personaAgent: { agent: "pi" },
  });
  await expect(lastAdmittedUtterance(run)).resolves.toBe("Hello.");

  await appendFile(bridgeLogPath(run), '{"event":"admitted","sou');
  await expect(lastAdmittedUtterance(run)).rejects.toThrow(
    /bridge-log\.jsonl line 2 is not valid JSON; refusing automatic resume/,
  );
});
