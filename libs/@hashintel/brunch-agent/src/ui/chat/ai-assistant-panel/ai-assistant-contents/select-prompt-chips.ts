import { REVIEW_CHIPS, type PromptChip } from "./prompt-chips";

export const selectPromptChips = ({
  hasConversation,
  isNetEmpty,
  starterChips = [],
}: {
  hasConversation: boolean;
  isNetEmpty: boolean;
  starterChips?: PromptChip[];
}): PromptChip[] => {
  if (!isNetEmpty) {
    return REVIEW_CHIPS;
  }
  if (hasConversation) {
    return [];
  }

  return starterChips;
};
