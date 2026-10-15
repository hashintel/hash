import type { InterviewBudget } from "@hashintel/brunch-agent";

/**
 * The current submission's allowance, restated for the model. The context
 * projection removes it from the user's turn, so this is the only place the
 * model reads it; without an allowance there is no instruction.
 */
export const interviewBudgetInstruction = (
  budget: InterviewBudget | undefined,
): string | undefined => {
  if (!budget) return undefined;
  const next =
    budget.remaining === null
      ? "There is no cap; offer a pause between topics rather than closing because of the count."
      : budget.remaining === 0
        ? "The cap is reached: settle this answer, then close with stated facts, assumed claims and open items listed by name; do not ask another question."
        : budget.remaining === 1
          ? "Make the last question the most consequential open fact."
          : "Choose the next question according to this level.";
  return `Interview length: the user chose ${budget.level}. Follow the Interview length section of \`eliciting\`. Record the level on the \`appetite\` entity, and supersede it when it changes without repeating settled facts. Questions asked: ${budget.asked}; cap: ${budget.questionCap ?? "none"}; remaining: ${budget.remaining ?? "unlimited"}. ${next} Never invent operational facts, ranges or units. Reaching the cap is not completion; leave unsupported facts open.`;
};
