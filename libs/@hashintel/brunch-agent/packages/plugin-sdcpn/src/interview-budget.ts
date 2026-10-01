import * as v from "valibot";

const count = v.pipe(v.number(), v.integer(), v.minValue(0));

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

export const interviewBudgetInstruction = (
  budget: InterviewBudget | undefined,
): string | undefined => {
  if (!budget) return undefined;
  const timeGuide = {
    quick: "about 5 minutes",
    standard: "about 10 minutes",
    thorough: "about 20 minutes",
    deep: "no limit",
  }[budget.level];
  const next =
    budget.remaining === null
      ? "There is no cap; offer a pause between topics rather than closing because of the count."
      : budget.remaining === 0
        ? "The cap is reached: settle this answer, then close with stated facts, Assumed facts and open items listed by name; do not ask another question."
        : budget.remaining === 1
          ? "Make the last question the most consequential open fact."
          : "Choose the next question according to this level.";
  return `Interview budget: the person chose ${budget.level} (${timeGuide}; minutes are a guide, not a timer). Follow the Budget section of sdcpn-modelling. Record the level on the first turn under "Available time and assumption appetite", and update it when changed without repeating settled facts. Questions asked: ${budget.asked}; cap: ${budget.questionCap ?? "none"}; remaining: ${budget.remaining ?? "unlimited"}. ${next} Never invent operational facts, ranges or units. Reaching the cap is not completion; leave unsupported facts open.`;
};
