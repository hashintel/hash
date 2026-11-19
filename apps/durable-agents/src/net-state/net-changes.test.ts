/**
 * Which browser-call records project as net calls. Attribution itself is the
 * library's, tested in `libs/@hashintel/brunch-agent/src/petrinaut/net-changes.test.ts`.
 */
import { expect, test } from "vitest";

import { callsForElement } from "@hashintel/brunch-agent";
import { toPetrinautId } from "@hashintel/petrinaut-core";

import { netCalls } from "./net-changes";

import type { BrowserCallRecord } from "../browser-call/browser-call";
import type { EntryId } from "@earendil-works/pi-durable";

/** An applied change, settled, issued at `callIndex` of one assistant entry. */
const applied = (
  callIndex: number,
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>,
): BrowserCallRecord => ({
  toolCallId,
  toolName,
  input: input as BrowserCallRecord["input"],
  status: "settled",
  issuedAt: 0,
  expiresAt: 0,
  task: 0,
  doorbell: null,
  capability: null,
  claimed: true,
  output: { applied: true },
  metadata: {
    documentRevision: { before: `${toolCallId}-0`, after: `${toolCallId}-1` },
  },
  issuedEntry: 1 as EntryId,
  callIndex,
});

test("net calls are in issue order, without records lacking a committed result or an issue position", () => {
  const input = { id: "queue", name: "Queue" };
  const later = {
    ...applied(0, "later", "addPlace", input),
    issuedEntry: 2 as EntryId,
  };
  const second = applied(1, "second", "addPlace", input);
  const first = applied(0, "first", "addPlace", input);
  const unpositioned = applied(2, "unpositioned", "addPlace", input);
  delete unpositioned.issuedEntry;
  const pending = {
    ...applied(3, "pending", "addPlace", input),
    status: "pending",
  } as const;
  expect(
    netCalls({ later, second, first, unpositioned, pending }).map(
      ({ toolCallId, issuedEntry, callIndex, revisionAfter }) => ({
        toolCallId,
        issuedEntry,
        callIndex,
        revisionAfter,
      }),
    ),
  ).toEqual([
    {
      toolCallId: "first",
      issuedEntry: 1,
      callIndex: 0,
      revisionAfter: "first-1",
    },
    {
      toolCallId: "second",
      issuedEntry: 1,
      callIndex: 1,
      revisionAfter: "second-1",
    },
    {
      toolCallId: "later",
      issuedEntry: 2,
      callIndex: 0,
      revisionAfter: "later-1",
    },
  ]);
});

test("a change the browser applied is attributed though its aborted turn never received it; a discarded failure is not", () => {
  const place = applied(0, "place", "petrinaut_create_place", {
    editor_id: "process-editor",
    id: "queue",
    name: "Queue",
    colorId: null,
    dynamicsEnabled: false,
    x: 0,
    y: 0,
  });
  const discarded = netCalls({
    applied: { ...place, toolCallId: "applied", status: "discarded" },
    failed: {
      ...place,
      toolCallId: "failed",
      callIndex: 1,
      status: "discarded",
      failure: "failed",
    },
  });
  expect(
    callsForElement(discarded, {
      kind: "place",
      id: toPetrinautId("queue"),
    }).map(({ toolCallId }) => toolCallId),
  ).toEqual(["applied"]);
});
