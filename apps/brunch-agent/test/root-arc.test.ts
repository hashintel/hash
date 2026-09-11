import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import { verifyRootArcResults } from "../src/conversation/root-arc.ts";
import { retainedSettledRevision } from "../src/conversation/workpiece.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type { ArcMutationRecord } from "@hashintel/brunch-agent-plugin-sdcpn";

// Immutable positive fixture earned by the actual local browser, not an invented applied record.
const witness = new URL("./fixtures/root-arc/history.json", import.meta.url);
const fixture = () => {
  const snapshot = JSON.parse(
    readFileSync(witness, "utf8"),
  ) as FlueConversationSnapshot;
  const result = clientToolHistoryFrom(snapshot.messages).results.find(
    (entry) => entry.toolCallId === "m7-browser-arc",
  );
  if (!result)
    throw new Error("The browser witness must contain its canonical result");
  const record = (result.metadata as { mutationRecord: ArcMutationRecord })
    .mutationRecord;
  const request = record.attempts[0]!.request;
  return {
    snapshot,
    result,
    record,
    binding: request.binding,
    requestedBaseHash: request.requestedBaseHash,
  };
};

describe("bound root-arc receiving boundary", () => {
  test("accepts the actual browser record with its correlated unchanged canonical result", async () => {
    const input = fixture();
    await expect(
      verifyRootArcResults({ ...input, body: JSON.stringify([input.result]) }),
    ).resolves.toBeUndefined();
    expect(
      retainedSettledRevision(input.snapshot, "m7-browser-revision"),
    ).toMatchObject({ revisionId: "m7-browser-revision", ordinal: 1 });
    expect(retainedSettledRevision(input.snapshot, "unknown")).toBeUndefined();
  });
  test.each(["conversationId", "documentId", "incarnationId"] as const)(
    "refuses a mismatched %s",
    async (key) => {
      const input = fixture();
      await expect(
        verifyRootArcResults({
          ...input,
          binding: { ...input.binding, [key]: "another" },
          body: JSON.stringify([input.result]),
        }),
      ).rejects.toThrow(/incarnation/iu);
    },
  );
  test("refuses unknown calls, changed names, missing records, and a changed issued base", async () => {
    const input = fixture();
    await Promise.all(
      [
        { ...input.result, toolCallId: "unknown" },
        { ...input.result, toolName: "unknown" },
        { ...input.result, metadata: undefined },
      ].map(async (result) => {
        await expect(
          verifyRootArcResults({ ...input, body: JSON.stringify([result]) }),
        ).rejects.toThrow(/canonical call|browser mutation record/u);
      }),
    );
    await expect(
      verifyRootArcResults({
        ...input,
        requestedBaseHash: "0".repeat(64),
        body: JSON.stringify([input.result]),
      }),
    ).rejects.toThrow(/base/iu);
  });
  test("refuses unaccounted effects and conflicting outcomes rather than blessing success", async () => {
    const input = fixture();
    const attempt = input.record.attempts[0]!;
    attempt.effects.created = [];
    await expect(
      verifyRootArcResults({ ...input, body: JSON.stringify([input.result]) }),
    ).rejects.toThrow(/diff/iu);
    const conflict = fixture();
    const first = conflict.record.attempts[0]!;
    conflict.record.attempts.push({
      ...structuredClone(first),
      post: structuredClone(first.pre),
      outcome: "no-op",
      effects: { created: [], updated: [], deleted: [], derived: [] },
    });
    conflict.record.outcome = "unknown";
    await expect(
      verifyRootArcResults({
        ...conflict,
        body: JSON.stringify([conflict.result]),
      }),
    ).rejects.toThrow(/conflicts/iu);
  });
  test("refuses a mutate_petrinet result without a mutation record", async () => {
    const binding = {
      conversationId: "conversation",
      documentId: "document",
      incarnationId: "incarnation",
    };
    const snapshot = {
      messages: [
        {
          role: "assistant",
          purpose: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolCallId: "batch-1",
              toolName: "mutate_petrinet",
              state: "output-available",
              input: {
                observation: {
                  toolCallId: "read-1",
                  baseHash: "a".repeat(64),
                },
                bases: [
                  {
                    basisId: "basis-1",
                    basis: { kind: "absent", reason: "Synthetic" },
                  },
                ],
                operations: [
                  {
                    operationId: "add-queue",
                    basisId: "basis-1",
                    type: "addPlace",
                    input: {
                      id: "queue",
                      name: "Queue",
                      colorId: null,
                      dynamicsEnabled: false,
                      differentialEquationId: null,
                      x: 0,
                      y: 0,
                    },
                  },
                ],
              },
              output: { awaiting: "client" },
            },
          ],
        },
      ],
    } as unknown as FlueConversationSnapshot;
    await expect(
      verifyRootArcResults({
        snapshot,
        binding,
        body: JSON.stringify([
          {
            toolCallId: "batch-1",
            toolName: "mutate_petrinet",
            output: { execution: "ordered-stop" },
          },
        ]),
      }),
    ).rejects.toThrow(/mutation record/u);
  });
});
