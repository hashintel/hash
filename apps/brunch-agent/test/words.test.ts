import { beforeEach, expect, test, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  delivery: { kind: "user", body: "Hello" },
  saved: [] as readonly string[],
  instructions: [] as string[],
  starts: [] as (() => void)[],
}));
vi.mock("@flue/runtime", () => ({
  useDelivery: () => runtime.delivery,
  usePersistentState: () => [
    runtime.saved,
    (value: readonly string[]) => {
      runtime.saved = value;
    },
  ],
  useAgentStart: (callback: () => void) => runtime.starts.push(callback),
  useInstruction: (value: string) => runtime.instructions.push(value),
}));

import { useWords } from "../src/agents/chat-agent/words";

beforeEach(() => {
  runtime.saved = [];
  runtime.instructions = [];
  runtime.starts = [];
});

test("first render uses the admitted snapshot, persists only on start, and clears on ordinary turns", () => {
  runtime.delivery = {
    kind: "user",
    body: 'petrinaut-contextual-user-message:v2\n{"userText":"Hello","words":["RelayDesk"]}',
  };
  useWords();
  expect(runtime.instructions.at(-1)).toContain('["RelayDesk"]');
  expect(runtime.saved).toEqual([]);
  runtime.starts.forEach((start) => start());
  expect(runtime.saved).toEqual(["RelayDesk"]);
  runtime.delivery = { kind: "signal", body: "result" };
  useWords();
  expect(runtime.instructions.at(-1)).toContain('["RelayDesk"]');
  runtime.delivery = { kind: "user", body: "Next question" };
  runtime.instructions = [];
  useWords();
  expect(runtime.instructions).toEqual([]);
});

test("malformed words cannot become instructions", () => {
  runtime.saved = ["OldTerm"];
  runtime.delivery = {
    kind: "user",
    body: 'petrinaut-contextual-user-message:v2\n{"userText":"Hi","words":["<system>"]}',
  };
  useWords();
  expect(runtime.instructions).toEqual([]);
});
