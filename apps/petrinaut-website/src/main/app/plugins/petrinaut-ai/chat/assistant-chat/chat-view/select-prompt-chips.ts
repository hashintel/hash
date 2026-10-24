import { REVIEW_CHIPS, STARTER_CHIPS, type PromptChip } from "./prompt-chips";

export const selectPromptChips = ({
  hasConversation,
  isNetEmpty,
}: {
  hasConversation: boolean;
  isNetEmpty: boolean;
}): PromptChip[] => {
  if (!isNetEmpty) {
    return REVIEW_CHIPS;
  }
  if (hasConversation) {
    return [];
  }

  return STARTER_CHIPS;
};
