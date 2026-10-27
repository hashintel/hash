import assert from "node:assert/strict";

import { expect, test } from "vitest";

import {
  brunchTools,
  petrinautContextualUserMessageBody,
} from "@hashintel/brunch-agent";

import {
  createBrunchContextProjection,
  projectBrunchContext,
} from "./context-projection";

import type { ContextProjectionEntry } from "@flue/runtime";

const sidecar = {
  observation: { binding: "private-binding", sha256: "private-hash" },
};
const canonical = { definition: { places: [] }, title: "Queue" };

const entries = (): ContextProjectionEntry[] => [
  {
    id: "user",
    message: { role: "user", content: "We hold stock." },
  },
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

test("projects in-band canonical output without exposing host sidecars or altering Flue history", () => {
  const input = entries();
  const projected = projectBrunchContext(input);
  assert.deepEqual(
    projected.map(({ message }) =>
      message.role === "toolResult" ? message.content : undefined,
    ),
    [
      undefined,
      [{ type: "text", text: JSON.stringify(canonical) }],
      [{ type: "text", text: JSON.stringify("Petrinaut guide") }],
    ],
  );
  assert(JSON.stringify(input).includes("private-binding"));
  assert(!JSON.stringify(projected).includes("private-binding"));
  assert(!JSON.stringify(projected).includes("brunchBrowserResult"));
});

test("a read rendered as text reaches the model as that text where the agent names it", () => {
  const rendered = 'entities: 1\n- Supplier "Acme"\n  entityId: web~acme';
  const read: ContextProjectionEntry = {
    id: "hash-read",
    message: {
      role: "toolResult",
      toolCallId: "h1",
      toolName: brunchTools.queryHashEntities,
      isError: false,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            brunchBrowserResult: true,
            output: rendered,
            metadata: sidecar,
          }),
        },
      ],
    },
  };
  const contentOf = (entry: ContextProjectionEntry | undefined) =>
    entry?.message.role === "toolResult" && entry.message.content;
  const [projected] = createBrunchContextProjection({
    textResultToolNames: new Set([brunchTools.queryHashEntities]),
  })([read]);
  expect(contentOf(projected)).toEqual([{ type: "text", text: rendered }]);
  // A projection that names no text-result tools, as the Petrinaut agent's
  // does, still shows every output as JSON.
  expect(contentOf(projectBrunchContext([read])[0])).toEqual([
    { type: "text", text: JSON.stringify(rendered) },
  ]);
});

test("user messages and server tool results pass through unchanged", () => {
  const ledger: ContextProjectionEntry = {
    id: "ledger",
    message: {
      role: "toolResult",
      toolCallId: "c1",
      toolName: "ledger_commit",
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ status: "recorded" }) }],
    },
  };
  const input = [entries()[0]!, ledger];
  expect(projectBrunchContext(input)).toEqual(input);
});

test("shows the model each user turn as it would read without submission context", () => {
  const submissionContext = {
    interviewBudget: {
      level: "quick",
      questionCap: 3,
      asked: 1,
      remaining: 2,
    },
    words: ["RelayDesk"],
  };
  const diagnosed = petrinautContextualUserMessageBody({
    userText: "Two suppliers.",
    diagnosticsContext: "Selected: Supplier A",
  });
  const input: ContextProjectionEntry[] = [
    {
      id: "budgeted",
      message: {
        role: "user",
        content: petrinautContextualUserMessageBody({
          userText: "We hold stock.",
          diagnosticsContext: "",
          submissionContext,
        }),
      },
    },
    {
      id: "budgeted-diagnosed",
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: petrinautContextualUserMessageBody({
              userText: "Two suppliers.",
              diagnosticsContext: "Selected: Supplier A",
              submissionContext,
            }),
          },
        ],
      },
    },
    { id: "diagnosed", message: { role: "user", content: diagnosed } },
  ];
  const projected = projectBrunchContext(input);
  expect(projected.map(({ message }) => message)).toEqual([
    { role: "user", content: "We hold stock." },
    { role: "user", content: [{ type: "text", text: diagnosed }] },
    { role: "user", content: diagnosed },
  ]);
  expect(JSON.stringify(projected)).not.toContain("interviewBudget");
  expect(JSON.stringify(projected)).not.toContain("RelayDesk");
});

// Runtime wiring (opt-in per agent, exact compaction slices, canonical
// history) is exercised through the real agent loop in
// test/flue-runtime-contracts.test.ts, not through a private runtime chunk.
