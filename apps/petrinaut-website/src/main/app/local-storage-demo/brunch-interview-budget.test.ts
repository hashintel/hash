import { expect, test } from "vitest";

import {
  petrinautContextualUserMessageBody,
  snapshotToUiMessages,
} from "@hashintel/brunch-agent-transport-aisdk";

import { getInterviewBudget } from "../../../shared/interview-budget";
import { countInterviewReplies } from "./brunch-interview-budget";

import type { FlueConversationMessage } from "@flue/sdk";

const reply = (
  id: string,
  text: string,
  state: "streaming" | "done" = "done",
): FlueConversationMessage => ({
  id,
  submissionId: id,
  role: "assistant",
  purpose: "assistant",
  display: "visible",
  parts: [{ type: "text", text, state }],
});

test("canonical counting ignores display projection, partial text, tools and hidden messages", () => {
  const messages: FlueConversationMessage[] = [
    reply("batched", "How many agents? Which hours?"),
    reply("confirmation", "Recorded."),
    reply("pending", "What about", "streaming"),
    { ...reply("hidden", "Internal note"), display: "hidden" },
    { ...reply("tools", ""), parts: [] },
  ];
  expect(countInterviewReplies(messages)).toBe(2);
  // Projection marks text as done; it must never be the count's input.
  expect(
    snapshotToUiMessages({ messages }, { clientToolNames: new Set() }).length,
  ).toBeGreaterThan(2);
  messages[2] = reply("pending", "What about weekends?");
  expect(countInterviewReplies(messages)).toBe(3);
  const reloaded = JSON.parse(JSON.stringify(messages)) as typeof messages;
  expect(countInterviewReplies(reloaded)).toBe(3);
});

test("wrap-up does not spend a question when the length is raised after closing", () => {
  const messages = Array.from({ length: 6 }, (_, index) =>
    reply(`question-${index}`, "Recorded."),
  );
  messages.push(
    {
      id: "last-answer",
      submissionId: "wrap-up",
      role: "user",
      purpose: "user",
      display: "visible",
      parts: [
        {
          type: "text",
          state: "done",
          text: petrinautContextualUserMessageBody({
            userText: "Weekends too.",
            diagnosticsContext: "",
            interviewBudget: getInterviewBudget("standard", "text", 6),
          }),
        },
      ],
    },
    reply("wrap-up", "Stated: six agents. Open: arrival rate."),
  );
  expect(countInterviewReplies(messages)).toBe(6);
  expect(
    getInterviewBudget("thorough", "text", countInterviewReplies(messages)),
  ).toMatchObject({ asked: 6, remaining: 4 });
  // Off, Deep and old conversations without envelopes still count replies;
  // prose alone must not decide whether something is a closing turn.
  messages.push(reply("continued", "Here is a summary."));
  expect(countInterviewReplies(messages)).toBe(7);
});
