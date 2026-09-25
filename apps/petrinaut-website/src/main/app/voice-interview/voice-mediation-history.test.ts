import { expect, test } from "vitest";

import { VoiceMediationHistory } from "./voice-mediation-history";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

test("anchors an experiment summary after the card without fabricating a user turn", () => {
  const history = new VoiceMediationHistory("conversation");
  history.result("result", ["card"]);
  history.caption("result", "wrapUp", {
    text: "The comparison finished.",
    state: "done",
  });
  const messages: PetrinautAiMessage[] = [
    { id: "card", role: "assistant", parts: [{ type: "data-card", data: {} }] },
  ];
  expect(history.project(messages).map((message) => message.id)).toEqual([
    "card",
    "voice-wrap-up:result",
  ]);
  expect(history.project([])).toEqual([]);
});

test("projects transcript, acknowledgement, work and wrap-up without changing canonical text", () => {
  const history = new VoiceMediationHistory("conversation");
  history.begin({ id: "input", text: "Um, compare two to eight agents" });
  history.prepared("input", {
    decide: "two to eight agents",
    runs: "Still open",
  });
  history.admitted("input", "submission");
  history.caption("input", "reply", {
    text: "I'll pass that to Brunch.",
    state: "done",
  });
  history.settled("input", ["answer", "card"]);
  history.caption("input", "wrapUp", {
    text: "The draft is ready to run.",
    state: "streaming",
  });
  const messages: PetrinautAiMessage[] = [
    {
      id: "input",
      role: "user",
      parts: [{ type: "text", text: "BRIEF ONLY" }],
    },
    {
      id: "answer",
      role: "assistant",
      parts: [{ type: "text", text: "Written answer" }],
    },
    { id: "card", role: "assistant", parts: [{ type: "data-card", data: {} }] },
  ];
  const projected = history.project(messages);
  expect(projected.map((message) => message.id)).toEqual([
    "input",
    "voice-reply:input",
    "answer",
    "card",
    "voice-wrap-up:input",
  ]);
  expect(projected[0]?.parts).toEqual([
    { type: "text", text: "Um, compare two to eight agents" },
    {
      type: "data-brief",
      data: {
        fields: { decide: "two to eight agents", runs: "Still open" },
        state: "done",
      },
    },
  ]);
  expect(messages[0]?.parts).toEqual([{ type: "text", text: "BRIEF ONLY" }]);
  expect(projected.at(-1)?.parts[0]).toEqual({
    type: "data-voiceAgentWrapUp",
    data: { text: "The draft is ready to run.", state: "streaming" },
  });
});

test("reopens local captions against canonical submission identities without phantom inputs", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  const history = new VoiceMediationHistory("conversation", storage);
  history.begin({ id: "original-id", text: "Raw words" });
  history.admitted("original-id", "submission");
  history.caption("original-id", "reply", {
    text: "Heard you.",
    state: "streaming",
  });
  history.begin({ id: "never-admitted", text: "Pending" });
  const restored = new VoiceMediationHistory("conversation", storage);
  restored.sync({
    conversationId: "conversation",
    settlements: [],
    messages: [
      {
        id: "canonical-user",
        role: "user",
        purpose: "user",
        display: "visible",
        submissionId: "submission",
        parts: [{ type: "text", text: "Brief", state: "done" }],
      },
    ],
  });
  const projected = restored.project([
    {
      id: "canonical-user",
      role: "user",
      parts: [{ type: "text", text: "Brief" }],
    },
  ]);
  expect(projected).toHaveLength(2);
  expect(projected[0]?.parts[0]).toEqual({ type: "text", text: "Raw words" });
  expect(projected[1]?.parts[0]).toEqual({
    type: "data-voiceAgentReply",
    data: { text: "Heard you.", state: "done" },
  });
  expect(
    new VoiceMediationHistory("other-conversation", storage).project([]),
  ).toEqual([]);
});
