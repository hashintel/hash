import * as v from "valibot";

const count = v.pipe(v.number(), v.integer(), v.minValue(0));

/** The host's submission-context key for the current allowance. */
export const interviewBudgetContextKey = "interviewBudget";

/** A question allowance, never a clock or evidence that the model is complete. */
export const interviewBudgetSchema = v.pipe(
  v.strictObject({
    level: v.picklist(["quick", "standard", "thorough", "deep"]),
    questionCap: v.nullable(v.pipe(count, v.minValue(1))),
    asked: count,
    remaining: v.nullable(count),
  }),
  v.check(
    (budget) =>
      budget.level === "deep"
        ? budget.questionCap === null && budget.remaining === null
        : budget.questionCap !== null &&
          budget.remaining === Math.max(0, budget.questionCap - budget.asked),
    "The remaining question allowance must match the level, cap and count.",
  ),
);

export type InterviewBudget = v.InferOutput<typeof interviewBudgetSchema>;

/** Read an allowance from untrusted submission context; anything invalid means Off. */
export const parseInterviewBudget = (
  value: unknown,
): InterviewBudget | undefined => {
  const result = v.safeParse(interviewBudgetSchema, value);
  return result.success ? result.output : undefined;
};
