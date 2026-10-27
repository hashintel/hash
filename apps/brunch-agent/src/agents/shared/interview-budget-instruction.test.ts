import { describe, expect, it } from "vitest";

import { interviewBudgetInstruction } from "./interview-budget-instruction";

describe("interview budget instruction", () => {
  it("is absent without an allowance", () => {
    expect(interviewBudgetInstruction(undefined)).toBeUndefined();
  });

  it("tells the model the level and allowance, never a clock", () => {
    const instruction = interviewBudgetInstruction({
      level: "standard",
      questionCap: 6,
      asked: 2,
      remaining: 4,
    });
    expect(instruction).toContain("the user chose standard.");
    expect(instruction).toContain("cap: 6; remaining: 4");
    expect(instruction).toContain("`appetite` entity");
    expect(instruction).toContain("replaces your own estimate of turns left");
    expect(instruction).not.toMatch(/minute/i);
  });

  it("distinguishes the last question from closing", () => {
    const budget = {
      level: "quick",
      questionCap: 3,
      asked: 2,
      remaining: 1,
    } as const;
    expect(interviewBudgetInstruction(budget)).toContain(
      "most consequential open fact",
    );
    expect(
      interviewBudgetInstruction({ ...budget, asked: 4, remaining: 0 }),
    ).toContain("do not ask another question");
  });

  it("keeps Deep unlimited", () => {
    expect(
      interviewBudgetInstruction({
        level: "deep",
        questionCap: null,
        asked: 14,
        remaining: null,
      }),
    ).toContain("pause between topics");
  });
});
