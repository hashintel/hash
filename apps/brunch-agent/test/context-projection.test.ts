import assert from "node:assert/strict";

import { expect, test } from "vitest";

import { projectBrunchContext } from "../src/agents/chat-agent/context-projection";

import type { ContextProjection, ContextProjectionEntry } from "@flue/runtime";

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
