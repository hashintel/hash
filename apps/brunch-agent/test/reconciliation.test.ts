import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { expect, test } from "vitest";

import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import {
  retainedSettledRevision,
  assertArcNotRetired,
} from "../src/conversation/root-arc.ts";
import {
  explainRootArc,
  recordedBrowserObservation,
} from "../src/conversation/why.ts";
import { workpieceEvidenceSources } from "../src/conversation/workpiece.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type { ArcTransitionAttempt } from "@hashintel/brunch-agent-plugin-sdcpn";

const snapshot = JSON.parse(
  readFileSync(
    new URL("./fixtures/reconciliation/history.json", import.meta.url),
    "utf8",
  ),
) as FlueConversationSnapshot;
const messages = snapshot.messages;
const resultMessage = messages.find(
  (message) =>
    message.signal?.tagName === "client-tool-result" &&
    JSON.stringify(message).includes("transitionRecord"),
);
if (!resultMessage) throw new Error("Actual retained browser result missing.");
const body = resultMessage.parts
  .flatMap((part) => (part.type === "text" ? [part.text] : []))
  .join("");
const delivered = JSON.parse(body) as {
  metadata: {
    transitionRecord: {
      attempts: {
        binding: {
          conversationId: string;
          documentId: string;
          incarnationId: string;
        };
        request: { requestedBaseHash: string };
      }[];
    };
  };
}[];
const attempt = delivered[0]?.metadata.transitionRecord.attempts[0];
if (!attempt) throw new Error("Actual browser observation missing.");
const browser = {
  binding: attempt.binding,
  requestedBaseHash: attempt.request.requestedBaseHash,
};
const current = retainedSettledRevision(snapshot, "m7-browser-revision");
if (!current) throw new Error("Actual successful revision missing.");
const query = {
  transition: "start-final-inspection",
  place: "dispatch-crew-available",
  arcDirection: "input" as const,
  field: "entity" as const,
};

test("refuses recreation of a recorded arc identity after it disappears from a fresh observation", async () => {
  const result = clientToolHistoryFrom(snapshot.messages).results.find(
    (entry) => entry.toolName === "addArc",
  );
  if (!result) throw new Error("Missing original browser result");
  const actual = (
    result.metadata as {
      transitionRecord: { attempts: ArcTransitionAttempt[] };
    }
  ).transitionRecord.attempts[0];
  expect(actual?.post).toBeDefined();
  if (!actual?.post) throw new Error("Missing original browser effect");
  await expect(
    assertArcNotRetired(snapshot, actual.pre, actual.request.input),
  ).rejects.toThrow(/Retired/u);
  await expect(
    assertArcNotRetired(snapshot, actual.post, actual.request.input),
  ).rejects.toThrow(/Duplicate/u);
  await expect(
    assertArcNotRetired(
      { ...snapshot, messages: [] },
      actual.pre,
      actual.request.input,
    ),
  ).resolves.toBeUndefined();
});

test("labels an answer as of the last reconciled state when the live hash is unavailable", async () => {
  const answer = await explainRootArc({ snapshot, current, browser, query });
  expect(answer.reconciliation.status).toBe("as-of");
  expect(answer.governing?.revisionId).toBe(current.revisionId);
  expect(answer.governing?.passages[0]?.standing).toBe("temporal-context-only");
  expect(answer.quality.sourceRelevance).toBe("unassessed");
});

test("refuses unknown current state instead of reconstructing it from history", async () => {
  const answer = await explainRootArc({
    snapshot,
    current: null,
    browser,
    query,
  });
  expect(answer.disposition).toBe("refused");
  expect(answer.reason).toMatch(/current.*unknown/iu);
});

test("refuses a mismatched conversation or document incarnation", async () => {
  for (const key of [
    "conversationId",
    "documentId",
    "incarnationId",
  ] as const) {
    const answer = await explainRootArc({
      snapshot,
      current,
      browser: { ...browser, binding: { ...browser.binding, [key]: "other" } },
      query,
    });
    expect(answer.disposition).toBe("refused");
  }
});

test("conflicting deliveries are attempts, never causes", async () => {
  const conflicting = structuredClone(resultMessage);
  conflicting.id = "conflicting-control";
  for (const part of conflicting.parts)
    if (part.type === "text")
      part.text = part.text.replace('"applied":true', '"applied":false');
  const answer = await explainRootArc({
    snapshot: { ...snapshot, messages: [...messages, conflicting] },
    current,
    browser,
    query,
  });
  expect(answer.disposition).toBe("refused");
});

test("refuses a new settlement when successful history exists but current state is missing", () => {
  expect(() => workpieceEvidenceSources(snapshot, null)).toThrow(
    /recovery is required/iu,
  );
});

test.each(["no-op", "failed", "stale", "unknown"] as const)(
  "never attributes a %s negative attempt as a change",
  async (outcome) => {
    // Mutated negative controls over the retained actual browser record, not new browser evidence.
    const negative = structuredClone(resultMessage);
    const rows = JSON.parse(body) as {
      toolCallId: string;
      output: { applied: boolean };
      metadata: {
        transitionRecord: { outcome: string; attempts: ArcTransitionAttempt[] };
      };
    }[];
    const row = rows[0];
    const original = row?.metadata.transitionRecord.attempts[0];
    if (!row || !original) throw new Error("Retained actual attempt absent.");
    if (outcome === "stale") {
      const transition = original.pre.definition.transitions[0];
      if (!transition) throw new Error("Retained transition absent.");
      transition.name += " external control";
      original.pre.sha256 = createHash("sha256")
        .update(JSON.stringify(original.pre.definition))
        .digest("hex");
    }
    original.post = structuredClone(original.pre);
    original.effects = { created: [], updated: [], deleted: [], derived: [] };
    original.outcome = outcome;
    if (outcome === "failed") original.error = "TEST failing executor control";
    row.metadata.transitionRecord.outcome = outcome;
    row.output.applied = false;
    for (const part of negative.parts)
      if (part.type === "text") part.text = JSON.stringify(rows);
    const answer = await explainRootArc({
      snapshot: {
        ...snapshot,
        messages: messages.map((message) =>
          message.id === resultMessage.id ? negative : message,
        ),
      },
      current,
      browser,
      query,
    });
    expect(answer.recordedChange).toBeUndefined();
    expect(answer.attempts).toContainEqual({
      toolCallId: row.toolCallId,
      outcome,
    });
    expect(answer.disposition).not.toBe("supported");
  },
);

const a5Snapshot = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("./fixtures/reconciliation/a5-history.json.gz", import.meta.url),
    ),
  ).toString("utf8"),
) as FlueConversationSnapshot;
const a5Result = clientToolHistoryFrom(a5Snapshot.messages).results.find(
  (result) => result.toolCallId === "a5-declared-arc",
);
if (!a5Result) throw new Error("Actual A5 browser result missing.");
const a5Attempt = (
  a5Result.metadata as {
    transitionRecord: { attempts: ArcTransitionAttempt[] };
  }
).transitionRecord.attempts[0];
if (!a5Attempt) throw new Error("Actual A5 browser attempt missing.");
const a5Browser = {
  binding: a5Attempt.binding,
  requestedBaseHash: a5Attempt.request.requestedBaseHash,
};
const a5Current = retainedSettledRevision(a5Snapshot, "a5-carried-revision");
if (!a5Current) throw new Error("Actual carried revision missing.");

test("a repeated read delivery cannot become a fresh live observation", async () => {
  const read = a5Snapshot.messages.find((message) =>
    clientToolHistoryFrom([message]).results.some(
      (result) => result.toolCallId === "a5-declared-live-2",
    ),
  );
  if (!read) throw new Error("Actual read result missing.");
  const duplicate = { ...read, id: "duplicate-read-control" };
  await expect(
    recordedBrowserObservation(
      { ...a5Snapshot, messages: [...a5Snapshot.messages, duplicate] },
      a5Browser,
      "a5-declared-live-2",
    ),
  ).rejects.toThrow(/conflicting correlated browser observation/iu);
});

test("exact recorded basis resolves actual sources while an overbroad locator does not manufacture support", async () => {
  const answer = await explainRootArc({
    snapshot: a5Snapshot,
    current: a5Current,
    browser: a5Browser,
    query,
  });
  expect(answer.governing?.passages[0]?.relations[0]?.sources[0]?.role).toBe(
    "user",
  );
  expect(answer.governing?.status).toBe("superseded");
  expect(answer.disposition).toBe("partially-supported");
  const broad = structuredClone(a5Snapshot);
  for (const message of broad.messages)
    for (const part of message.parts)
      if (
        part.type === "dynamic-tool" &&
        part.toolCallId === "a5-declared-arc"
      ) {
        const input = part.input as {
          brunch: { basis: { locators: { start: number; end: number }[] } };
        };
        input.brunch.basis.locators = [
          { start: 0, end: a5Current.markdown.indexOf("\n\nUnrelated") },
        ];
      }
  const unsupported = await explainRootArc({
    snapshot: broad,
    current: a5Current,
    browser: a5Browser,
    query,
  });
  expect(unsupported.governing?.passages[0]?.standing).toBe(
    "temporal-context-only",
  );
  expect(unsupported.governing?.passages[0]?.relations).toEqual([]);
  expect(unsupported.quality.semanticUtility).toBe(
    "owner-adjudication-required",
  );
});
