import {
  interviewBudgetContextKey,
  parseInterviewBudget,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { parsePetrinautUserMessageBody } from "@hashintel/brunch-agent-transport-aisdk";

import type { FlueConversationMessage, FlueConversationState } from "@flue/sdk";

const closesInterview = (message: FlueConversationMessage): boolean =>
  message.parts.some((part) => {
    if (part.type !== "text") return false;
    const body = parsePetrinautUserMessageBody(part.text);
    return (
      parseInterviewBudget(
        body.kind === "contextual"
          ? body.submissionContext?.[interviewBudgetContextKey]
          : undefined,
      )?.remaining === 0
    );
  });

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
  const answeredBy = new Map(
    settlements.flatMap(({ submissionId, answeredBySubmissionId }) =>
      answeredBySubmissionId === undefined
        ? []
        : [[submissionId, answeredBySubmissionId] as const],
    ),
  );
  // A closing answer that joined a busy response is answered by the host
  // submission's later messages; host replies before it were still questions.
  const wrapUpSubmissions = new Set<string>();
  let replies = 0;
  for (const message of messages) {
    if (message.purpose === "user" && message.submissionId !== undefined) {
      if (closesInterview(message)) {
        wrapUpSubmissions.add(message.submissionId);
        const host = answeredBy.get(message.submissionId);
        if (host !== undefined) wrapUpSubmissions.add(host);
      }
    } else if (
      message.role === "assistant" &&
      message.purpose === "assistant" &&
      message.display === "visible" &&
      !wrapUpSubmissions.has(message.submissionId ?? "") &&
      message.parts.some(
        (part) =>
          part.type === "text" && part.state === "done" && part.text.trim(),
      )
    ) {
      replies++;
    }
  }
  return replies;
};

/**
 * Whether the latest submission was sent with no questions remaining, so
 * Brunch is wrapping up rather than awaiting an answer to its last question.
 */
export const isInterviewClosing = ({
  messages,
}: Pick<FlueConversationState, "messages">): boolean => {
  const latest = messages.findLast(
    (message) =>
      message.purpose === "user" && message.submissionId !== undefined,
  );
  return latest !== undefined && closesInterview(latest);
};
