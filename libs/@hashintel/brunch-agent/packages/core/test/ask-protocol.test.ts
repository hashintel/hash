import * as v from "valibot";
import { describe, expect, test } from "vitest";

import {
  ASK_TOOL_DESCRIPTION,
  askProtocolInstructionFragments,
  AskSubmission,
  buildReplyBindingSignalPayload,
  decideAskReplyAdmission,
  decidePendingAffordance,
  mintAskAffordance,
  pendingAskAffordanceId,
} from "../src/ask-protocol";

import type { SweepSessionEntry } from "../src/sweep-protocol";

const firstAffordance = mintAskAffordance(
  "What outcome should the scenario describe?",
  "tool-call-1",
);

describe("ask protocol", () => {
  test("mints the free-text affordance from the question and call id", () => {
    expect(firstAffordance).toEqual({
      id: "affordance_tool-call-1",
      form: "free-text",
      markdown: "What outcome should the scenario describe?",
      payload: { question: "What outcome should the scenario describe?" },
    });
  });

  test("accepts the first live affordance", () => {
    const candidate = mintAskAffordance(
      "Who initiates the outcome?",
      "tool-call-2",
    );

    expect(decidePendingAffordance(null, candidate)).toEqual({
      ok: true,
      pending: candidate,
    });
  });

  test("refuses a second live affordance with the existing diagnostic", () => {
    const candidate = mintAskAffordance("What happens next?", "tool-call-2");

    expect(decidePendingAffordance(firstAffordance, candidate)).toEqual({
      ok: false,
      reason:
        "An interactive affordance is already pending (affordance_tool-call-1); wait for its reply before asking another question.",
    });
  });

  test("builds the mechanical reply-binding signal from the pending affordance", () => {
    expect(buildReplyBindingSignalPayload(firstAffordance)).toEqual({
      type: "affordance-reply-bound",
      tagName: "affordance-reply-bound",
      body: [
        "The immediately preceding user message is mechanically bound as the reply to this pending affordance:",
        "What outcome should the scenario describe?",
      ].join("\n\n"),
      attributes: { affordanceId: "affordance_tool-call-1" },
    });
  });

  test("reports the last emitted affordance without a bound reply as pending", () => {
    const entries: SweepSessionEntry[] = [
      { id: "entry-1", kind: "user", text: "Start." },
      {
        id: "entry-2",
        kind: "assistant",
        text: "",
        affordances: [
          { id: "affordance_tool-call-1", markdown: "First question?" },
        ],
      },
    ];

    expect(pendingAskAffordanceId(entries)).toBe("affordance_tool-call-1");
  });

  test("stops reporting an affordance as pending once a reply is bound to it", () => {
    const entries: SweepSessionEntry[] = [
      {
        id: "entry-1",
        kind: "assistant",
        text: "",
        affordances: [
          { id: "affordance_tool-call-1", markdown: "First question?" },
        ],
      },
      {
        id: "entry-2",
        kind: "user-affordance-payload",
        text: "The answer.",
        replyToAffordanceId: "affordance_tool-call-1",
      },
    ];

    expect(pendingAskAffordanceId(entries)).toBeUndefined();
    expect(pendingAskAffordanceId([])).toBeUndefined();
  });

  test("admits only the pending ask’s correlated submission", () => {
    expect(
      decideAskReplyAdmission("affordance_tool-call-1", "tool-call-1"),
    ).toEqual({ ok: true });
    expect(decideAskReplyAdmission(undefined, "tool-call-1")).toEqual({
      ok: false,
      reason: "no-pending-ask",
    });
    expect(
      decideAskReplyAdmission("affordance_tool-call-1", "tool-call-9"),
    ).toEqual({
      ok: false,
      reason: "different-ask-pending",
    });
  });

  test("accepts only a non-empty answer as a submitted ask output", () => {
    expect(
      v.safeParse(AskSubmission, { answer: "A settled order." }).success,
    ).toBe(true);
    for (const output of [
      { answer: "" },
      {},
      null,
      "A settled order.",
      { answer: 42 },
    ]) {
      expect(v.safeParse(AskSubmission, output).success).toBe(false);
    }
  });

  test("supplies render-invariant instruction fragments", () => {
    expect(ASK_TOOL_DESCRIPTION).toBe(
      "Ask one free-text question and suspend this turn for the person’s reply. A second ask in the same tool batch is rejected.",
    );
    expect(askProtocolInstructionFragments("gherkin")).toEqual([
      "You are interviewing someone to elicit gherkin.",
      "Ask one question at a time with brunch_ask.",
      "Continue the conversation after each reply, using the harness-provided reply binding as a mechanical fact.",
    ]);
  });
});
