import * as v from "valibot";

export const BRUNCH_QUESTION_TOOL_NAME = "brunch_mark_question";
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
