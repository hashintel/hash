import { createHash } from "node:crypto";

import { usePersistentState, useTool, type StateSetter } from "@flue/runtime";
import { beforeEach, expect, test, vi } from "vitest";

import {
  useBrunchAgent,
  createUpdateWorkpieceTool,
  workpieceMarkdownByteCeiling,
} from "../src/flue";
import {
  workpieceRevisionStateKey,
  type WorkpieceRevision,
} from "../src/workpiece";

vi.mock("@flue/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/runtime")>()),
  useModel: vi.fn<typeof import("@flue/runtime").useModel>(),
  useSkill: vi.fn<typeof import("@flue/runtime").useSkill>(),
  useDataWriter: () => () => {},
  usePersistentState: vi.fn<typeof usePersistentState>(),
  useTool: vi.fn<typeof useTool>(),
}));

let current: WorkpieceRevision | null;
const setRevision: StateSetter<WorkpieceRevision | null> = (next) => {
  current = typeof next === "function" ? next(current) : next;
};
const tool = createUpdateWorkpieceTool(setRevision);
const run = (
  markdown: string,
  toolCallId = "actual-tool-call",
  evidence?: unknown,
) =>
  tool.run({
    data: { markdown, evidence },
    toolCallId,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    step: {
      do: () => {
        throw new Error("State writes must not use a separate step checkpoint");
      },
    },
  });

beforeEach(() => {
  current = null;
  vi.clearAllMocks();
});

test("returns revisionId equal to toolCallId and sha256 of the Markdown", async () => {
  const markdown = "  # Café\r\n\nUnknown.  ";
  expect(await run(markdown)).toEqual({
    output: {
      revisionId: "actual-tool-call",
      sha256: createHash("sha256").update(markdown, "utf8").digest("hex"),
      ordinal: 1,
    },
    terminate: false,
  });
});

test("persists Markdown with the pointer", async () => {
  await run("# First", "first");
  const result = await run("# Second", "second", { unverified: ["message-1"] });
  expect(current).toEqual({
    ...result.output,
    markdown: "# Second",
    evidence: { unverified: ["message-1"] },
  });
  expect(result.output.ordinal).toBe(2);
  expect(tool.durable).toBe(true);
  expect((await run("# Second", "second")).output.ordinal).toBe(2);
});

test("refuses empty Markdown", () => {
  for (const markdown of ["", " \r\n\t"])
    expect(() => run(markdown)).toThrow("must not be empty");
  expect(current).toBeNull();
});

test("refuses Markdown over the size ceiling", async () => {
  await run("a".repeat(workpieceMarkdownByteCeiling));
  const previous = current;
  expect(() => run("é".repeat(workpieceMarkdownByteCeiling / 2 + 1))).toThrow(
    "ceiling",
  );
  expect(current).toBe(previous);
});

test("refuses lone surrogates instead of hashing replacement characters", () => {
  expect(() => run("# Invalid \ud800")).toThrow("well-formed Unicode");
  expect(current).toBeNull();
});

test("declares a non-terminating result", async () => {
  expect((await run("# Current")).terminate).toBe(false);
});

test("captures the persistent-state setter at render and writes from run", async () => {
  vi.mocked(usePersistentState).mockReturnValue([
    null,
    setRevision as StateSetter<unknown>,
  ]);
  const prompt = useBrunchAgent("anthropic/faux");
  expect(usePersistentState).toHaveBeenCalledWith(
    workpieceRevisionStateKey,
    null,
  );
  expect(current).toBeNull();
  const mounted = vi
    .mocked(useTool)
    .mock.calls.map(([definition]) => definition);
  expect(mounted.map((definition) => definition.name)).toContain(
    "brunch_mark_question",
  );
  const revisionTool = mounted.find(
    (definition) => definition.name === "update_workpiece",
  );
  expect(revisionTool).toBeDefined();
  vi.mocked(usePersistentState).mockImplementation(() => {
    throw new Error("Hook invoked outside render");
  });
  await revisionTool!.run({
    data: { markdown: "# Captured setter" },
    toolCallId: "from-run",
    log: { info: () => {}, warn: () => {}, error: () => {} },
  });
  expect(current).toMatchObject({
    revisionId: "from-run",
    markdown: "# Captured setter",
  });
  expect(prompt).not.toContain("# Captured setter");
});

test("exposes the one render's settled revision without registering another state authority", async () => {
  await run("# Settled", "settled");
  vi.mocked(usePersistentState).mockReturnValue([
    current,
    setRevision as StateSetter<unknown>,
  ]);
  const consume = vi.fn<NonNullable<Parameters<typeof useBrunchAgent>[2]>>();
  const prompt = useBrunchAgent("anthropic/faux", undefined, consume);
  expect(consume).toHaveBeenCalledExactlyOnceWith(current);
  expect(usePersistentState).toHaveBeenCalledTimes(1);
  expect(prompt).not.toContain("# Settled");
});

test("carries evidence without blessing support and rejects non-JSON values", () => {
  expect(() => run("# Current", "bad-evidence", { value: Infinity })).toThrow(
    "JSON-compatible",
  );
  expect(current).toBeNull();
});
