import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { sdcpnInitialDataSchema } from "./initial-data";
import {
  interviewBudgetSchema,
  parseInterviewBudget,
} from "./interview-budget";

describe("interview budget", () => {
  it("keeps the allowance out of creation-only initial data", () => {
    const input = {
      binding: { conversationId: "c", documentId: "d", incarnationId: "i" },
    };
    expect(
      v.parse(sdcpnInitialDataSchema, {
        ...input,
        interviewBudget: {
          level: "quick",
          questionCap: 3,
          asked: 0,
          remaining: 3,
        },
      }),
    ).toEqual(input);
  });

  it("retains a current budget, including Deep without a cap", () => {
    const budget = {
      level: "quick",
      questionCap: 3,
      asked: 2,
      remaining: 1,
    } as const;
    expect(parseInterviewBudget(budget)).toEqual(budget);
    expect(parseInterviewBudget({ ...budget, asked: 4, remaining: 0 })).toEqual(
      { ...budget, asked: 4, remaining: 0 },
    );
    const deep = {
      level: "deep",
      questionCap: null,
      asked: 14,
      remaining: null,
    } as const;
    expect(parseInterviewBudget(deep)).toEqual(deep);
  });

  it.each([
    { level: "off", questionCap: null, asked: 0, remaining: null },
    { level: "quick", questionCap: 3, asked: -1, remaining: 4 },
    { level: "quick", questionCap: 3, asked: 1.5, remaining: 1.5 },
    { level: "quick", questionCap: null, asked: 0, remaining: null },
    { level: "deep", questionCap: 3, asked: 0, remaining: 3 },
    { level: "standard", questionCap: 6, asked: 5, remaining: 3 },
  ])("rejects an invalid budget: %j", (budget) => {
    expect(v.safeParse(interviewBudgetSchema, budget).success).toBe(false);
    expect(parseInterviewBudget(budget)).toBeUndefined();
  });
});
