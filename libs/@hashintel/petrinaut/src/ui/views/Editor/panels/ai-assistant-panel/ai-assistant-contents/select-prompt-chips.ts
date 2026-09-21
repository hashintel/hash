import {
  REVIEW_CHIPS,
  STARTER_CHIPS,
  START_POSTURE_CHIPS,
  type PromptChip,
} from "./prompt-chips";

export const selectPromptChips = ({
  hasConversation,
  isNetEmpty,
  offerStartPosture,
}: {
  hasConversation: boolean;
  isNetEmpty: boolean;
  offerStartPosture: boolean;
}): PromptChip[] => {
  if (offerStartPosture && isNetEmpty && !hasConversation) {
    return START_POSTURE_CHIPS;
  }
  if (!isNetEmpty) {
    return REVIEW_CHIPS;
  }
  if (hasConversation) {
    return [];
  }
  return STARTER_CHIPS;
};
