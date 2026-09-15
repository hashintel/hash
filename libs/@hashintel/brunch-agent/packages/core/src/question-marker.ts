import * as v from "valibot";

export const LEGACY_BRUNCH_QUESTION_TOOL_NAME = "brunch_mark_question";
export const LEGACY_QUESTION_REPLAY_TOOL_NAME = "mark_question_for_replay";
/** @deprecated Retained only for source compatibility with historical projections. */
export const BRUNCH_QUESTION_TOOL_NAME = LEGACY_BRUNCH_QUESTION_TOOL_NAME;
export const BRUNCH_QUESTION_TOOL_NAMES = [
  LEGACY_BRUNCH_QUESTION_TOOL_NAME,
  LEGACY_QUESTION_REPLAY_TOOL_NAME,
] as const;
export const BRUNCH_QUESTION_DATA_NAME = "brunch-question";

const NonBlankStringSchema = v.pipe(
  v.string(),
  v.check((value) => /\S/u.test(value), "Expected a non-blank string."),
);

export const BrunchQuestionInputSchema = v.object({
  question: NonBlankStringSchema,
});

export const BrunchQuestionDataSchema = v.object({
  question: NonBlankStringSchema,
  toolCallId: NonBlankStringSchema,
});

export type BrunchQuestionData = v.InferOutput<typeof BrunchQuestionDataSchema>;

export const parseBrunchQuestionData = (
  value: unknown,
): BrunchQuestionData | undefined => {
  const result = v.safeParse(BrunchQuestionDataSchema, value);

  return result.success ? result.output : undefined;
};
