import {
  interviewBudgetContextKey,
  parseInterviewBudget,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { parsePetrinautUserMessageBody } from "@hashintel/brunch-agent-transport-aisdk";

import type { FlueConversationState } from "@flue/sdk";

/**
 * Count canonical replies, not AI SDK rendering entries (which can merge steps
 * or lose text finality). The submitted allowance identifies wrap-up turns;
 * their summaries do not spend another question. No inference from prose.
 */
export const countInterviewReplies = ({
  messages,
  settlements = [],
}: Pick<FlueConversationState, "messages"> &
  Partial<Pick<FlueConversationState, "settlements">>): number => {
  const closingSubmissions = new Set<string>();
  for (const message of messages) {
    if (message.purpose !== "user" || message.submissionId === undefined)
      continue;
    for (const part of message.parts) {
      if (part.type !== "text") continue;
      const body = parsePetrinautUserMessageBody(part.text);
      const budget = parseInterviewBudget(
        body.kind === "contextual"
          ? body.submissionContext?.[interviewBudgetContextKey]
          : undefined,
      );
      if (budget?.remaining === 0) closingSubmissions.add(message.submissionId);
    }
  }
  // A closing answer that joined a busy response is answered by the host
  // submission's reply.
  for (const { submissionId, answeredBySubmissionId } of settlements) {
    if (
      answeredBySubmissionId !== undefined &&
      closingSubmissions.has(submissionId)
    )
      closingSubmissions.add(answeredBySubmissionId);
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
