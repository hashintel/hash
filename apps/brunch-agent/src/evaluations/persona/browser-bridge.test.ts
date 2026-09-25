import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, expect, test, vi } from "vitest";

import {
  openPersonaBrowserBridge,
  sendPersonaCommand,
  type PersonaBridgeHandlers,
} from "./browser-bridge.ts";
import { writePersonaHelper } from "./launch/agent.ts";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

const openBridge = async (handlers: Partial<PersonaBridgeHandlers>) => {
  const bridge = await openPersonaBrowserBridge({
    prompt: async (_message, turn) => {
      turn.admitted();
      return { text: "Tell me more.", submissionIds: ["sub_1"] };
    },
    getState: () => ({ conversationId: "TEST-conversation" }),
    getTranscript: async () => [
      { speaker: "user", text: "Hello." },
      { speaker: "brunch", text: "Tell me more." },
    ],
    end: () => undefined,
    ...handlers,
  });
  cleanup.push(() => bridge.close());
  return bridge;
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("an admitted prompt yields its response, then the turn's events through settlement", async () => {
  const bridge = await openBridge({});
  const records = await sendPersonaCommand(bridge.socketPath, {
    id: "turn-1",
    type: "prompt",
    message: "Hello.",
  });
  expect(records).toEqual([
    { id: "turn-1", type: "response", command: "prompt", success: true },
    { type: "turn_start", message: "Hello." },
    { type: "assistant_message", text: "Tell me more." },
    { type: "turn_settled", outcome: "replied", submissionIds: ["sub_1"] },
  ]);
  const [state] = await sendPersonaCommand(bridge.socketPath, {
    type: "get_state",
  });
  expect(state).toMatchObject({
    success: true,
    data: {
      conversationId: "TEST-conversation",
      turnActive: false,
      completedTurns: 1,
    },
  });
});

test("a failure before admission is a failed response; after admission it settles the turn", async () => {
  const early = await openBridge({
    prompt: async () => {
      throw new Error("Composer has an unsent draft");
    },
  });
  expect(
    await sendPersonaCommand(early.socketPath, {
      type: "prompt",
      message: "Hello.",
    }),
  ).toEqual([
    expect.objectContaining({
      success: false,
      error: "Composer has an unsent draft",
    }),
  ]);

  const late = await openBridge({
    prompt: async (_message, turn) => {
      turn.admitted();
      throw new Error("Brunch turn failed");
    },
  });
  const records = await sendPersonaCommand(late.socketPath, {
    type: "prompt",
    message: "Hello.",
  });
  expect(records.at(-1)).toEqual({
    type: "turn_settled",
    outcome: "failed",
    submissionIds: [],
    error: "Brunch turn failed",
  });

  const stopped = await openBridge({
    prompt: async (_message, turn) => {
      turn.admitted();
      // Shape of `PersonaBrowserTurnError` wrapping a Brunch Stop.
      const wrapped = new Error("Persona browser turn was stopped.", {
        cause: new DOMException(
          "Persona browser turn was stopped.",
          "AbortError",
        ),
      });
      wrapped.name = "PersonaBrowserTurnError";
      throw wrapped;
    },
  });
  const stoppedRecords = await sendPersonaCommand(stopped.socketPath, {
    type: "prompt",
    message: "Hello.",
  });
  expect(stoppedRecords.at(-1)).toMatchObject({
    type: "turn_settled",
    outcome: "aborted",
  });
});

test("turns are sequential, and disconnecting the sender aborts its turn", async () => {
  const admitted = deferred();
  const aborted = deferred();
  const bridge = await openBridge({
    prompt: (_message, turn) => {
      turn.admitted();
      admitted.resolve();
      return new Promise((_resolve, reject) => {
        turn.signal.addEventListener("abort", () => {
          aborted.resolve();
          reject(new Error("aborted"));
        });
      });
    },
  });
  const sender = new AbortController();
  const first = sendPersonaCommand(
    bridge.socketPath,
    { type: "prompt", message: "First." },
    { signal: sender.signal },
  );
  await admitted.promise;
  expect(
    await sendPersonaCommand(bridge.socketPath, {
      type: "prompt",
      message: "Second.",
    }),
  ).toEqual([
    expect.objectContaining({
      success: false,
      error: "A persona turn is already active",
    }),
  ]);
  sender.abort(new Error("sender gave up"));
  await expect(first).rejects.toThrow("sender gave up");
  await aborted.promise;
});

test("end is acknowledged before the launcher is told to stop", async () => {
  const end = vi.fn<(reason: string | undefined) => void>();
  const bridge = await openBridge({ end });
  expect(
    await sendPersonaCommand(bridge.socketPath, {
      type: "end",
      reason: "Goal reached",
    }),
  ).toEqual([expect.objectContaining({ command: "end", success: true })]);
  await vi.waitFor(() => expect(end).toHaveBeenCalledWith("Goal reached"));
});

test("the generated helper reads like an ordinary CLI over the bridge", async () => {
  const run = await mkdtemp(join(tmpdir(), "TEST-persona-helper-"));
  cleanup.push(() => rm(run, { recursive: true }));
  const bridge = await openBridge({});
  const helper = await writePersonaHelper(run, bridge.socketPath);
  const persona = (...args: string[]) =>
    promisify(execFile)(helper, args, { env: process.env });

  expect((await persona("say", "Hello.")).stdout).toBe("Tell me more.\n");
  expect((await persona("transcript")).stdout).toBe(
    "You: Hello.\n\nBrunch: Tell me more.\n",
  );
  const raw = (await persona("rpc", '{"id":"s","type":"get_state"}')).stdout
    .trim()
    .split("\n")
    .map((line): unknown => JSON.parse(line));
  expect(raw).toEqual([
    expect.objectContaining({ id: "s", command: "get_state", success: true }),
  ]);
  await expect(persona("say", "  ")).rejects.toMatchObject({
    stderr: "Expected nonblank text\n",
  });
}, 20_000);
