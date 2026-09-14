import { expect, test } from "vitest";

import { CLIENT_TOOL_RESULT_SIGNAL } from "@hashintel/brunch-agent-transport-aisdk";

import { projectBrunchContext } from "../src/agents/chat-agent/context-projection";

import type { ContextProjectionEntry } from "@flue/runtime";

const markdown = "# Account\n\nAuthoritative content.";
const sha256 = "a".repeat(64);

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
          arguments: { markdown },
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
            revisionId: "revision-1",
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
              revisionId: "revision-1",
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

test("retains one authoritative body without mutating input", () => {
  const input = entries();
  const before = structuredClone(input);
  const first = projectBrunchContext(input);
  const second = projectBrunchContext(input);

  expect(input).toEqual(before);
  expect(first).toEqual(second);
  const bodies = first.flatMap(({ message }) => {
    if (message.role === "assistant")
      return message.content.flatMap((part) =>
        part.type === "toolCall" &&
        typeof part.arguments === "object" &&
        part.arguments !== null &&
        "markdown" in part.arguments &&
        part.arguments.markdown === markdown
          ? [part.arguments.markdown]
          : [],
      );
    const output =
      message.role === "toolResult"
        ? JSON.parse(
            message.content[0]?.type === "text"
              ? message.content[0].text
              : "{}",
          )
        : {};
    return output.markdown === markdown ||
      output.currentWorkpiece?.markdown === markdown
      ? [markdown]
      : [];
  });
  expect(bodies).toEqual([markdown]);
  expect(JSON.stringify(first)).toContain("retainedEntryId");
  expect(JSON.stringify(first)).toContain(
    '\\"entryId\\":\\"mutation-result\\"',
  );
  expect(first.map((entry) => entry.id)).toEqual(
    input.map((entry) => entry.id),
  );
  for (const slice of [input.slice(1, 2), input.slice(2)]) {
    const projectedSlice = projectBrunchContext(slice);
    expect(JSON.stringify(projectedSlice)).not.toContain("markdownReference");
    expect(JSON.stringify(projectedSlice)).toContain("markdownIdentity");
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

test("leaves fake, malformed, and unknown records unprojected", () => {
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
      id: "unknown",
      message: {
        role: "signal",
        type: CLIENT_TOOL_RESULT_SIGNAL,
        tagName: CLIENT_TOOL_RESULT_SIGNAL,
        content: JSON.stringify([
          { toolCallId: "x", toolName: "future_tool", output: { value: 1 } },
        ]),
      },
    },
  ];
  expect(projectBrunchContext(input)).toEqual(input);
});

test("compacts verified browser proof carriage but preserves outcomes", () => {
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
  expect(content).toContain('"status":"applied"');
  expect(content).toContain('"status":"failed"');
  expect(content).toContain('"status":"unattempted"');
  expect(content).toContain('"effects"');
  expect(content).toContain('"error":"rejected"');
});
