import { expect, test } from "vitest";

import { formatPersonaResult } from "../persona-cli.ts";
import { personaTranscriptFrom } from "./transcript.ts";

import type {
  FlueConversationMessage,
  FlueConversationPart,
  FlueConversationSnapshot,
} from "@flue/sdk";

const offer = (
  toolCallId: string,
  questions: readonly object[],
  state = "output-available",
) =>
  ({
    type: "dynamic-tool",
    toolCallId,
    toolName: "offer_answers",
    state,
    input: { questions },
    ...(state === "output-error"
      ? { errorText: "rejected" }
      : { output: { ok: true } }),
  }) as FlueConversationPart;

const text = (value: string) =>
  ({ type: "text", text: value }) as FlueConversationPart;

const message = (
  id: string,
  purpose: "user" | "assistant",
  submissionId: string,
  parts: FlueConversationPart[],
  extra: Partial<FlueConversationMessage> = {},
): FlueConversationMessage => ({
  id,
  role: purpose,
  purpose,
  display: "visible",
  submissionId,
  parts,
  ...extra,
});

/** Completed offers, a failed and a stopped turn, then a later exchange. */
const snapshot: FlueConversationSnapshot = {
  v: 1,
  conversationId: "conversation",
  offset: "9",
  settlements: [
    { submissionId: "sub_1", outcome: "completed" },
    { submissionId: "sub_1c", outcome: "completed" },
    { submissionId: "sub_2", outcome: "failed" },
    { submissionId: "sub_3", outcome: "aborted" },
    { submissionId: "sub_4", outcome: "completed" },
  ],
  messages: [
    message("u1", "user", "sub_1", [text("We run a support desk.")]),
    message("a1", "assistant", "sub_1", [
      text("Two things first."),
      offer("o1", [
        {
          kind: "confirm",
          label: "Weekends",
          text: "Is the desk closed at weekends?",
        },
        {
          kind: "choose",
          label: "Channel",
          text: "Which channel brings most tickets?",
          options: [
            { label: "Email" },
            { label: "Phone", value: "Calls to the main line" },
          ],
        },
      ]),
      // A rejected offer asks nothing.
      offer(
        "o_bad",
        [{ kind: "open", label: "Rejected", text: "Never docked?" }],
        "output-error",
      ),
    ]),
    // A browser-tool continuation of the same turn adds a later offer.
    message("a1c", "assistant", "sub_1c", [
      offer("o2", [
        {
          kind: "values",
          label: "Staffing",
          text: "How many agents per shift?",
          fields: [{ label: "Day", unit: "agents" }, { label: "Night" }],
        },
      ]),
    ]),
    message("u2", "user", "sub_2", [text("Mostly email.")]),
    message("a2", "assistant", "sub_2", [
      text("Partial thought"),
      offer("o3", [
        { kind: "open", label: "Failed ask", text: "From a failed turn?" },
      ]),
    ]),
    message("f2", "assistant", "sub_2", [text("The response failed.")], {
      purpose: "advisory",
      role: "system",
      settlement: { outcome: "failed" },
    }),
    message("u3", "user", "sub_3", [text("Hello?")]),
    message("a3", "assistant", "sub_3", [
      offer("o4", [
        { kind: "open", label: "Stopped ask", text: "From a stopped turn?" },
      ]),
    ]),
    message("u4", "user", "sub_4", [text("Weekends are closed.")]),
    message("a4", "assistant", "sub_4", [text("Noted, thanks.")]),
  ],
};

test("the transcript keeps a completed turn's offered questions once, without live instructions", () => {
  const entries = personaTranscriptFrom(snapshot);
  const printed = formatPersonaResult({ type: "get_transcript" }, [
    {
      type: "response",
      command: "get_transcript",
      success: true,
      data: { entries },
    },
  ]);
  expect(printed).toBe(
    [
      "You: We run a support desk.",
      [
        "Brunch: Two things first.",
        "",
        "Brunch asked:",
        "1. Weekends: Is the desk closed at weekends?",
        "   - Yes",
        "2. Channel: Which channel brings most tickets?",
        "   - Email",
        "   - Phone: Calls to the main line",
        "3. Staffing: How many agents per shift?",
        "   Fields: Day (agents), Night",
      ].join("\n"),
      "You: Mostly email.",
      "Brunch: Partial thought",
      "You: Hello?",
      "You: Weekends are closed.",
      "Brunch: Noted, thanks.",
    ].join("\n\n"),
  );
  for (const live of ["`say`", "`answer`", "Pick one", "Give:"])
    expect(printed).not.toContain(live);
  for (const unsettled of ["Failed ask", "Stopped ask", "Rejected"])
    expect(printed).not.toContain(unsettled);
});

test("an unsettled turn's offer is not recorded", () => {
  const unsettled = {
    ...snapshot,
    settlements: snapshot.settlements.filter(
      ({ submissionId }) => submissionId !== "sub_1c",
    ),
  };
  const [, first] = personaTranscriptFrom(unsettled);
  expect(first).toEqual({ speaker: "brunch", text: "Two things first." });
});
