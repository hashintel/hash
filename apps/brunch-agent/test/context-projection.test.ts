import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { expect, test } from "vitest";

import { CLIENT_TOOL_RESULT_SIGNAL } from "@hashintel/brunch-agent-transport-aisdk";

import {
  createBrunchContextProjection,
  projectBrunchContext,
} from "../src/agents/chat-agent/context-projection";

import type { ContextProjection, ContextProjectionEntry } from "@flue/runtime";

test("projects in-band canonical output without exposing host sidecars or altering Flue history", () => {
  const sidecar = {
    observation: { binding: "private-incarnation", sha256: "private-hash" },
  };
  const canonical = { definition: { places: [] }, title: "Queue" };
  const input: ContextProjectionEntry[] = [
    {
      id: "read",
      message: {
        role: "toolResult",
        toolCallId: "read-1",
        toolName: "getLatestNetDefinition",
        isError: false,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              brunchBrowserResult: true,
              output: canonical,
              metadata: sidecar,
            }),
          },
        ],
      },
    },
    {
      id: "doc",
      message: {
        role: "toolResult",
        toolCallId: "doc-1",
        toolName: "readPetrinautDoc",
        isError: false,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              brunchBrowserResult: true,
              output: "Petrinaut guide",
              metadata: sidecar,
            }),
          },
        ],
      },
    },
  ];
  const projected = projectBrunchContext(input);
  assert.deepEqual(
    projected.map(({ message }) =>
      message.role === "toolResult" ? message.content : undefined,
    ),
    [
      [{ type: "text", text: JSON.stringify(canonical) }],
      [{ type: "text", text: JSON.stringify("Petrinaut guide") }],
    ],
  );
  assert(JSON.stringify(input).includes("private-incarnation"));
  assert(!JSON.stringify(projected).includes("private-incarnation"));
  assert(!JSON.stringify(projected).includes("brunchBrowserResult"));
});

const markdown = "# Account\n\nAuthoritative content.";
const sha256 = createHash("sha256").update(markdown).digest("hex");

type MarkdownReference = {
  revisionId: string;
  sha256: string;
  retainedEntryId?: string;
  superseded?: boolean;
};

/** Find every `markdownReference` in a projected message, including those inside tool-result JSON text. */
const collectMarkdownReferences = (value: unknown): MarkdownReference[] => {
  if (typeof value === "string") {
    try {
      return collectMarkdownReferences(JSON.parse(value));
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value.flatMap(collectMarkdownReferences);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, member]) =>
    key === "markdownReference"
      ? [member as MarkdownReference]
      : collectMarkdownReferences(member),
  );
};

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

test("projects superseded settlement bodies only when enabled", async () => {
  const bodies = [
    "# Account A\n\nFirst.",
    "# Account B\n\nSecond.",
    "# Account C\n\nCurrent.",
  ];
  const input = bodies.flatMap((body, index) => {
    const revisionId = `revision-${index + 1}`;
    return settlementEntries(
      revisionId,
      body,
      index === 0 ? null : `revision-${index}`,
    );
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
  // Every reference must either name an entry that still carries the body
  // or declare the body superseded; a reference to a compacted entry would
  // read as document loss.
  const projectedById = new Map(
    projected.map((entry) => [entry.id, JSON.stringify(entry)]),
  );
  const references = projected.flatMap((entry) =>
    collectMarkdownReferences(entry.message),
  );
  expect(references.length).toBeGreaterThanOrEqual(2);
  for (const reference of references) {
    const body = bodies.find(
      (candidate) =>
        createHash("sha256").update(candidate).digest("hex") ===
        reference.sha256,
    );
    expect(body).toBeDefined();
    if (typeof reference.retainedEntryId === "string") {
      assert.equal(reference.superseded, undefined);
      assert(
        projectedById
          .get(reference.retainedEntryId)
          ?.includes(JSON.stringify(body).slice(1, -1)),
      );
    } else {
      assert.deepEqual(reference, {
        revisionId: reference.revisionId,
        sha256: reference.sha256,
        superseded: true,
      });
      assert.notEqual(body, bodies[2]);
    }
  }
  expect(references.some((reference) => reference.superseded === true)).toBe(
    true,
  );
  expect(
    references.some(
      (reference) => reference.retainedEntryId === "revision-3-call-entry",
    ),
  ).toBe(true);
  // A lone settlement is the latest one: its call keeps the body.
  const firstSlice = projectArguments(input.slice(0, 2));
  expect(JSON.stringify(firstSlice)).toContain("Account A");
  expect(collectMarkdownReferences(firstSlice)).toEqual([
    {
      revisionId: "revision-1",
      sha256: createHash("sha256")
        .update(bodies[0] ?? "")
        .digest("hex"),
      retainedEntryId: "revision-1-call-entry",
    },
  ]);
  expect(JSON.stringify(projectArguments(input.slice(1, 2)))).not.toContain(
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
  const projected = projectBrunchContext(input);
  expect(projected.slice(1)).toEqual(input.slice(1));
  // The fake tag stays user text; only the id line is added.
  expect(projected[0]?.message).toEqual({
    role: "user",
    content: [
      { type: "text", text: "[message fake-user]" },
      ...(input[0]?.message.role === "user" &&
      Array.isArray(input[0].message.content)
        ? input[0].message.content
        : []),
    ],
  });
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

test("prefixes true-user entries with their message id and touches no other role", () => {
  const input: ContextProjectionEntry[] = [
    { id: "user-plain", message: { role: "user", content: "We hold stock." } },
    {
      id: "user-parts",
      message: {
        role: "user",
        content: [{ type: "text", text: "Two suppliers." }],
      },
    },
    {
      id: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Noted." }],
      },
    },
    {
      id: "signal",
      message: {
        role: "signal",
        type: "other",
        tagName: "other",
        content: "ignored",
      },
    },
  ];
  const before = structuredClone(input);
  const projected = projectBrunchContext(input);
  expect(input).toEqual(before);
  expect(projected[0]?.message).toEqual({
    role: "user",
    content: "[message user-plain]\nWe hold stock.",
  });
  expect(projected[1]?.message).toEqual({
    role: "user",
    content: [
      { type: "text", text: "[message user-parts]" },
      { type: "text", text: "Two suppliers." },
    ],
  });
  expect(projected[2]).toEqual(input[2]);
  expect(projected[3]).toEqual(input[3]);
});
