import { expect, it } from "vitest";

import {
  countInterviewReplies,
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
  expect(interviewBudgetLabel("standard", "text", 2)).toBe("~7 min left");
  expect(interviewBudgetLabel("standard", "text", 5)).toBe(
    "1 question left · ~2 min",
  );
  expect(interviewBudgetLabel("standard", "text", 6)).toBe("Ready to wrap up");
  expect(interviewBudgetLabel("standard", "voice", 3)).toBe(
    "1 question left · ~3 min",
  );
  expect(interviewBudgetLabel("deep", "text", 4)).toBe("Question 4 · no limit");
  expect(interviewBudgetLabel("off", "voice", 2)).toBeNull();
});

it("counts batched and confirmation replies once, excluding tool-only and streaming messages", () => {
  expect(
    countInterviewReplies([
      { role: "user", parts: [{ type: "text", text: "hello" }] },
      {
        role: "assistant",
        parts: [
          { type: "text", text: "Who? How many?" },
          { type: "text", text: "What unit?" },
        ],
      },
      { role: "assistant", parts: [{ type: "text", text: "Recorded." }] },
      {
        role: "assistant",
        parts: [{ type: "text", text: "Not done", state: "streaming" }],
      },
      { role: "assistant", parts: [{ type: "tool-x" }] },
    ]),
  ).toBe(2);
});

it("adds no startup instruction for Off", () => {
  expect(liveInterviewBudgetInstruction("off")).toBe("");
  expect(liveInterviewBudgetInstruction("quick")).toContain("Brunch decides");
});
