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
    data: { markdown, evidence } as Parameters<typeof tool.run>[0]["data"],
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
  const evidence = [
    { locator: { start: 0, end: 8 }, messageIds: [], kind: "default" },
  ];
  const result = await run("# Second", "second", evidence);
  expect(current).toEqual({
    ...result.output,
    markdown: "# Second",
    evidence,
    evidenceValidated: true,
  });
  expect(result.output.ordinal).toBe(2);
  expect(tool.durable).toBe(true);
  expect((await run("# Second", "second")).output.ordinal).toBe(2);
});

test("refuses empty Markdown", async () => {
  await Promise.all(
    ["", " \r\n\t"].map((markdown) =>
      expect(run(markdown)).rejects.toThrow("must not be empty"),
    ),
  );
  expect(current).toBeNull();
});

test("refuses Markdown over the size ceiling", async () => {
  await run("a".repeat(workpieceMarkdownByteCeiling));
  const previous = current;
  await expect(
    run("é".repeat(workpieceMarkdownByteCeiling / 2 + 1)),
  ).rejects.toThrow("ceiling");
  expect(current).toBe(previous);
});

test("refuses lone surrogates instead of hashing replacement characters", async () => {
  await expect(run("# Invalid \ud800")).rejects.toThrow("well-formed Unicode");
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
  expect(prompt).toContain(
    "Call `update_workpiece` with the full current Markdown account",
  );
  expect(prompt).toContain("as soon as one consequential distinction exists");
  expect(prompt).toContain("after each useful stretch or correction");
  expect(prompt).toContain(
    "After settlement, call `brunch_workpiece` when available",
  );
  expect(revisionTool?.description).toContain(
    "Create the first partial workpiece",
  );
  expect(revisionTool?.description).toContain(
    "update after each useful stretch or correction",
  );
  expect(revisionTool?.description).toContain(
    "Never combine it with browser construction in one batch",
  );
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

test("rejects unstructured or unauthorized evidence before writing state", async () => {
  await expect(
    run("# Current", "bad-evidence", { value: Infinity }),
  ).rejects.toThrow(/array/iu);
  await expect(
    run("# Current", "bad-source", [
      {
        locator: { start: 0, end: 9 },
        kind: "elicited",
        messageIds: ["not-authorized"],
      },
    ]),
  ).rejects.toThrow("authorized true-user");
  expect(current).toBeNull();
});

test.each([
  "carried-source",
  "later-explicit-span",
  "cancellation",
  "state-drift",
] as const)(
  "refuses %s atomically while carrying overlapping relations",
  async (failure) => {
    const markdown = "# Account\nReserve one crew.";
    const locator = { start: 10, end: markdown.length };
    const elicited = {
      locator,
      messageIds: ["user-1"],
      kind: "elicited" as const,
    };
    const formalism = {
      locator,
      messageIds: ["user-2"],
      kind: "formalism-constraint" as const,
    };
    const evidence = [elicited, formalism];
    const previous: WorkpieceRevision = {
      revisionId: "previous",
      sha256: createHash("sha256").update(markdown).digest("hex"),
      ordinal: 1,
      markdown,
      evidence,
      evidenceValidated: true,
    };
    current = previous;
    let expectedState = previous;
    const controller = new AbortController();
    const guarded = createUpdateWorkpieceTool(setRevision, {
      currentRevision: previous,
      readSources: async () => {
        if (failure === "cancellation") controller.abort();
        if (failure === "state-drift") {
          expectedState = { ...previous, revisionId: "concurrent", ordinal: 2 };
          current = expectedState;
        }
        return [
          {
            id: "user-1",
            role: "user",
            purpose: "user",
            text: "Reserve one crew.",
          },
          {
            id: "user-2",
            role: failure === "carried-source" ? "assistant" : "user",
            purpose: "user",
            text: "Second source",
          },
        ];
      },
    });
    await expect(
      guarded.run({
        data: {
          markdown: `${markdown}\nUnrelated context.`,
          ...(failure === "later-explicit-span"
            ? {
                evidence: [
                  elicited,
                  { ...formalism, locator: { start: 0, end: 1000 } },
                ],
              }
            : {}),
        },
        toolCallId: "refused-carry",
        signal: controller.signal,
        log: { info: () => {}, warn: () => {}, error: () => {} },
        step: {
          do: () => {
            throw new Error("No separate state checkpoint");
          },
        },
      }),
    ).rejects.toThrow(
      /authorized true-user|outside the immutable revision|abort|changed during evidence validation/iu,
    );
    expect(current).toBe(expectedState);
    expect(current.evidence).toEqual(evidence);
  },
);

test("an acquisition refusal or cancellation cannot settle even an evidence-absent revision", async () => {
  const controller = new AbortController();
  const cancelled = createUpdateWorkpieceTool(setRevision, {
    currentRevision: null,
    readSources: async () => {
      controller.abort();
      return [];
    },
  });
  const context = {
    data: { markdown: "# Do not settle" },
    toolCallId: "cancelled",
    signal: controller.signal,
    step: {
      do: () => {
        throw new Error("State must not use a separate checkpoint");
      },
    },
    log: { info: () => {}, warn: () => {}, error: () => {} },
  };
  await expect(cancelled.run(context)).rejects.toThrow(/abort/iu);
  expect(current).toBeNull();
  const refused = createUpdateWorkpieceTool(setRevision, {
    currentRevision: null,
    readSources: async () => {
      throw new Error("Current state missing");
    },
  });
  await expect(
    refused.run({ ...context, signal: new AbortController().signal }),
  ).rejects.toThrow("Current state missing");
  expect(current).toBeNull();
});
