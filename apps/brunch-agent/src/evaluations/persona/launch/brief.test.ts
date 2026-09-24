import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import { resolvePersonaAxisSettings } from "./axis-settings.ts";
import {
  defaultPersonaObjective,
  writePersonaBrief,
  writePersonaResumeBrief,
} from "./brief.ts";

const runs: string[] = [];
afterEach(async () => {
  await Promise.all(runs.splice(0).map((run) => rm(run, { recursive: true })));
});

const temporaryRun = async () => {
  const run = await mkdtemp(join(tmpdir(), "TEST-persona-brief-"));
  runs.push(run);
  return run;
};

test("the fresh brief carries the rules, the command guide, the opening exchange and the pack", async () => {
  const run = await temporaryRun();
  const brief = await readFile(
    await writePersonaBrief({
      run,
      helper: "/tmp/run/bin/persona",
      axes: resolvePersonaAxisSettings(),
      objective: undefined,
      opening: "PUBLIC opening",
      reply: "BRUNCH reply",
      pack: "PRIVATE pack",
    }),
    "utf8",
  );
  expect(brief).toContain("You are the user-side actor");
  expect(brief).toContain('/tmp/run/bin/persona say "<your message>"');
  expect(brief).toContain("/tmp/run/bin/persona end");
  expect(brief).toContain(defaultPersonaObjective);
  expect(brief).toContain("PUBLIC opening");
  expect(brief).toContain("BRUNCH reply");
  expect(brief).toContain("PRIVATE pack");
  expect(brief).not.toContain("brunch_turn");
  expect(brief).not.toContain("For this run, override only");
});

test("non-default axes and an objective are included in stable order", async () => {
  const run = await temporaryRun();
  const brief = await readFile(
    await writePersonaBrief({
      run,
      helper: "persona",
      axes: resolvePersonaAxisSettings({
        personaVerbosity: "terse",
        personaDisclosure: "reticent",
      }),
      objective: "TEST objective",
      opening: "Hi",
      reply: "Hello",
      pack: "Pack",
    }),
    "utf8",
  );
  const terse = brief.indexOf("posture: be terse");
  const reticent = brief.indexOf("posture: be reticent");
  expect(terse).toBeGreaterThan(0);
  expect(reticent).toBeGreaterThan(terse);
  expect(brief).toContain("TEST objective");
  expect(brief).not.toContain(defaultPersonaObjective);
});

test("the resume notice points back to the original brief and forbids resending", async () => {
  const run = await temporaryRun();
  const notice = await readFile(
    await writePersonaResumeBrief({
      run,
      helper: "/tmp/run/bin/persona",
      settlement: "aborted",
      reply: "",
    }),
    "utf8",
  );
  expect(notice).toContain(join(run, "persona-brief.md"));
  expect(notice).toContain("/tmp/run/bin/persona transcript");
  expect(notice).toContain("WAS received. Do not resend it");
  expect(notice).toContain("settled as: aborted");
  expect(notice).toContain("No reply prose was retained.");
});
