import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { sdcpnInitialDataSchema } from "../src/initial-data";
import {
  interviewBudgetInstruction,
  interviewBudgetSchema,
} from "../src/interview-budget";

describe("interview budget", () => {
  it("preserves the Off initialization exactly", () => {
    const input = {
      binding: { conversationId: "c", documentId: "d", incarnationId: "i" },
    };
    expect(v.parse(sdcpnInitialDataSchema, input)).toEqual(input);
    expect(interviewBudgetInstruction(undefined)).toBeUndefined();
  });

  it("retains a current budget and distinguishes the last question from closing", () => {
    const budget = {
      level: "quick",
      questionCap: 3,
      asked: 2,
      remaining: 1,
    } as const;
    expect(v.parse(interviewBudgetSchema, budget)).toEqual(budget);
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

  it.each([
    { level: "off", questionCap: null, asked: 0, remaining: null },
    { level: "quick", questionCap: 3, asked: -1, remaining: 4 },
    { level: "quick", questionCap: 3, asked: 1.5, remaining: 1.5 },
    { level: "quick", questionCap: null, asked: 0, remaining: null },
    { level: "deep", questionCap: 3, asked: 0, remaining: 3 },
    { level: "standard", questionCap: 6, asked: 5, remaining: 3 },
  ])("rejects an invalid budget: %j", (budget) => {
    expect(v.safeParse(interviewBudgetSchema, budget).success).toBe(false);
  });
});
