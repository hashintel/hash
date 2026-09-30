import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import {
  appendAdmittedUtterance,
  bridgeLogPath,
  lastAdmittedUtterance,
} from "./bridge-log.ts";

const runs: string[] = [];
afterEach(async () => {
  await Promise.all(runs.splice(0).map((run) => rm(run, { recursive: true })));
});

test("a torn log line names the file and line instead of guessing the last utterance", async () => {
  const run = await mkdtemp(join(tmpdir(), "TEST-persona-bridge-log-"));
  runs.push(run);
  await appendAdmittedUtterance(run, { source: "opening", message: "Hello." });
  await expect(lastAdmittedUtterance(run)).resolves.toBe("Hello.");

  await appendFile(bridgeLogPath(run), '{"event":"admitted","sou');
  await expect(lastAdmittedUtterance(run)).rejects.toThrow(
    /bridge-log\.jsonl line 2 is not valid JSON; refusing automatic resume/,
  );
});
