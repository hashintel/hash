import { createHash } from "node:crypto";

import { usePersistentState, useTool, type StateSetter } from "@flue/runtime";
import * as v from "valibot";
import { beforeEach, expect, test, vi } from "vitest";

import { useBrunchAgent } from "../src/flue";
import {
  deriveWorkpieceMutation,
  updateWorkpieceInputSchema,
} from "../src/update-workpiece";
import {
  workpieceRevisionStateKey,
  type WorkpieceRevision,
} from "../src/workpiece";
import {
  MUTATE_WORKPIECE_TOOL_NAME,
  updateWorkpieceOutputSchema,
  createMutateWorkpieceTool,
  createWorkpieceReadTool,
  workpieceMarkdownByteCeiling,
} from "../src/workpiece-tools";

// Only the Flue build packages skills; these tests exercise the hook around it.
vi.mock("@hashintel/brunch-agent/skills/elicitation/SKILL.md", () => ({
  default: { name: "elicitation" },
}));

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
const tool = createMutateWorkpieceTool(setRevision, {
  get currentRevision() {
    return current;
  },
  readSources: async () => [],
});
const runContext = {
  log: { info: () => {}, warn: () => {}, error: () => {} },
  step: {
    do: () => {
      throw new Error("State writes must not use a separate step checkpoint");
    },
  },
} as const;
const run = (
  markdown: string,
  toolCallId = "actual-tool-call",
  evidence?: unknown,
  baseRevisionId: string | null = current?.revisionId ?? null,
) =>
  tool.run({
    data: {
      markdown,
      evidence,
      baseRevisionId,
    } as Parameters<typeof tool.run>[0]["data"],
    toolCallId,
    ...runContext,
  });
const revisionPointer = (revision: WorkpieceRevision | null) =>
  revision === null
    ? null
    : {
        revisionId: revision.revisionId,
        sha256: revision.sha256,
        ordinal: revision.ordinal,
      };
const expectAppliedOutput = (output: unknown) => {
  expect(output).toMatchObject({
    disposition: "applied",
    applied: true,
  });
};
const expectRefusedResult = async (
  attempt:
    | Promise<{ output: unknown; terminate?: boolean }>
    | { output: unknown; terminate?: boolean },
  expected: {
    code:
      | "concurrent-revision"
      | "evidence-invalid"
      | "replay-conflict"
      | "retraction-invalid"
      | "silent-shrink"
      | "stale-base";
    message: RegExp;
    currentRevision: ReturnType<typeof revisionPointer>;
  },
) => {
  const result = await attempt;
  expect(result.terminate).toBe(false);
  if (
    typeof result.output !== "object" ||
    result.output === null ||
    !("message" in result.output) ||
    typeof result.output.message !== "string"
  ) {
    throw new Error("expected a refused mutate_workpiece message");
  }
  const { message, ...refusedFields } = result.output;
  expect(refusedFields).toEqual({
    disposition: "refused",
    applied: false,
    correctable: true,
    code: expected.code,
    currentRevision: expected.currentRevision,
  });
  expect(message).toMatch(expected.message);
  return result;
};

beforeEach(() => {
  current = null;
  vi.clearAllMocks();
});

test("returns revisionId equal to toolCallId and sha256 of the Markdown", async () => {
  const markdown = "  # Café\r\n\nUnknown.  ";
  const result = await run(markdown);
  expect(result).toEqual({
    output: {
      disposition: "applied",
      applied: true,
      revisionId: "actual-tool-call",
      sha256: createHash("sha256").update(markdown, "utf8").digest("hex"),
      ordinal: 1,
      mutation: deriveWorkpieceMutation(null, markdown),
    },
    terminate: false,
  });
  expect(current).toEqual({
    revisionId: "actual-tool-call",
    sha256: createHash("sha256").update(markdown, "utf8").digest("hex"),
    ordinal: 1,
    markdown,
  });
});

test("accepts retained pointer-only update output as applied", () => {
  expect(
    v.parse(updateWorkpieceOutputSchema, {
      revisionId: "retained-call",
      sha256: "a".repeat(64),
      ordinal: 1,
    }),
  ).toEqual({
    disposition: "applied",
    applied: true,
    revisionId: "retained-call",
    sha256: "a".repeat(64),
    ordinal: 1,
  });
});

test("accepts a typed refused update output", () => {
  expect(
    v.parse(updateWorkpieceOutputSchema, {
      disposition: "refused",
      applied: false,
      correctable: true,
      code: "silent-shrink",
      message: "Nothing was written",
      currentRevision: null,
    }),
  ).toEqual({
    disposition: "refused",
    applied: false,
    correctable: true,
    code: "silent-shrink",
    message: "Nothing was written",
    currentRevision: null,
  });
});

test("persists Markdown with the pointer", async () => {
  await run("# Account\n\nFirst", "first");
  const markdown = "# Account\n\nSecond";
  const result = await run(
    markdown,
    "second",
    [{ text: "Second", messageIds: [], kind: "default" }],
    "first",
  );
  expectAppliedOutput(result.output);
  const evidence = [
    { locator: { start: 11, end: 17 }, messageIds: [], kind: "default" },
  ];
  expect(result.output).toMatchObject({ evidence, evidenceValidated: true });
  expect(current).toEqual({
    revisionId: "second",
    sha256: createHash("sha256").update(markdown, "utf8").digest("hex"),
    ordinal: 2,
    markdown,
    evidence,
    evidenceValidated: true,
  });
  expect(result.output).toMatchObject({ ordinal: 2 });
  expect(tool.durable).toBe(true);
  const beforeReplay = current;
  expect(await run(markdown, "second", undefined, "second")).toMatchObject({
    output: { disposition: "applied", applied: true, ordinal: 2 },
  });
  expect(current).toBe(beforeReplay);
  expect(current?.evidence).toEqual(evidence);
});

test("records the exact changed window and refuses a stale cited base", async () => {
  const first = await run("# Account\n\nOne fact.", "first", undefined, null);
  const second = await run(
    "# Account\n\nOne changed fact.",
    "second",
    undefined,
    "first",
  );
  expectAppliedOutput(first.output);
  expectAppliedOutput(second.output);
  expect(second.output).toMatchObject({
    mutation: {
      baseRevisionId: "first",
      beforeSha256: (first.output as { sha256: string }).sha256,
      afterSha256: (second.output as { sha256: string }).sha256,
      removed: { utf16Length: 0 },
      inserted: { utf16Length: "changed ".length },
    },
  });
  await expectRefusedResult(
    run("# Account\n\nStale change.", "third", undefined, "first"),
    {
      code: "stale-base",
      message: /baseRevisionId/u,
      currentRevision: revisionPointer(current),
    },
  );
  expect(current).toMatchObject({
    revisionId: "second",
    ordinal: 2,
    markdown: "# Account\n\nOne changed fact.",
  });
});

test("refuses a revision that silently drops an existing heading", async () => {
  await run(
    "# Account\n\n## Purpose\n\nExplain the system.\n\n## Evidence\n\nOne source.",
    "base",
    [{ text: "One source.", messageIds: [], kind: "default" }],
  );
  const before = current;

  await expectRefusedResult(
    run(
      "# Account\n\n## Purpose\n\nExplain the system.",
      "collapsed",
      undefined,
      "base",
    ),
    {
      code: "silent-shrink",
      message:
        /missing heading.*## Evidence.*character delta.*Nothing was written/iu,
      currentRevision: revisionPointer(before),
    },
  );
  expect(current).toBe(before);

  await expectRefusedResult(
    run(
      "# Account\n\n## Purpose\n\nExplain the system.\n\n## Findings\n\nOne source.",
      "renamed",
      undefined,
      "base",
    ),
    {
      code: "silent-shrink",
      message: /missing heading.*## Evidence.*character delta: 0/iu,
      currentRevision: revisionPointer(before),
    },
  );
  expect(current).toBe(before);
});

test("refuses a same-length Setext heading rename", async () => {
  const beforeMarkdown = "# Account\n\nSection\n-------\n\nBody.";
  await run(beforeMarkdown, "setext-base");
  const before = current;

  await expectRefusedResult(
    run(
      beforeMarkdown.replace("Section", "Finding"),
      "setext-rename",
      undefined,
      "setext-base",
    ),
    {
      code: "silent-shrink",
      message: /missing heading.*## Section.*character delta: 0/iu,
      currentRevision: revisionPointer(before),
    },
  );
  expect(current).toBe(before);
});

test("does not treat hash-prefixed lines inside fenced code as headings", async () => {
  const before = [
    "# Account",
    "",
    "## Notes",
    "",
    "```text",
    "## generated label",
    "```",
  ].join("\n");
  await run(before, "base");

  await expect(
    run(
      before.replace("## generated label", "generated label"),
      "code-edit",
      undefined,
      "base",
    ),
  ).resolves.toMatchObject({
    output: {
      disposition: "applied",
      applied: true,
      revisionId: "code-edit",
      ordinal: 2,
    },
  });
});

test("refuses a revision that silently drops more than 25% of its content", async () => {
  const heading = "# Account\n\n## Purpose\n\n";
  await run(`${heading}${"a".repeat(120)}`, "base");
  const before = current;

  await expectRefusedResult(
    run(`${heading}${"a".repeat(60)}`, "collapsed", undefined, "base"),
    {
      code: "silent-shrink",
      message: /more than 25%.*character delta: -60.*Nothing was written/iu,
      currentRevision: revisionPointer(before),
    },
  );
  expect(current).toBe(before);
});

test("allows an unannounced edit at the 25% shrink boundary", async () => {
  await run(`# A\n${"a".repeat(96)}`, "base");

  await expect(
    run(`# A\n${"a".repeat(71)}`, "bounded-edit", undefined, "base"),
  ).resolves.toMatchObject({
    output: {
      disposition: "applied",
      applied: true,
      revisionId: "bounded-edit",
      ordinal: 2,
    },
  });
});

test("does not accept a free-text retraction without an authorized true-user source", async () => {
  const markdown =
    "# Account\n\n## Purpose\n\nOne purpose.\n\n## Evidence\n\nOne source.";
  await run(markdown, "base");
  const before = current;
  const guarded = createMutateWorkpieceTool(setRevision, {
    currentRevision: current,
    readSources: async () => [
      {
        id: "assistant-source",
        role: "assistant",
        purpose: "assistant",
        text: "Remove the evidence section.",
      },
    ],
  });

  await expectRefusedResult(
    guarded.run({
      data: {
        baseRevisionId: "base",
        markdown: "# Account\n\n## Purpose\n\nOne purpose.",
        retraction: {
          withdrawn: "evidence section",
          removedText: ["\n\n## Evidence\n\nOne source."],
          authorizationText: "Remove the evidence section.",
          messageIds: ["assistant-source"],
        },
      },
      toolCallId: "unauthorized-retraction",
      ...runContext,
    }),
    {
      code: "retraction-invalid",
      message: /Retraction.*authorized true-user source/iu,
      currentRevision: revisionPointer(before),
    },
  );
  expect(current).toBe(before);
});

test("settles and records a retraction authorized by a true-user source", async () => {
  const markdown =
    "# Account\n\n## Purpose\n\nOne purpose.\n\n## Evidence\n\nOne source.";
  await run(markdown, "base");
  const retraction = {
    withdrawn: "evidence section",
    removedText: ["\n\n## Evidence\n\nOne source."],
    authorizationText: "Remove the evidence section.",
    messageIds: ["user-retraction"],
  };
  const guarded = createMutateWorkpieceTool(setRevision, {
    currentRevision: current,
    readSources: async () => [
      {
        id: "user-retraction",
        role: "user",
        purpose: "user",
        text: "Remove the evidence section.",
      },
    ],
  });

  const result = await guarded.run({
    data: {
      baseRevisionId: "base",
      markdown: "# Account\n\n## Purpose\n\nOne purpose.",
      retraction,
    },
    toolCallId: "authorized-retraction",
    log: { info: () => {}, warn: () => {}, error: () => {} },
    step: {
      do: () => {
        throw new Error("No separate state checkpoint");
      },
    },
  });

  expect(result.output).toMatchObject({
    disposition: "applied",
    applied: true,
    revisionId: "authorized-retraction",
    ordinal: 2,
    retraction,
  });
  expect(current).toMatchObject({
    revisionId: "authorized-retraction",
    ordinal: 2,
    retraction,
  });
});

test("does not accept a retraction linked to unrelated true-user text", async () => {
  const markdown =
    "# Account\n\n## Purpose\n\nOne purpose.\n\n## Evidence\n\nOne source.";
  await run(markdown, "base");
  const before = current;
  const guarded = createMutateWorkpieceTool(setRevision, {
    currentRevision: current,
    readSources: async () => [
      {
        id: "unrelated-user",
        role: "user",
        purpose: "user",
        text: "Reserve one crew.",
      },
    ],
  });

  await expectRefusedResult(
    guarded.run({
      data: {
        baseRevisionId: "base",
        markdown: "# Account\n\n## Purpose\n\nOne purpose.",
        retraction: {
          withdrawn: "evidence section",
          removedText: ["\n\n## Evidence\n\nOne source."],
          authorizationText: "Reserve one crew.",
          messageIds: ["unrelated-user"],
        },
      },
      toolCallId: "unrelated-retraction",
      ...runContext,
    }),
    {
      code: "retraction-invalid",
      message: /authorization text.*withdrawn material/iu,
      currentRevision: revisionPointer(before),
    },
  );
  expect(current).toBe(before);
});

test("does not let a size-loss retraction remove material other than its named excerpt", async () => {
  const prefix = "# Account\n\nObsolete note.\n\n";
  const suffix = "\n\nRetained conclusion.";
  await run(`${prefix}${"Detail. ".repeat(40)}${suffix}`, "base");
  const before = current;
  const guarded = createMutateWorkpieceTool(setRevision, {
    currentRevision: current,
    readSources: async () => [
      {
        id: "user-retraction",
        role: "user",
        purpose: "user",
        text: "Remove the Obsolete note.",
      },
    ],
  });

  await expectRefusedResult(
    guarded.run({
      data: {
        baseRevisionId: "base",
        markdown: `${prefix}${suffix}`,
        retraction: {
          withdrawn: "Obsolete note",
          removedText: ["Obsolete note."],
          authorizationText: "Remove the Obsolete note.",
          messageIds: ["user-retraction"],
        },
      },
      toolCallId: "misapplied-retraction",
      ...runContext,
    }),
    {
      code: "retraction-invalid",
      message: /removedText.*actually removed/iu,
      currentRevision: revisionPointer(before),
    },
  );
  expect(current).toBe(before);
});

test("does not let a small declared retraction cover a larger unrelated loss", async () => {
  const prefix = "# Account\n\nObsolete note.\n\n";
  const detail = "Unrelated retained detail. ".repeat(30);
  const suffix = "\n\nRetained conclusion.";
  await run(`${prefix}${detail}${suffix}`, "base");
  const before = current;
  const guarded = createMutateWorkpieceTool(setRevision, {
    currentRevision: current,
    readSources: async () => [
      {
        id: "user-retraction",
        role: "user",
        purpose: "user",
        text: "Remove the Obsolete note.",
      },
    ],
  });

  await expectRefusedResult(
    guarded.run({
      data: {
        baseRevisionId: "base",
        markdown: `# Account${suffix}`,
        retraction: {
          withdrawn: "Obsolete note",
          removedText: ["\n\nObsolete note."],
          authorizationText: "Remove the Obsolete note.",
          messageIds: ["user-retraction"],
        },
      },
      toolCallId: "underdeclared-retraction",
      ...runContext,
    }),
    {
      code: "retraction-invalid",
      message: /accounts for .* removed characters/iu,
      currentRevision: revisionPointer(before),
    },
  );
  expect(current).toBe(before);
});

test("requires an explicit base for every workpiece mutation", () => {
  expect(
    v.safeParse(updateWorkpieceInputSchema, { markdown: "# First" }).success,
  ).toBe(false);
  expect(
    v.safeParse(updateWorkpieceInputSchema, {
      markdown: "# First",
      baseRevisionId: null,
    }).success,
  ).toBe(true);
});

test("replays an already-applied mutation without replacing its settled state", async () => {
  await run("# First", "replayed", undefined, null);
  const beforeReplay = current;
  await expect(
    run("# First", "replayed", undefined, null),
  ).resolves.toMatchObject({
    output: {
      disposition: "applied",
      applied: true,
      revisionId: "replayed",
      ordinal: 1,
    },
  });
  expect(current).toBe(beforeReplay);

  await expectRefusedResult(run("# Altered", "replayed", undefined, null), {
    code: "replay-conflict",
    message: /replay.*different Markdown/iu,
    currentRevision: revisionPointer(beforeReplay),
  });
  expect(current).toBe(beforeReplay);
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
  vi.mocked(usePersistentState).mockImplementation(() => {
    throw new Error("Hook invoked outside render");
  });
  await revisionTool!.run({
    data: { markdown: "# Captured setter", baseRevisionId: null },
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
  expect(current).toBeNull();
  await expectRefusedResult(
    run("# Current", "bad-source", [
      { text: "# Current", kind: "elicited", messageIds: ["not-authorized"] },
    ]),
    {
      code: "evidence-invalid",
      message: /authorized true-user/u,
      currentRevision: null,
    },
  );
  expect(current).toBeNull();
});

test.each(["carried-source", "later-explicit-span", "state-drift"] as const)(
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
    const guarded = createMutateWorkpieceTool(setRevision, {
      currentRevision: previous,
      readSources: async () => {
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
    const attempt = guarded.run({
      data: {
        baseRevisionId: "previous",
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
      ...runContext,
    });
    await expectRefusedResult(attempt, {
      code: failure === "state-drift" ? "stale-base" : "evidence-invalid",
      message:
        failure === "carried-source"
          ? /authorized true-user/iu
          : failure === "later-explicit-span"
            ? /must occur exactly once/iu
            : /baseRevisionId|changed while this revision was prepared/iu,
      currentRevision: revisionPointer(expectedState),
    });
    expect(current).toBe(expectedState);
    expect(current.evidence).toEqual(evidence);
  },
);

test("rejects cancellation atomically while carrying overlapping relations", async () => {
  const markdown = "# Account\nReserve one crew.";
  const locator = { start: 10, end: markdown.length };
  const evidence = [
    {
      locator,
      messageIds: ["user-1"],
      kind: "elicited" as const,
    },
    {
      locator,
      messageIds: ["user-2"],
      kind: "formalism-constraint" as const,
    },
  ];
  const previous: WorkpieceRevision = {
    revisionId: "previous",
    sha256: createHash("sha256").update(markdown).digest("hex"),
    ordinal: 1,
    markdown,
    evidence,
    evidenceValidated: true,
  };
  current = previous;
  const controller = new AbortController();
  const guarded = createMutateWorkpieceTool(setRevision, {
    currentRevision: previous,
    readSources: async () => {
      controller.abort();
      return [
        {
          id: "user-1",
          role: "user",
          purpose: "user",
          text: "Reserve one crew.",
        },
        {
          id: "user-2",
          role: "user",
          purpose: "user",
          text: "Second source",
        },
      ];
    },
  });
  await expect(
    guarded.run({
      data: {
        baseRevisionId: "previous",
        markdown: `${markdown}\nUnrelated context.`,
      },
      toolCallId: "cancelled-carry",
      signal: controller.signal,
      ...runContext,
    }),
  ).rejects.toThrow(/abort/iu);
  expect(current).toBe(previous);
  expect(current.evidence).toEqual(evidence);
});

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
  await expectRefusedResult(
    guarded.run({
      data: { markdown: "# Candidate", baseRevisionId: "previous" },
      toolCallId: "candidate",
      ...runContext,
    }),
    {
      code: "stale-base",
      message: /baseRevisionId/iu,
      currentRevision: {
        revisionId: "concurrent",
        sha256: previous.sha256,
        ordinal: 2,
      },
    },
  );
  expect(current.revisionId).toBe("concurrent");
});

test("refuses a concurrent snapshot while the cited base still names current state", async () => {
  const previous: WorkpieceRevision = {
    revisionId: "actual-current",
    sha256: createHash("sha256").update("# Current").digest("hex"),
    ordinal: 2,
    markdown: "# Current",
  };
  current = previous;
  const guarded = createMutateWorkpieceTool(setRevision, {
    currentRevision: {
      ...previous,
      revisionId: "stale-snapshot",
      ordinal: 1,
    },
    readSources: async () => [],
  });

  await expectRefusedResult(
    guarded.run({
      data: { markdown: "# Next", baseRevisionId: "actual-current" },
      toolCallId: "concurrent-candidate",
      ...runContext,
    }),
    {
      code: "concurrent-revision",
      message: /changed while this revision was prepared/iu,
      currentRevision: revisionPointer(previous),
    },
  );
  expect(current).toBe(previous);
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
    data: { markdown: "# Do not settle", baseRevisionId: null },
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
  expectAppliedOutput(result.output);
  const evidence = (
    result.output as { evidence: { locator: { start: number; end: number } }[] }
  ).evidence;
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
  const refused = await expectRefusedResult(attempt, {
    code: "evidence-invalid",
    message:
      /evidence\[1\] matched 2 occurrence\(s\); set occurrence to select one; evidence\[2\] matched 0 occurrence\(s\); evidence\[3\] matched 2 occurrence\(s\); occurrence 2 is out of range\. Nothing was written/u,
    currentRevision: revisionPointer(before),
  });
  expect((refused.output as { message: string }).message).not.toMatch(
    /evidence\[0\]|evidence\[4\]/u,
  );
  expect(current).toBe(before);
  expect(
    v.safeParse(updateWorkpieceInputSchema, {
      baseRevisionId: "base",
      markdown,
      evidence: [{ text: "", messageIds: [], kind: "default" }],
    }).success,
  ).toBe(false);
  expect(
    v.safeParse(updateWorkpieceInputSchema, {
      baseRevisionId: "base",
      markdown,
      evidence: [
        { text: "Once.", occurrence: -1, messageIds: [], kind: "default" },
      ],
    }).success,
  ).toBe(false);
  expect(
    v.safeParse(updateWorkpieceInputSchema, {
      baseRevisionId: "base",
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
  expectAppliedOutput(result.output);
  const carriedEvidence = [relation(third.indexOf(passage))];
  expect(result.output).toMatchObject({
    evidence: carriedEvidence,
  });
  expect(current).toMatchObject({
    revisionId: "third",
    evidence: carriedEvidence,
    evidenceValidated: true,
  });

  // Unchanged unique text at the same span carries without a declaration.
  await settle(`${third}\nTail.`, "fourth", undefined, "third");
  expect(current?.evidence).toEqual(carriedEvidence);
});
