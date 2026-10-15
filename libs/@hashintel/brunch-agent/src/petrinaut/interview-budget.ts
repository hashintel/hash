import * as v from "valibot";

const count = v.pipe(v.number(), v.integer(), v.minValue(0));

/** The host's submission-context key for the current allowance. */
export const interviewBudgetContextKey = "interviewBudget";

/** The levels an allowance can name; Off sends no allowance. */
export const interviewBudgetLevels = [
  "quick",
  "standard",
  "thorough",
  "deep",
] as const;

/** A question allowance, never a clock or evidence that the model is complete. */
const interviewBudgetSchema = v.pipe(
  v.strictObject({
    level: v.picklist(interviewBudgetLevels),
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

/** The allowance for a level's cap after `asked` questions; Deep has no cap. */
export const interviewBudget = (
  level: InterviewBudget["level"],
  questionCap: number | null,
  asked: number,
): InterviewBudget => ({
  level,
  questionCap,
  asked,
  remaining: questionCap === null ? null : Math.max(0, questionCap - asked),
});
