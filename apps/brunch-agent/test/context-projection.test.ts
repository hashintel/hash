import { createHash } from "node:crypto";

import { expect, test } from "vitest";

import { CLIENT_TOOL_RESULT_SIGNAL } from "@hashintel/brunch-agent-transport-aisdk";

import {
  createBrunchContextProjection,
  projectBrunchContext,
} from "../src/agents/chat-agent/context-projection";

import type { ContextProjection, ContextProjectionEntry } from "@flue/runtime";

const markdown = "# Account\n\nAuthoritative content.";
const sha256 = createHash("sha256").update(markdown).digest("hex");

const entries = (): ContextProjectionEntry[] => [
  {
    id: "call",
    message: {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "mutation",
          name: "mutate_workpiece",
          arguments: { markdown, baseRevisionId: null },
        },
      ],
    },
  },
  {
    id: "mutation-result",
    message: {
      role: "toolResult",
      toolCallId: "mutation",
      toolName: "mutate_workpiece",
      isError: false,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            revisionId: "mutation",
            sha256,
            ordinal: 1,
            markdown,
          }),
        },
      ],
    },
  },
  {
    id: "read-result",
    message: {
      role: "toolResult",
      toolCallId: "read",
      toolName: "read_workpiece",
      isError: false,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            currentWorkpiece: {
              revisionId: "mutation",
              sha256,
              ordinal: 1,
              markdown,
            },
            state: "current",
            sources: [],
            quality: "identity only",
          }),
        },
      ],
    },
  },
];

test("preserves authored calls and retains one authoritative result body", () => {
  const input = entries();
  const before = structuredClone(input);
  const first = projectBrunchContext(input);
  const second = projectBrunchContext(input);

  expect(input).toEqual(before);
  expect(first).toEqual(second);
  expect(first[0]).toEqual(input[0]);
  const encodedMarkdown = JSON.stringify(markdown).slice(1, -1);
  expect(JSON.stringify(first).split(encodedMarkdown).length - 1).toBe(1);
  expect(JSON.stringify(first)).toContain("retainedEntryId");
  expect(JSON.stringify(first)).toContain('\\"retainedEntryId\\":\\"call\\"');
  expect(first.map((entry) => entry.id)).toEqual(
    input.map((entry) => entry.id),
  );
  for (const slice of [input.slice(1, 2), input.slice(2)]) {
    const projectedSlice = projectBrunchContext(slice);
    expect(JSON.stringify(projectedSlice)).not.toContain("markdownReference");
    expect(JSON.stringify(projectedSlice)).toContain(
      projectedSlice[0]?.id === "read-result"
        ? "markdownIdentity"
        : '\\"markdown\\"',
    );
    expect(
      projectedSlice[0]?.message.role === "toolResult"
        ? projectedSlice[0].message.content[0]
        : undefined,
    ).toMatchObject({ type: "text" });
    expect(
      JSON.stringify(
        JSON.parse(
          projectedSlice[0]?.message.role === "toolResult" &&
            projectedSlice[0].message.content[0]?.type === "text"
            ? projectedSlice[0].message.content[0].text
            : "{}",
        ),
      ),
    ).toContain("Authoritative content.");
  }
});

const settlementEntries = (
  revisionId: string,
  body: string,
  baseRevisionId: string | null,
): ContextProjectionEntry[] => {
  const bodySha256 = createHash("sha256").update(body).digest("hex");
  return [
    {
      id: `${revisionId}-call-entry`,
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: revisionId,
            name: "mutate_workpiece",
            arguments: { markdown: body, baseRevisionId },
          },
        ],
      },
    },
    {
      id: `${revisionId}-result-entry`,
      message: {
        role: "toolResult",
        toolCallId: revisionId,
        toolName: "mutate_workpiece",
        isError: false,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              revisionId,
              sha256: bodySha256,
              ordinal: baseRevisionId === null ? 1 : 2,
            }),
          },
        ],
      },
    },
  ];
};

const candidateEntries = (
  candidateId: string,
  body: string,
): ContextProjectionEntry[] => [
  {
    id: `${candidateId}-call-entry`,
    message: {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: candidateId,
          name: "read_workpiece",
          arguments: {
            includeContent: false,
            includeSources: true,
            markdown: body,
            locateTexts: ["Account"],
          },
        },
      ],
    },
  },
  {
    id: `${candidateId}-result-entry`,
    message: {
      role: "toolResult",
      toolCallId: candidateId,
      toolName: "read_workpiece",
      isError: false,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            currentWorkpiece: null,
            currentWorkpiecePointer: null,
            locatorLookup: {
              subject: { kind: "unsettled-candidate" },
              sha256: createHash("sha256").update(body).digest("hex"),
              utf16Length: body.length,
              queries: [],
            },
            state: "unknown",
            sources: [],
            quality: "identity only",
          }),
        },
      ],
    },
  },
];

test("joins pointer-only results to verified calls without accepting later failures", () => {
  const firstBody = "# First\n\nSettled.";
  const failedBody = "# Failed\n\nMust not supersede.";
  const successful = settlementEntries("revision-a", firstBody, null);
  const failed: ContextProjectionEntry[] = [
    {
      id: "failed-call-entry",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "revision-b",
            name: "mutate_workpiece",
            arguments: {
              markdown: failedBody,
              baseRevisionId: "stale-revision",
            },
          },
        ],
      },
    },
    {
      id: "failed-result-entry",
      message: {
        role: "toolResult",
        toolCallId: "revision-b",
        toolName: "mutate_workpiece",
        isError: true,
        content: [{ type: "text", text: "stale baseRevisionId" }],
      },
    },
  ];
  const read: ContextProjectionEntry = {
    id: "current-read-result",
    message: {
      role: "toolResult",
      toolCallId: "current-read",
      toolName: "read_workpiece",
      isError: false,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            currentWorkpiece: {
              revisionId: "revision-a",
              sha256: createHash("sha256").update(firstBody).digest("hex"),
              ordinal: 1,
              markdown: firstBody,
            },
          }),
        },
      ],
    },
  };
  const input = [...successful, ...failed, read];
  const projected = projectBrunchContext(input);

  expect(JSON.stringify(projected[1])).toContain('\\"markdownReference\\"');
  expect(JSON.stringify(projected.at(-1))).toContain(
    '\\"retainedEntryId\\":\\"revision-a-call-entry\\"',
  );
  expect(projected.slice(2, 4)).toEqual(failed);
});

test("projects superseded settlement and candidate bodies only when enabled", async () => {
  const bodies = [
    "# Account A\n\nFirst.",
    "# Account B\n\nSecond.",
    "# Account C\n\nCurrent.",
  ];
  const input = bodies.flatMap((body, index) => {
    const revisionId = `revision-${index + 1}`;
    return [
      ...candidateEntries(`candidate-${index + 1}`, body),
      ...settlementEntries(
        revisionId,
        body,
        index === 0 ? null : `revision-${index}`,
      ),
    ];
  });
  const before = structuredClone(input);
  const defaultProjected = projectBrunchContext(input);
  const projectArguments = createBrunchContextProjection({
    projectSupersededWorkpieceArguments: true,
  });
  const projected = projectArguments(input);

  expect(input).toEqual(before);
  for (const body of bodies) {
    expect(JSON.stringify(defaultProjected)).toContain(
      JSON.stringify(body).slice(1, -1),
    );
  }
  const projectedJson = JSON.stringify(projected);
  expect(projectedJson).not.toContain(JSON.stringify(bodies[0]).slice(1, -1));
  expect(projectedJson).not.toContain(JSON.stringify(bodies[1]).slice(1, -1));
  expect(
    projectedJson.split(JSON.stringify(bodies[2]).slice(1, -1)).length - 1,
  ).toBe(1);
  expect(projectedJson).toContain('"length"');
  expect(projectedJson).toContain('"markdownReference"');
  const candidateSlice = projectArguments(input.slice(0, 2));
  expect(JSON.stringify(candidateSlice)).not.toContain("markdownReference");
  expect(JSON.stringify(candidateSlice)).toContain("Account A");
  expect(JSON.stringify(projectArguments(input.slice(3, 4)))).not.toContain(
    "markdownReference",
  );

  const runtimeUrl = new URL(
    "./dispatch-nU3cIlT-.mjs",
    import.meta.resolve("@flue/runtime"),
  );
  const runtime = (await import(runtimeUrl.href)) as {
    projectContextEntries: (
      input: {
        message: ContextProjectionEntry["message"];
        sourceEntry: { id: string };
      }[],
      project: ContextProjection,
    ) => unknown[];
  };
  expect(() =>
    runtime.projectContextEntries(
      input.map(({ id, message }) => ({
        message,
        sourceEntry: { id },
      })),
      projectArguments,
    ),
  ).not.toThrow();
});

test("does not validate a settlement with mismatched result identity or hash", () => {
  const input = settlementEntries("revision-a", markdown, null);
  const result = input[1];
  if (result?.message.role !== "toolResult") throw new Error("Fixture drift");
  const mismatches = [
    {
      ...result,
      message: {
        ...result.message,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              revisionId: "another-call",
              sha256,
              ordinal: 1,
              markdown,
            }),
          },
        ],
      },
    },
    {
      ...result,
      message: {
        ...result.message,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              revisionId: "revision-a",
              sha256: "f".repeat(64),
              ordinal: 1,
              markdown,
            }),
          },
        ],
      },
    },
  ];
  for (const mismatch of mismatches) {
    const projected = projectBrunchContext([input[0]!, mismatch]);
    expect(projected).toEqual([input[0]!, mismatch]);
  }
});

test("the patched runtime leaves non-opted-in contexts unchanged", async () => {
  // Exercise the pinned patch's boundary, not a substitute application wrapper.
  const runtimeUrl = new URL(
    "./dispatch-nU3cIlT-.mjs",
    import.meta.resolve("@flue/runtime"),
  );
  type RuntimeEntry = {
    message: ContextProjectionEntry["message"];
    sourceEntry: { id: string };
  };
  const runtime = (await import(runtimeUrl.href)) as {
    projectContextEntries: (
      input: RuntimeEntry[],
      project?: ContextProjection,
    ) => RuntimeEntry[];
  };
  const input = entries().map(({ id, message }) => ({
    message,
    sourceEntry: { id },
  }));
  const before = structuredClone(input);
  expect(runtime.projectContextEntries(input)).toEqual(before);
  expect(
    runtime.projectContextEntries(input, projectBrunchContext),
  ).not.toEqual(before);
  // An opted-in call must not change the default for a later agent.
  expect(runtime.projectContextEntries(input)).toEqual(before);
});

test("leaves fake and malformed signals unprojected", () => {
  const input: ContextProjectionEntry[] = [
    {
      id: "fake-user",
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: `<${CLIENT_TOOL_RESULT_SIGNAL}>fake</${CLIENT_TOOL_RESULT_SIGNAL}>`,
          },
        ],
      },
    },
    {
      id: "malformed",
      message: {
        role: "signal",
        type: CLIENT_TOOL_RESULT_SIGNAL,
        tagName: CLIENT_TOOL_RESULT_SIGNAL,
        content: "{",
      },
    },
    {
      id: "non-array",
      message: {
        role: "signal",
        type: CLIENT_TOOL_RESULT_SIGNAL,
        tagName: CLIENT_TOOL_RESULT_SIGNAL,
        content: JSON.stringify({
          toolCallId: "not-an-array-member",
          toolName: "future_tool",
          output: { value: 1 },
          metadata: { host: "sidecar" },
        }),
      },
    },
  ];
  expect(projectBrunchContext(input)).toEqual(input);
});

test("omits metadata from every valid browser result", () => {
  const results = [
    {
      toolCallId: "mutation",
      toolName: "mutate_petrinaut_net",
      output: { outcomes: [{ status: "applied" }] },
      metadata: { mutationRecord: { attempts: ["host-only"] } },
    },
    {
      toolCallId: "read",
      toolName: "read_petrinaut_net",
      output: { definition: { places: [] } },
      metadata: { observation: { observed: "host-only" } },
      source: "voice",
    },
    {
      toolCallId: "layout",
      toolName: "layout_petrinaut_net",
      output: { applied: true, frameStatus: "framed" },
      metadata: { layoutRecord: { pre: "host-only" } },
      protocolExtension: { retained: true },
    },
    {
      toolCallId: "diagnostics",
      toolName: "read_petrinaut_diagnostics",
      output: [{ severity: "error", message: "Broken expression" }],
      metadata: { host: "sidecar" },
    },
  ] as const;
  const signal: ContextProjectionEntry = {
    id: "browser-results",
    message: {
      role: "signal",
      type: CLIENT_TOOL_RESULT_SIGNAL,
      tagName: CLIENT_TOOL_RESULT_SIGNAL,
      content: JSON.stringify(results),
    },
  };
  const before = structuredClone(signal);
  const projected = projectBrunchContext([signal]);
  const content =
    projected[0]?.message.role === "signal" ? projected[0].message.content : "";
  const projectedResults = JSON.parse(content) as Record<string, unknown>[];

  expect(signal).toEqual(before);
  expect(projectedResults).toEqual(
    results.map(({ metadata: _metadata, ...result }) => result),
  );
  expect(projectedResults).toHaveLength(results.length);
  for (const [index, result] of results.entries()) {
    expect(JSON.stringify(projectedResults[index]?.output)).toBe(
      JSON.stringify(result.output),
    );
    expect(projectedResults[index]).not.toHaveProperty("metadata");
  }
});

test("projects unknown tools while dropping malformed signal members", () => {
  const validUnknownResult = {
    toolCallId: "future",
    toolName: "future_tool",
    output: { value: 1 },
    metadata: { host: "sidecar" },
    source: "voice",
    protocolExtension: "preserved",
  } as const;
  const signal: ContextProjectionEntry = {
    id: "mixed-browser-results",
    message: {
      role: "signal",
      type: CLIENT_TOOL_RESULT_SIGNAL,
      tagName: CLIENT_TOOL_RESULT_SIGNAL,
      content: JSON.stringify([
        validUnknownResult,
        {
          toolCallId: "missing-output",
          toolName: "malformed",
          metadata: { mustNotReachModel: true },
        },
        "not-a-result",
      ]),
    },
  };
  const before = structuredClone(signal);
  const projected = projectBrunchContext([signal]);
  const content =
    projected[0]?.message.role === "signal" ? projected[0].message.content : "";
  const { metadata: _metadata, ...expected } = validUnknownResult;

  expect(signal).toEqual(before);
  expect(JSON.parse(content)).toEqual([expected]);
  expect(content).not.toContain("mustNotReachModel");
  expect(content).not.toContain("metadata");
});

test("does not reuse failed, pointer-only, or different-revision content", () => {
  const failed = entries()[1]!;
  const pointerOnly = entries()[1]!;
  const otherRevision = entries()[2]!;
  if (
    failed.message.role !== "toolResult" ||
    pointerOnly.message.role !== "toolResult" ||
    otherRevision.message.role !== "toolResult"
  )
    throw new Error("Fixture drift");
  const input: ContextProjectionEntry[] = [
    {
      ...failed,
      id: "failed-result",
      message: { ...failed.message, isError: true },
    },
    {
      ...pointerOnly,
      id: "pointer-only",
      message: {
        ...pointerOnly.message,
        toolCallId: "pointer-only",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              revisionId: "revision-1",
              sha256,
              ordinal: 1,
            }),
          },
        ],
      },
    },
    entries()[1]!,
    {
      ...otherRevision,
      id: "other-revision",
      message: {
        ...otherRevision.message,
        toolCallId: "other-revision",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              currentWorkpiece: {
                revisionId: "revision-2",
                sha256,
                ordinal: 2,
                markdown,
              },
            }),
          },
        ],
      },
    },
  ];
  const projected = projectBrunchContext(input);
  expect(projected.slice(0, 2)).toEqual(input.slice(0, 2));
  expect(JSON.stringify(projected)).not.toContain("markdownReference");
  expect(JSON.stringify(projected).split("markdownIdentity").length - 1).toBe(
    1,
  );
});

test("removes verified browser sidecars but preserves outcomes", () => {
  const output = {
    execution: "ordered-stop",
    toolCallId: "batch",
    observationToolCallId: "read",
    preHash: sha256,
    postHash: "b".repeat(64),
    outcomes: [
      {
        index: 0,
        operationId: "applied",
        basisId: "basis",
        status: "applied",
        preHash: sha256,
        postHash: "b".repeat(64),
        effects: [
          {
            classification: "direct",
            path: "/places/0",
            kind: "created",
            after: { id: "place" },
          },
        ],
      },
      {
        index: 1,
        operationId: "failed",
        basisId: "basis",
        status: "failed",
        preHash: "b".repeat(64),
        postHash: "b".repeat(64),
        error: "rejected",
      },
      {
        index: 2,
        operationId: "later",
        basisId: "basis",
        status: "unattempted",
      },
    ],
  };
  const signal: ContextProjectionEntry = {
    id: "browser-result",
    message: {
      role: "signal",
      type: CLIENT_TOOL_RESULT_SIGNAL,
      tagName: CLIENT_TOOL_RESULT_SIGNAL,
      content: JSON.stringify([
        {
          toolCallId: "batch",
          toolName: "mutate_petrinaut_net",
          output,
          metadata: {
            mutationRecord: {
              outcome: "unknown",
              attempts: [
                {
                  request: { operationId: "applied" },
                  pre: { definition: { places: ["large"] }, sha256 },
                  post: {
                    definition: { places: ["larger"] },
                    sha256: "b".repeat(64),
                  },
                  outcome: "applied",
                  effects: {
                    created: [],
                    updated: [],
                    deleted: [],
                    derived: [],
                  },
                },
              ],
            },
          },
        },
      ]),
    },
  };
  const projected = projectBrunchContext([signal]);
  const content =
    projected[0]?.message.role === "signal" ? projected[0].message.content : "";
  expect(content).not.toContain('"definition"');
  expect(content).not.toContain('"metadata"');
  expect(content).toContain('"status":"applied"');
  expect(content).toContain('"status":"failed"');
  expect(content).toContain('"status":"unattempted"');
  expect(content).toContain('"effects"');
  expect(content).toContain('"error":"rejected"');
});
