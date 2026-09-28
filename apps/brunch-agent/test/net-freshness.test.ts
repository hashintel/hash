import { expect, test } from "vitest";

import { createBrunchContextProjection } from "../src/agents/chat-agent/context-projection";
import {
  createNetViewTracker,
  expectedNetRevision,
  noNetViewRefusal,
} from "../src/conversation/net-freshness";

import type { ContextProjectionEntry } from "@flue/runtime";
import type { FlueConversationSnapshot } from "@flue/sdk";

type Revision = { before?: string; after?: string };

const envelope = (
  output: unknown,
  documentRevision: Revision,
  readBack?: object,
) => ({
  brunchBrowserResult: true,
  output,
  metadata: {
    documentRevision,
    ...(readBack === undefined ? {} : { readBack }),
  },
});

const resultEntry = (
  toolCallId: string,
  toolName: string,
  output: unknown,
  isError = false,
): ContextProjectionEntry => ({
  id: `entry-${toolCallId}`,
  message: {
    role: "toolResult",
    toolCallId,
    toolName,
    isError,
    content: [{ type: "text", text: JSON.stringify(output) }],
  },
});

const callsEntry = (...ids: string[]): ContextProjectionEntry =>
  ({
    id: `calls-${ids.join("-")}`,
    message: {
      role: "assistant",
      content: ids.map((id) => ({
        type: "toolCall",
        id,
        name: "addPlace",
        arguments: {},
      })),
    },
  }) as unknown as ContextProjectionEntry;

const snapshot = (
  parts: {
    toolCallId: string;
    toolName: string;
    state?: string;
    revision?: Revision;
  }[],
): FlueConversationSnapshot =>
  ({
    messages: [
      {
        id: "a1",
        role: "assistant",
        purpose: "assistant",
        parts: parts.map(({ toolCallId, toolName, state, revision }) => ({
          type: "dynamic-tool",
          toolCallId,
          toolName,
          state: state ?? "output-available",
          input: {},
          ...(revision === undefined ? {} : { output: envelope({}, revision) }),
        })),
      },
    ],
  }) as unknown as FlueConversationSnapshot;

test("the tracker records only successful net results the model's context holds", () => {
  const tracker = createNetViewTracker();
  tracker.observe("conversation", [
    resultEntry("read", "getLatestNetDefinition", {}),
    resultEntry("outline", "readNetOutline", {}),
    resultEntry("place", "addPlace", {}),
    resultEntry("failed", "addArc", {}, true),
    resultEntry("ledger", "ledger_commit", {}),
    resultEntry("diagnostics", "getNetCompilationErrors", {}),
  ]);
  expect([...(tracker.view("conversation") ?? [])]).toEqual([
    "read",
    "outline",
    "place",
  ]);
  expect(tracker.view("another")).toBeUndefined();
});

test("a change is expected at the revision of the latest net result the model can see", () => {
  const history = snapshot([
    {
      toolCallId: "read",
      toolName: "getLatestNetDefinition",
      revision: { before: "r1" },
    },
    {
      toolCallId: "place",
      toolName: "addPlace",
      revision: { before: "r1", after: "r2" },
    },
    { toolCallId: "next", toolName: "addArc", state: "input-available" },
  ]);
  expect(
    expectedNetRevision(history, "next", new Set(["read", "place"])),
  ).toEqual({
    revision: "r2",
  });
  // A result from the same proposal is not yet in the model's context.
  expect(expectedNetRevision(history, "next", new Set(["read"]))).toEqual({
    revision: "r1",
  });
});

test("a change with no net result left in context is refused before it is issued", () => {
  const history = snapshot([
    {
      toolCallId: "read",
      toolName: "getLatestNetDefinition",
      revision: { before: "r1" },
    },
    { toolCallId: "next", toolName: "addPlace", state: "input-available" },
  ]);
  expect(expectedNetRevision(history, "next", new Set())).toEqual({
    refusal: noNetViewRefusal,
  });
  expect(expectedNetRevision(history, "next", undefined)).toEqual({
    refusal: noNetViewRefusal,
  });
  expect(() => expectedNetRevision(history, "absent", new Set())).toThrow(
    /does not contain browser call absent/u,
  );
});

test("only the latest change shows the read-back, and a later net read supersedes it", () => {
  const observed: string[][] = [];
  const project = createBrunchContextProjection({
    observe: (entries) => observed.push(entries.map(({ id }) => id)),
  });
  const place = resultEntry(
    "place",
    "addPlace",
    envelope({ id: "p1" }, { before: "r1", after: "r2" }, { places: ["p1"] }),
  );
  const arc = resultEntry(
    "arc",
    "addArc",
    envelope(
      { id: "a1" },
      { before: "r2", after: "r3" },
      { places: ["p1"], arcs: ["a1"] },
    ),
  );
  const texts = (entries: readonly ContextProjectionEntry[]) =>
    entries.flatMap(({ message }) =>
      message.role === "toolResult"
        ? message.content.flatMap((part) =>
            part.type === "text" ? [JSON.parse(part.text) as unknown] : [],
          )
        : [],
    );
  const input = [callsEntry("place", "arc"), place, arc];
  expect(texts(project(input))).toEqual([
    { id: "p1" },
    { output: { id: "a1" }, netAfterChanges: { places: ["p1"], arcs: ["a1"] } },
  ]);
  expect(observed.at(-1)).toEqual(input.map(({ id }) => id));
  const read = resultEntry(
    "read",
    "readNetStructure",
    envelope({ definition: {} }, { before: "r3" }),
  );
  expect(texts(project([...input, read]))).toEqual([
    { id: "p1" },
    { id: "a1" },
    { definition: {} },
  ]);
});
