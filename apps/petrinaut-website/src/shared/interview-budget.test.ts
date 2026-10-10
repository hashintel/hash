import { expect, it } from "vitest";

import {
  getInterviewBudget,
  interviewBudgetLabel,
  liveInterviewBudgetInstruction,
} from "./interview-budget";

it("uses mode-specific caps and keeps already asked questions after a downgrade", () => {
  expect(getInterviewBudget("quick", "text", 4)).toEqual({
    level: "quick",
    questionCap: 3,
    asked: 4,
    remaining: 0,
  });
  expect(getInterviewBudget("standard", "voice", 1)).toEqual({
    level: "standard",
    questionCap: 4,
    asked: 1,
    remaining: 3,
  });
  expect(getInterviewBudget("thorough", "voice", 2)?.questionCap).toBe(7);
  expect(getInterviewBudget("thorough", "text", 2)?.questionCap).toBe(10);
  expect(getInterviewBudget("quick", "voice", 0)?.questionCap).toBe(2);
  expect(getInterviewBudget("deep", "voice", 12)).toEqual({
    level: "deep",
    questionCap: null,
    asked: 12,
    remaining: null,
  });
  expect(getInterviewBudget("off", "text", 12)).toBeUndefined();
});

it("renders a question-derived estimate, never a clock", () => {
  const asking = { closing: false };
  expect(interviewBudgetLabel("standard", "text", 2, asking)).toBe(
    "~7 min left",
  );
  expect(interviewBudgetLabel("standard", "text", 5, asking)).toBe(
    "1 question left · ~2 min",
  );
  expect(interviewBudgetLabel("standard", "voice", 3, asking)).toBe(
    "1 question left · ~3 min",
  );
  expect(interviewBudgetLabel("deep", "text", 4, asking)).toBe(
    "Question 4 · no limit",
  );
  expect(interviewBudgetLabel("off", "voice", 2, asking)).toBeNull();
});

it("separates the unanswered last question from wrapping up", () => {
  expect(interviewBudgetLabel("standard", "text", 6, { closing: false })).toBe(
    "Last question",
  );
  expect(interviewBudgetLabel("standard", "text", 6, { closing: true })).toBe(
    "Wrapping up",
  );
});

it("adds no startup instruction for Off", () => {
  expect(liveInterviewBudgetInstruction("off")).toBe("");
  expect(liveInterviewBudgetInstruction("quick")).toContain("Brunch decides");
});
