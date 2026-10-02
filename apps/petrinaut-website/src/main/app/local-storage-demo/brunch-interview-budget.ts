import { parsePetrinautUserMessageBody } from "@hashintel/brunch-agent-transport-aisdk";

import type { FlueConversationMessage } from "@flue/sdk";

/**
 * Count canonical replies, not AI SDK rendering entries (which can merge steps
 * or lose text finality). The submitted allowance identifies wrap-up turns;
 * their summaries do not spend another question. No inference from prose.
 */
export const countInterviewReplies = (
  messages: readonly FlueConversationMessage[],
): number => {
  const closingSubmissions = new Set<string>();
  for (const message of messages) {
    if (message.purpose !== "user" || message.submissionId === undefined)
      continue;
    for (const part of message.parts) {
      if (part.type !== "text") continue;
      const body = parsePetrinautUserMessageBody(part.text);
      const budget =
        body.kind === "contextual" ? body.interviewBudget : undefined;
      if (
        typeof budget === "object" &&
        budget !== null &&
        "remaining" in budget &&
        budget.remaining === 0
      )
        closingSubmissions.add(message.submissionId);
    }
  }
  return messages.filter(
    (message) =>
      message.role === "assistant" &&
      message.purpose === "assistant" &&
      message.display === "visible" &&
      !closingSubmissions.has(message.submissionId ?? "") &&
      message.parts.some(
        (part) =>
          part.type === "text" && part.state === "done" && part.text.trim(),
      ),
  ).length;
};
