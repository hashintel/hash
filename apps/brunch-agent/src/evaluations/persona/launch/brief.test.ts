import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import { writePersonaBrief, writePersonaResumeBrief } from "./brief.ts";

const runs: string[] = [];
afterEach(async () => {
  await Promise.all(runs.splice(0).map((run) => rm(run, { recursive: true })));
});

const temporaryRun = async () => {
  const run = await mkdtemp(join(tmpdir(), "TEST-persona-brief-"));
  runs.push(run);
  return run;
};

test("the fresh brief assembles the role, command guide, opening exchange and pack in order", async () => {
  const run = await temporaryRun();
  const [brief, system] = await Promise.all([
    readFile(
      await writePersonaBrief({
        run,
        helper: "/tmp/run/bin/persona",
        objective: undefined,
        opening: "PUBLIC opening",
        reply: "BRUNCH reply",
        pack: "PRIVATE pack",
      }),
      "utf8",
    ),
    readFile(new URL("brief/system.md", import.meta.url), "utf8"),
  ]);
  const order = [
    "# Persona brief",
    system.trim(),
    "## How to talk to Brunch",
    '/tmp/run/bin/persona say "<your message>"',
    "/tmp/run/bin/persona end",
    "## Conversation so far",
    "PUBLIC opening",
    "BRUNCH reply",
    "## Situation pack",
    "PRIVATE pack",
  ].map((part) => brief.indexOf(part));
  expect(order.every((index) => index >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((left, right) => left - right));
});

test("an objective is placed after the command guide and before the conversation", async () => {
  const run = await temporaryRun();
  const brief = await readFile(
    await writePersonaBrief({
      run,
      helper: "persona",
      objective: "TEST objective",
      opening: "Hi",
      reply: "Hello",
      pack: "Pack",
    }),
    "utf8",
  );
  const order = [
    "## How to talk to Brunch",
    "## What you're after today\n\nTEST objective",
    "## Conversation so far",
  ].map((part) => brief.indexOf(part));
  expect(order.every((index) => index >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((left, right) => left - right));
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
