import { useModel } from "@flue/runtime";
import { beforeEach, expect, test, vi } from "vitest";

import { useBrunchAgent } from "../src/flue";

import type { CompactionConfig } from "@flue/runtime";

vi.mock("@flue/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/runtime")>()),
  useModel: vi.fn<typeof useModel>(),
  useSkill: () => undefined,
  useTool: () => undefined,
  useDataWriter: () => () => undefined,
  // Keep this forwarding pin independent of A2's separately owned state hooks.
  usePersistentState: () => [null, () => undefined],
}));

beforeEach(() => vi.clearAllMocks());

test("leaves Flue model options unset by default", () => {
  useBrunchAgent("anthropic/claude-sonnet-4-6");
  expect(useModel).toHaveBeenCalledOnce();
  expect(vi.mocked(useModel).mock.calls[0]?.[0]).toBe(
    "anthropic/claude-sonnet-4-6",
  );
  expect(vi.mocked(useModel).mock.calls[0]?.[1]).toBeUndefined();
});

test("forwards the compaction configuration through the single model declaration", () => {
  const compaction: CompactionConfig = { keepRecentTokens: 256 };
  useBrunchAgent("anthropic/claude-sonnet-4-6", compaction);
  expect(useModel).toHaveBeenCalledExactlyOnceWith(
    "anthropic/claude-sonnet-4-6",
    { compaction },
  );
});
