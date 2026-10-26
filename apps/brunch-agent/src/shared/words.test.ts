import { beforeEach, expect, test, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  saved: [] as readonly string[],
  starts: [] as (() => void)[],
}));
vi.mock("@flue/runtime", () => ({
  usePersistentState: () => [
    runtime.saved,
    (value: readonly string[]) => {
      runtime.saved = value;
    },
  ],
  useAgentStart: (callback: () => void) => runtime.starts.push(callback),
}));

const { useWords } = await import("./words");

beforeEach(() => {
  runtime.saved = [];
  runtime.starts = [];
});

test("first render uses the admitted snapshot, persists only on start, keeps it for signals and clears on ordinary turns", () => {
  expect(useWords(["RelayDesk"])).toEqual(["RelayDesk"]);
  expect(runtime.saved).toEqual([]);
  for (const start of runtime.starts) start();
  expect(runtime.saved).toEqual(["RelayDesk"]);
  expect(useWords(undefined)).toEqual(["RelayDesk"]);
  expect(useWords([])).toEqual([]);
});
