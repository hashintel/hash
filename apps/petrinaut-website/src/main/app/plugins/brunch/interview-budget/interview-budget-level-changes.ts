import { interviewBudgetLevelsConfig } from "../../../../../shared/interview-budget";

import type { InterviewBudgetLevel } from "../../../../../shared/interview-budget";
import type { PetrinautAiMessage } from "../chat/ai-assistant-panel";

/** A level change, shown as a note after the message it followed. */
export interface InterviewBudgetLevelChange {
  readonly conversationId: string;
  readonly after: {
    readonly id: string;
    readonly role: PetrinautAiMessage["role"];
    readonly ordinal: number;
  };
  /** The level before this note's first change. */
  readonly from: InterviewBudgetLevel;
  readonly level: InterviewBudgetLevel;
  readonly message: PetrinautAiMessage;
}

/** Each message's 1-based position among messages of the same role. */
const ordinalsByRole = (messages: readonly PetrinautAiMessage[]): number[] => {
  const counts = new Map<PetrinautAiMessage["role"], number>();
  return messages.map((message) => {
    const ordinal = (counts.get(message.role) ?? 0) + 1;
    counts.set(message.role, ordinal);
    return ordinal;
  });
};

/** A note for a change from one level to another after the latest message, if there is one. */
export const createInterviewBudgetLevelChange = (
  conversationId: string,
  messages: readonly PetrinautAiMessage[],
  { from, to: level }: { from: InterviewBudgetLevel; to: InterviewBudgetLevel },
): InterviewBudgetLevelChange | undefined => {
  const last = messages.at(-1);
  const lastOrdinal = ordinalsByRole(messages).at(-1);
  if (!last || lastOrdinal === undefined) return undefined;
  const config = interviewBudgetLevelsConfig[level];
  return {
    conversationId,
    from,
    level,
    after: { id: last.id, role: last.role, ordinal: lastOrdinal },
    message: {
      id: `interview-budget:${crypto.randomUUID()}`,
      role: "system",
      parts: [{ type: "text", text: `${config.name} · ${config.guide}` }],
    },
  };
};

/**
 * Add a change to the recorded notes. With no message since its conversation's
 * previous note, the change replaces that note, so stepping through levels
 * leaves one note for the final level, and none when it returns to the level
 * before the note.
 */
export const recordInterviewBudgetLevelChange = (
  changes: readonly InterviewBudgetLevelChange[],
  change: InterviewBudgetLevelChange,
): InterviewBudgetLevelChange[] => {
  const previousIndex = changes.findLastIndex(
    ({ conversationId }) => conversationId === change.conversationId,
  );
  const previous = changes[previousIndex];
  if (
    previous === undefined ||
    previous.after.role !== change.after.role ||
    previous.after.ordinal !== change.after.ordinal
  )
    return [...changes, change];
  const others = changes.filter((_, index) => index !== previousIndex);
  return previous.from === change.level
    ? others
    : [...others, { ...change, from: previous.from }];
};

/** Insert this conversation's level-change notes after the messages they followed. */
export const withInterviewBudgetLevelChanges = (
  messages: PetrinautAiMessage[],
  changes: readonly InterviewBudgetLevelChange[],
  conversationId: string | null,
): PetrinautAiMessage[] => {
  // Canonical history re-identifies an optimistic user message once its turn
  // settles, so an anchor whose id is gone falls back to its position among
  // messages of the same role.
  const ids = new Set(messages.map((message) => message.id));
  const ordinals = ordinalsByRole(messages);
  return messages.flatMap((message, index) => [
    message,
    ...changes
      .filter(
        (change) =>
          change.conversationId === conversationId &&
          (ids.has(change.after.id)
            ? change.after.id === message.id
            : change.after.role === message.role &&
              change.after.ordinal === ordinals[index]),
      )
      .map((change) => change.message),
  ]);
};
