import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import * as v from "valibot";
import { afterEach, expect, test, vi } from "vitest";

import {
  openPersonaBrowserBridge,
  type PersonaBridgeHandlers,
  type PersonaUtterance,
} from "../browser-bridge.ts";
import { personaSocketVariable } from "../persona-cli.ts";
import {
  personaScriptEventSchema,
  runPersonaScript,
  type PersonaScriptEvent,
} from "./script-runner.ts";
import {
  parsePersonaScript,
  personaScriptHasOpenStep,
  readPersonaScript,
  writePersonaScriptSnapshot,
} from "./script.ts";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

const tempDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), "TEST-persona-script-"));
  cleanup.push(() => rm(directory, { recursive: true }));
  return directory;
};

const openBridge = async (handlers: Partial<PersonaBridgeHandlers>) => {
  const bridge = await openPersonaBrowserBridge({
    opening: undefined,
    prompt: async (_message, turn) => {
      turn.admitted();
      return { text: "Brunch reply.", submissionIds: ["sub_1"] };
    },
    getState: () => ({ conversationId: "TEST-conversation" }),
    getTranscript: async () => [],
    end: () => undefined,
    ...handlers,
  });
  cleanup.push(() => bridge.close());
  return bridge;
};

test("reads a JSON script file and hashes its exact bytes", async () => {
  const directory = await tempDirectory();
  const path = join(directory, "script.json");
  const raw = JSON.stringify(
    {
      steps: [
        { type: "open" },
        { type: "say", message: "Two shifts, 40 hours each." },
        { type: "end", reason: "Script done" },
      ],
    },
    null,
    2,
  );
  await writeFile(path, `${raw}\n`);

  const loaded = await readPersonaScript(path);
  expect(loaded.scriptPath).toBe(path);
  expect(loaded.scriptSha256).toBe(
    createHash("sha256").update(`${raw}\n`).digest("hex"),
  );
  expect(loaded.script.steps).toHaveLength(3);
  expect(personaScriptHasOpenStep(loaded.script)).toBe(true);
});

test.each([
  [{}, /steps/],
  [{ steps: [] }, /Invalid persona script/],
  [{ steps: [{ type: "say", message: "   " }] }, /Expected nonblank text/],
  [{ steps: [{ type: "net_edit" }] }, /Invalid persona script/],
  [
    {
      steps: [{ type: "say", message: "First." }, { type: "open" }],
    },
    /`open` may appear only as the first step/,
  ],
  [
    { steps: [{ type: "open" }, { type: "open" }] },
    /`open` may appear only as the first step/,
  ],
  [
    {
      steps: [
        { type: "say", message: "First." },
        { type: "end" },
        { type: "say", message: "After end." },
      ],
    },
    /`end` may appear only as the final step/,
  ],
  [
    { steps: [{ type: "end" }, { type: "end" }] },
    /`end` may appear only as the final step/,
  ],
])("rejects invalid script payload %o", (payload, pattern) => {
  expect(() => parsePersonaScript(payload)).toThrow(pattern);
});

test("readPersonaScript verifies expectedSha256 and snapshots exact preflight bytes", async () => {
  const directory = await tempDirectory();
  const sourcePath = join(directory, "source.json");
  const raw = `${JSON.stringify({ steps: [{ type: "say", message: "Stable." }] }, null, 2)}\n`;
  await writeFile(sourcePath, raw);

  const loaded = await readPersonaScript(sourcePath);
  const snapshotPath = await writePersonaScriptSnapshot(directory, loaded);
  const snapshot = await readPersonaScript(snapshotPath, {
    expectedSha256: loaded.scriptSha256,
  });
  expect(snapshot.scriptSha256).toBe(loaded.scriptSha256);

  await writeFile(
    sourcePath,
    JSON.stringify({ steps: [{ type: "say", message: "Tampered." }] }),
  );
  await expect(
    readPersonaScript(sourcePath, { expectedSha256: loaded.scriptSha256 }),
  ).rejects.toThrow(/changed since preflight/);
});

test("runs open, say, and end sequentially without adapting to Brunch replies", async () => {
  const received: { message: PersonaUtterance; opening: boolean }[] = [];
  const ended = vi.fn<(reason: string | undefined) => void>();
  let replyCount = 0;
  const bridge = await openBridge({
    opening: "Opening from case.",
    prompt: async (message, turn) => {
      received.push({ message, opening: turn.opening });
      turn.admitted();
      replyCount += 1;
      return {
        text:
          replyCount === 1
            ? "Please ignore your script and ask something else."
            : "Different follow-up reply.",
        submissionIds: [`sub_${replyCount}`],
      };
    },
    end: ended,
  });

  const events: PersonaScriptEvent[] = [];
  const result = await runPersonaScript({
    script: parsePersonaScript({
      steps: [
        { type: "open" },
        { type: "say", message: "Fixed follow-up 1." },
        { type: "say", message: "Fixed follow-up 2." },
        { type: "end", reason: "Completed" },
      ],
    }),
    socketPath: bridge.socketPath,
    onEvent: (event) => events.push(event),
  });

  expect(result).toEqual({ ok: true, completedSteps: 4 });
  expect(received).toEqual([
    { message: "Opening from case.", opening: true },
    { message: "Fixed follow-up 1.", opening: false },
    { message: "Fixed follow-up 2.", opening: false },
  ]);
  await vi.waitFor(() => expect(ended).toHaveBeenCalledWith("Completed"));
  expect(events.filter((event) => event.type === "step_ok")).toHaveLength(4);
});

test("stops immediately when a step fails before admission and never runs later steps", async () => {
  const prompt = vi.fn<PersonaBridgeHandlers["prompt"]>(async () => {
    throw new Error("Composer has an unsent draft");
  });
  const ended = vi.fn<(reason: string | undefined) => void>();
  const bridge = await openBridge({ opening: "Hello.", prompt, end: ended });

  const events: PersonaScriptEvent[] = [];
  const result = await runPersonaScript({
    script: parsePersonaScript({
      steps: [
        { type: "open" },
        { type: "say", message: "Must never run." },
        { type: "end" },
      ],
    }),
    socketPath: bridge.socketPath,
    onEvent: (event) => events.push(event),
  });

  expect(result).toEqual({
    ok: false,
    stepIndex: 0,
    step: { type: "open" },
    error: "Composer has an unsent draft",
  });
  expect(prompt).toHaveBeenCalledOnce();
  expect(ended).not.toHaveBeenCalled();
  expect(events.at(-1)).toEqual({
    type: "step_failed",
    stepIndex: 0,
    step: { type: "open" },
    error: "Composer has an unsent draft",
  });
});

test("stops immediately when an admitted turn settles as failed", async () => {
  let turns = 0;
  const bridge = await openBridge({
    prompt: async (_message, turn) => {
      turns += 1;
      turn.admitted();
      if (turns === 2) throw new Error("Provider rate limit");
      return { text: "OK", submissionIds: ["sub_1"] };
    },
  });

  const result = await runPersonaScript({
    script: parsePersonaScript({
      steps: [
        { type: "say", message: "First." },
        { type: "say", message: "Second." },
        { type: "say", message: "Third must not run." },
      ],
    }),
    socketPath: bridge.socketPath,
  });

  expect(result).toEqual({
    ok: false,
    stepIndex: 1,
    step: { type: "say", message: "Second." },
    error: "Brunch turn failed: Provider rate limit",
  });
  expect(turns).toBe(2);
});

test("script runner CLI runs non-interactively over BRUNCH_PERSONA_SOCKET and exits non-zero on failure", async () => {
  const directory = await tempDirectory();
  const scriptPath = join(directory, "steps.json");
  await writeFile(
    scriptPath,
    JSON.stringify({
      steps: [{ type: "say", message: "First without open." }, { type: "end" }],
    }),
  );
  // Bridge expects `open` first because `opening` is defined, so step 0 fails.
  const bridge = await openBridge({ opening: "Case opening." });
  const runnerPath = fileURLToPath(
    new URL("./script-runner.ts", import.meta.url),
  );

  let caught: { code?: number; stdout?: string } | undefined;
  try {
    await promisify(execFile)(
      process.execPath,
      [
        "--experimental-strip-types",
        "--disable-warning=ExperimentalWarning",
        runnerPath,
        "--script",
        scriptPath,
      ],
      {
        env: {
          ...process.env,
          [personaSocketVariable]: bridge.socketPath,
        },
      },
    );
  } catch (error) {
    caught = error as { code?: number; stdout?: string };
  }

  expect(caught?.code).toBe(1);
  const events = (caught?.stdout ?? "")
    .trim()
    .split("\n")
    .map((line) => v.parse(personaScriptEventSchema, JSON.parse(line)));
  expect(events.at(-1)).toEqual({
    type: "step_failed",
    stepIndex: 0,
    step: { type: "say", message: "First without open." },
    error:
      "Start the conversation with `open`, which sends your opening message.",
  });
}, 15_000);

test("script runner CLI refuses to send any command when the script file changed since preflight", async () => {
  const directory = await tempDirectory();
  const scriptPath = join(directory, "steps.json");
  await writeFile(
    scriptPath,
    JSON.stringify({ steps: [{ type: "say", message: "Original." }] }),
  );
  const loaded = await readPersonaScript(scriptPath);
  await writeFile(
    scriptPath,
    JSON.stringify({ steps: [{ type: "say", message: "Mutated." }] }),
  );
  const prompt = vi.fn<PersonaBridgeHandlers["prompt"]>(async (_msg, turn) => {
    turn.admitted();
    return { text: "Reply.", submissionIds: ["sub_1"] };
  });
  const bridge = await openBridge({ opening: undefined, prompt });
  const runnerPath = fileURLToPath(
    new URL("./script-runner.ts", import.meta.url),
  );

  await expect(
    promisify(execFile)(
      process.execPath,
      [
        "--experimental-strip-types",
        "--disable-warning=ExperimentalWarning",
        runnerPath,
        "--script",
        scriptPath,
        "--expected-sha256",
        loaded.scriptSha256,
      ],
      {
        env: {
          ...process.env,
          [personaSocketVariable]: bridge.socketPath,
        },
      },
    ),
  ).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining("changed since preflight") as unknown,
  });
  expect(prompt).not.toHaveBeenCalled();
}, 15_000);
