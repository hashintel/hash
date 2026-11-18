import { interviewBudgetLevels } from "@hashintel/brunch-agent/interview-budget";

/**
 * The website's Labs flag and saved level for `--interview-length`. With both
 * in the panel's storage, every submission carries that level's allowance.
 * The keys are the website's own (`interview-budget-preference.ts`).
 */
export const interviewLengthStorage = (
  value: string,
): Readonly<Record<string, string>> => {
  const level = interviewBudgetLevels.find((candidate) => candidate === value);
  if (level === undefined)
    throw new Error(
      `--interview-length must be one of ${interviewBudgetLevels.join("|")}`,
    );
  return {
    "petrinaut-website:interview-budget-enabled": "true",
    "petrinaut-website:interview-budget": level,
  };
};
