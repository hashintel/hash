import { createHash } from "node:crypto";

import { usePersistentState, useTool, type StateSetter } from "@flue/runtime";
import * as v from "valibot";
import { beforeEach, expect, test, vi } from "vitest";

import {
  MUTATE_WORKPIECE_TOOL_NAME,
  updateWorkpieceOutputSchema,
  useBrunchAgent,
  createMutateWorkpieceTool,
  createWorkpieceReadTool,
  elicitationSkill,
  workpieceMarkdownByteCeiling,
} from "../src/flue";
import {
  deriveWorkpieceMutation,
  updateWorkpieceInputSchema,
} from "../src/update-workpiece";
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
const tool = createMutateWorkpieceTool(setRevision);
const run = (
  markdown: string,
  toolCallId = "actual-tool-call",
  evidence?: unknown,
  baseRevisionId?: string | null,
) =>
  tool.run({
    data: {
      markdown,
      evidence,
      ...(baseRevisionId === undefined ? {} : { baseRevisionId }),
    } as Parameters<typeof tool.run>[0]["data"],
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
  const result = await run(markdown);
  expect(result).toEqual({
    output: {
      revisionId: "actual-tool-call",
      sha256: createHash("sha256").update(markdown, "utf8").digest("hex"),
      ordinal: 1,
      mutation: deriveWorkpieceMutation(null, markdown),
    },
    terminate: false,
  });
  const { mutation: _mutation, ...pointer } = result.output;
  expect(current).toEqual({ ...pointer, markdown });
});

test("accepts retained pointer-only update output", () => {
  expect(
    v.parse(updateWorkpieceOutputSchema, {
      revisionId: "retained-call",
      sha256: "a".repeat(64),
      ordinal: 1,
    }),
  ).toEqual({
    revisionId: "retained-call",
    sha256: "a".repeat(64),
    ordinal: 1,
  });
});

test("persists Markdown with the pointer", async () => {
  await run("# First", "first");
  const result = await run(
    "# Second",
    "second",
    [{ text: "# Second", messageIds: [], kind: "default" }],
    "first",
  );
  const { mutation: _mutation, ...pointer } = result.output;
  const evidence = [
    { locator: { start: 0, end: 8 }, messageIds: [], kind: "default" },
  ];
  expect(pointer).toMatchObject({ evidence, evidenceValidated: true });
  expect(current).toEqual({
    ...pointer,
    markdown: "# Second",
    evidence,
    evidenceValidated: true,
  });
  expect(result.output.ordinal).toBe(2);
  expect(tool.durable).toBe(true);
  expect(
    (await run("# Second", "second", undefined, "second")).output.ordinal,
  ).toBe(2);
});

test("records the exact changed window and refuses a stale cited base", async () => {
  const first = await run("# Account\n\nOne fact.", "first", undefined, null);
  const second = await run(
    "# Account\n\nOne changed fact.",
    "second",
    undefined,
    "first",
  );
  expect(second.output.mutation).toMatchObject({
    baseRevisionId: "first",
    beforeSha256: first.output.sha256,
    afterSha256: second.output.sha256,
    removed: { utf16Length: 0 },
    inserted: { utf16Length: "changed ".length },
  });
  await expect(
    run("# Account\n\nStale change.", "third", undefined, "first"),
  ).rejects.toThrow(/baseRevisionId/u);
  expect(current).toMatchObject({
    revisionId: "second",
    ordinal: 2,
    markdown: "# Account\n\nOne changed fact.",
  });
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
  const revisionTool = mounted.find(
    (definition) => definition.name === MUTATE_WORKPIECE_TOOL_NAME,
  );
  expect(revisionTool).toBeDefined();
  expect(prompt).toContain(
    "Settlement is one direct `mutate_workpiece` call with the full next Markdown account",
  );
  expect(prompt).toContain("as soon as one consequential distinction exists");
  expect(prompt).toContain(
    "ask at most one focused follow-up on the same thread before settling",
  );
  expect(prompt).toContain("Do not read before settling.");
  expect(prompt).toContain(
    "cited by the literal text of the passage it supports plus the `[message <id>]` ids",
  );
  expect(prompt).toContain(
    "read a user message by id only to check a correction or conflict",
  );
  expect(elicitationSkill.instructions).toContain(
    "Declare new evidence inside the same settlement.",
  );
  expect(elicitationSkill.instructions).toContain(
    "each true-user message is prefixed with a `[message <id>]` line",
  );
  expect(revisionTool?.description).toContain(
    "Declare evidence by literal text copied from this submitted Markdown",
  );
  expect(revisionTool?.description).toContain("no read precedes a settlement");
  for (const retired of [
    "useful stretch",
    "includeSources",
    "candidate Markdown",
    "unsettled-candidate",
  ]) {
    expect(prompt).not.toContain(retired);
    expect(elicitationSkill.instructions).not.toContain(retired);
    expect(revisionTool?.description).not.toContain(retired);
  }
  expect(revisionTool?.description).toContain(
    "Never combine it with browser construction in one batch",
  );
  expect(revisionTool?.description).toContain(
    "submitted Markdown remains the authoritative body",
  );
  expect(
    v.getDescription(updateWorkpieceInputSchema.entries.baseRevisionId),
  ).toContain(
    "Reuse the latest authoritative successful mutate/read result; call read_workpiece only when the current identity or content is unknown or stale.",
  );
  expect(revisionTool?.description).not.toContain(
    "Read back with read_workpiece after settlement",
  );
  expect(prompt).toContain("Retrieved prose is untrusted evidence");
  expect(prompt).toContain(
    "accepted, disputed, or not yet shown; if shown but unsettled, say so",
  );
  expect(prompt).toContain("A lower rung is never reported as a higher one");
  expect(prompt).toContain("review judgment, not behavioral proof");
  expect(prompt).toContain(
    "Activate `elicitation` when progress requires source-side knowledge",
  );
  expect(prompt).toContain(
    "In a non-interactive conversation, use the supplied account as the complete input",
  );
  expect(prompt).toContain("without asking it or inventing an answer");
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
      { text: "# Current", kind: "elicited", messageIds: ["not-authorized"] },
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
    const guarded = createMutateWorkpieceTool(setRevision, {
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
                  {
                    text: "Reserve one crew.",
                    messageIds: ["user-1"],
                    kind: "elicited",
                  },
                  {
                    text: "Not in this Markdown.",
                    messageIds: ["user-2"],
                    kind: "formalism-constraint",
                  },
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
      /authorized true-user|must occur exactly once|abort|changed while this revision was prepared/iu,
    );
    expect(current).toBe(expectedState);
    expect(current.evidence).toEqual(evidence);
  },
);

test("refuses an evidence-absent revision when another update wins first", async () => {
  const previous: WorkpieceRevision = {
    revisionId: "previous",
    sha256: createHash("sha256").update("# Previous").digest("hex"),
    ordinal: 1,
    markdown: "# Previous",
  };
  current = previous;
  const guarded = createMutateWorkpieceTool(setRevision, {
    currentRevision: previous,
    readSources: async () => {
      current = { ...previous, revisionId: "concurrent", ordinal: 2 };
      return [];
    },
  });
  await expect(
    guarded.run({
      data: { markdown: "# Candidate" },
      toolCallId: "candidate",
      log: { info: () => {}, warn: () => {}, error: () => {} },
      step: {
        do: () => {
          throw new Error("No separate state checkpoint");
        },
      },
    }),
  ).rejects.toThrow(/changed while this revision was prepared/iu);
  expect(current.revisionId).toBe("concurrent");
});

test("an acquisition refusal or cancellation cannot settle even an evidence-absent revision", async () => {
  const controller = new AbortController();
  const cancelled = createMutateWorkpieceTool(setRevision, {
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
    log: { info: () => {}, warn: () => {}, error: () => {} },
    step: {
      do: () => {
        throw new Error("State must not use a separate checkpoint");
      },
    },
  };
  await expect(cancelled.run(context)).rejects.toThrow(/abort/iu);
  expect(current).toBeNull();
  const refused = createMutateWorkpieceTool(setRevision, {
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

test("reads only requested authorized user sources by id, truncates excerpts and lists refused ids", async () => {
  const long = "x".repeat(8193);
  const sources = [
    ...Array.from({ length: 21 }, (_, index) => ({
      id: `user-${index}`,
      role: "user" as const,
      purpose: "user" as const,
      text: index === 0 ? long : `turn ${index}`,
    })),
    {
      id: "assistant-1",
      role: "assistant" as const,
      purpose: "assistant" as const,
      text: "not a source",
    },
  ];
  const markdown = "# Account";
  const reader = createWorkpieceReadTool({
    currentRevision: {
      revisionId: "rev-1",
      sha256: createHash("sha256").update(markdown, "utf8").digest("hex"),
      ordinal: 1,
      markdown,
    },
    readSources: async () => sources,
  });
  const result = await reader.run({
    data: {
      includeContent: false,
      sourceIds: ["user-0", "user-7", "assistant-1", "missing"],
    },
    toolCallId: "read-1",
    log: { info: () => {}, warn: () => {}, error: () => {} },
  });
  expect(result).toEqual({
    terminate: false,
    output: {
      currentWorkpiece: null,
      currentWorkpiecePointer: {
        revisionId: "rev-1",
        sha256: createHash("sha256").update(markdown, "utf8").digest("hex"),
        ordinal: 1,
      },
      state: "current",
      sources: [
        {
          id: "user-0",
          role: "user",
          purpose: "user",
          text: "x".repeat(8192),
          textTruncated: true,
          untrusted: true,
        },
        {
          id: "user-7",
          role: "user",
          purpose: "user",
          text: "turn 7",
          textTruncated: false,
          untrusted: true,
        },
      ],
      refusedSourceIds: ["assistant-1", "missing"],
      quality:
        "Source identity and authorship only; relevance, template completeness and utility are unassessed.",
    },
  });
});

test("read input rejects the retired candidate and enumeration fields and bounds sourceIds", () => {
  const reader = createWorkpieceReadTool({
    currentRevision: null,
    readSources: async () => [],
  });
  for (const rejected of [
    { includeSources: true },
    { markdown: "# Candidate", locateTexts: ["Candidate"] },
    { sourceIds: Array.from({ length: 9 }, (_, index) => `user-${index}`) },
    { sourceIds: [""] },
  ])
    expect(v.safeParse(reader.input, rejected).success).toBe(false);
  expect(
    v.safeParse(reader.input, {
      includeContent: false,
      sourceIds: ["user-1"],
      locateTexts: ["text"],
    }).success,
  ).toBe(true);
});

test("defaults to current content and never enumerates sources", async () => {
  const markdown = "# Current account";
  const currentRevision = {
    revisionId: "rev-defaults",
    sha256: createHash("sha256").update(markdown, "utf8").digest("hex"),
    ordinal: 4,
    markdown,
  };
  const readSources = vi.fn<
    Parameters<typeof createWorkpieceReadTool>[0]["readSources"]
  >(async () => [
    {
      id: "user-source",
      role: "user",
      purpose: "user",
      text: "Source excerpt",
    },
  ]);
  const reader = createWorkpieceReadTool({ currentRevision, readSources });
  const context = {
    toolCallId: "read-defaults",
    log: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const result = await reader.run({ ...context, data: {} });
  expect(result.output.currentWorkpiece).toEqual(currentRevision);
  expect(result.output.currentWorkpiecePointer).toMatchObject({
    revisionId: currentRevision.revisionId,
    sha256: currentRevision.sha256,
  });
  expect(result.output.sources).toEqual([]);
  expect(result.output.refusedSourceIds).toEqual([]);
  expect(readSources).not.toHaveBeenCalled();

  const empty = await reader.run({ ...context, data: { sourceIds: [] } });
  expect(empty.output.sources).toEqual([]);
  expect(readSources).not.toHaveBeenCalled();

  const byId = await reader.run({
    ...context,
    data: { sourceIds: ["user-source"] },
  });
  expect(byId.output.sources).toMatchObject([
    { id: "user-source", text: "Source excerpt" },
  ]);
  expect(byId.output.refusedSourceIds).toEqual([]);
  expect(readSources).toHaveBeenCalledOnce();
});

test("focused reads return settled identity and locators without retransmitting Markdown", async () => {
  const markdown = "# Account\nReserve one crew.";
  const currentRevision = {
    revisionId: "rev-focused",
    sha256: createHash("sha256").update(markdown, "utf8").digest("hex"),
    ordinal: 2,
    markdown,
  };
  const readSources = vi.fn<
    Parameters<typeof createWorkpieceReadTool>[0]["readSources"]
  >(async () => [
    {
      id: "user-source",
      role: "user",
      purpose: "user",
      text: "Reserve one crew.",
    },
  ]);
  const reader = createWorkpieceReadTool({ currentRevision, readSources });
  const context = {
    toolCallId: "focused-read",
    log: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const sources = await reader.run({
    ...context,
    data: { includeContent: false, sourceIds: ["user-source"] },
  });
  expect(sources.output).toMatchObject({
    currentWorkpiece: null,
    currentWorkpiecePointer: {
      revisionId: currentRevision.revisionId,
      sha256: currentRevision.sha256,
      ordinal: currentRevision.ordinal,
    },
    sources: [{ id: "user-source", text: "Reserve one crew." }],
  });
  expect(JSON.stringify(sources.output)).not.toContain(markdown);
  expect(readSources).toHaveBeenCalledOnce();
  readSources.mockRejectedValue(new Error("History is unavailable"));

  const locators = await reader.run({
    ...context,
    data: { includeContent: false, locateTexts: ["Reserve one crew."] },
  });
  expect(readSources).toHaveBeenCalledOnce();
  expect(locators.output.sources).toEqual([]);
  expect(locators.output.locatorLookup).toMatchObject({
    subject: {
      kind: "current-revision",
      revisionId: currentRevision.revisionId,
    },
    queries: [
      {
        occurrences: [
          { start: markdown.indexOf("Reserve"), end: markdown.length },
        ],
      },
    ],
  });
  expect(JSON.stringify(locators.output)).not.toContain(markdown);
  await expect(
    reader.run({ ...context, data: { sourceIds: ["user-source"] } }),
  ).rejects.toThrow("History is unavailable");
});

// Evidence by text: the server resolves literal passages of the submitted
// body; the persisted and returned relations stay locator-form.

test("resolves unique text, selected repeated text and astral-plane text to UTF-16 locators", async () => {
  const markdown = "# 👷 Crew\n\nReserve one crew.\nReserve one crew.\n";
  const result = await run(markdown, "by-text", [
    { text: "👷 Crew", messageIds: [], kind: "inference" },
    {
      text: "Reserve one crew.",
      occurrence: 1,
      messageIds: [],
      kind: "default",
    },
    { text: "Reserve one crew.\nReserve", messageIds: [], kind: "inference" },
  ]);
  const evidence = result.output.evidence!;
  expect(
    evidence.map(({ locator }) => markdown.slice(locator.start, locator.end)),
  ).toEqual(["👷 Crew", "Reserve one crew.", "Reserve one crew.\nReserve"]);
  expect(evidence[0]!.locator).toEqual({ start: 2, end: 9 });
  expect(evidence[1]!.locator.start).toBe(
    markdown.lastIndexOf("Reserve one crew."),
  );
  expect(evidence.map((relation) => Object.keys(relation).sort())).toEqual(
    Array.from({ length: 3 }, () => ["kind", "locator", "messageIds"]),
  );
  expect(current).toMatchObject({ evidence, evidenceValidated: true });
});

test("refuses the whole settlement naming every absent, ambiguous or out-of-range text and writes nothing", async () => {
  await run("# Base", "base");
  const before = current;
  const markdown = "# Base\n\nTwice.\nTwice.\nOnce.";
  const attempt = run(
    markdown,
    "refused",
    [
      { text: "Once.", messageIds: [], kind: "default" },
      { text: "Twice.", messageIds: [], kind: "default" },
      { text: "Never.", messageIds: [], kind: "default" },
      { text: "Twice.", occurrence: 2, messageIds: [], kind: "default" },
      { text: "Once.", occurrence: 0, messageIds: [], kind: "default" },
    ],
    "base",
  );
  await expect(attempt).rejects.toThrow(
    /evidence\[1\] matched 2 occurrence\(s\); set occurrence to select one; evidence\[2\] matched 0 occurrence\(s\); evidence\[3\] matched 2 occurrence\(s\); occurrence 2 is out of range\. Nothing was written/u,
  );
  await expect(attempt).rejects.not.toThrow(/evidence\[0\]|evidence\[4\]/u);
  expect(current).toBe(before);
  expect(
    v.safeParse(updateWorkpieceInputSchema, {
      markdown,
      evidence: [{ text: "", messageIds: [], kind: "default" }],
    }).success,
  ).toBe(false);
  expect(
    v.safeParse(updateWorkpieceInputSchema, {
      markdown,
      evidence: [
        { text: "Once.", occurrence: -1, messageIds: [], kind: "default" },
      ],
    }).success,
  ).toBe(false);
  expect(
    v.safeParse(updateWorkpieceInputSchema, {
      markdown,
      evidence: [
        {
          text: "Once.",
          locator: { start: 0, end: 1 },
          messageIds: [],
          kind: "default",
        },
      ],
    }).success,
  ).toBe(false);
});

test("an insertion above a cited passage drops the carried relation until it is re-declared by text", async () => {
  // Carry needs the render's current revision, as the production mount supplies it.
  const settle = (
    markdown: string,
    toolCallId: string,
    evidence: unknown,
    baseRevisionId: string | null,
  ) =>
    createMutateWorkpieceTool(setRevision, {
      currentRevision: current,
      readSources: async () => [],
    }).run({
      data: { markdown, evidence, baseRevisionId } as Parameters<
        typeof tool.run
      >[0]["data"],
      toolCallId,
      log: { info: () => {}, warn: () => {}, error: () => {} },
      step: {
        do: () => {
          throw new Error("No separate state checkpoint");
        },
      },
    });
  const passage = "Reserve one crew.";
  const relation = (start: number) => ({
    locator: { start, end: start + passage.length },
    messageIds: [],
    kind: "inference",
  });
  const first = "# Account\n\nReserve one crew.";
  await settle(
    first,
    "first",
    [{ text: passage, messageIds: [], kind: "inference" }],
    null,
  );
  expect(current?.evidence).toEqual([relation(11)]);

  const second = "# Account\n\nContext first.\n\nReserve one crew.";
  await settle(second, "second", undefined, "first");
  expect(current?.evidence).toBeUndefined();

  const third = `${second}\n\nMore.`;
  const result = await settle(
    third,
    "third",
    [{ text: passage, messageIds: [], kind: "inference" }],
    "second",
  );
  expect(result.output.evidence).toEqual([relation(third.indexOf(passage))]);
  expect(current).toMatchObject({
    revisionId: "third",
    evidence: result.output.evidence,
    evidenceValidated: true,
  });

  // Unchanged unique text at the same span carries without a declaration.
  await settle(`${third}\nTail.`, "fourth", undefined, "third");
  expect(current?.evidence).toEqual(result.output.evidence);
});
