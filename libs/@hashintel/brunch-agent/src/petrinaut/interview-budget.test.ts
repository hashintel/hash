import { describe, expect, it } from "vitest";

import { interviewBudget, parseInterviewBudget } from "./interview-budget";

describe("interview budget", () => {
  it("builds allowances the parser accepts, including Deep without a cap", () => {
    expect(interviewBudget("quick", 3, 2)).toEqual({
      level: "quick",
      questionCap: 3,
      asked: 2,
      remaining: 1,
    });
    expect(interviewBudget("quick", 3, 4).remaining).toBe(0);
    for (const budget of [
      interviewBudget("quick", 3, 2),
      interviewBudget("quick", 3, 4),
      interviewBudget("deep", null, 14),
    ])
      expect(parseInterviewBudget(budget)).toEqual(budget);
  });

  it.each([
    { level: "off", questionCap: null, asked: 0, remaining: null },
    { level: "quick", questionCap: 3, asked: -1, remaining: 4 },
    { level: "quick", questionCap: 3, asked: 1.5, remaining: 1.5 },
    { level: "quick", questionCap: null, asked: 0, remaining: null },
    { level: "deep", questionCap: 3, asked: 0, remaining: 3 },
    { level: "standard", questionCap: 6, asked: 5, remaining: 3 },
  ])("reads an invalid budget as Off: %j", (budget) => {
    expect(parseInterviewBudget(budget)).toBeUndefined();
  });
});
