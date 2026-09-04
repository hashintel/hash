import { readFile } from "node:fs/promises";

import * as v from "valibot";
import { describe, expect, test, vi } from "vitest";

import { createBrunchQuestionMarkerTool } from "../src/flue";
import {
  BRUNCH_QUESTION_DATA_NAME,
  BRUNCH_QUESTION_TOOL_NAME,
  BrunchQuestionDataSchema,
  BrunchQuestionInputSchema,
  parseBrunchQuestionData,
} from "../src/question-marker";

describe("the Brunch question marker", () => {
  test("defines one non-interactive tool and data-part identity", () => {
    expect(BRUNCH_QUESTION_TOOL_NAME).toBe("brunch_mark_question");
    expect(BRUNCH_QUESTION_DATA_NAME).toBe("brunch-question");
  });

  test("preserves exact non-blank question text and tool-call identity", () => {
    const question = "  Which line should run this order?  ";

    expect(
      v.parse(BrunchQuestionInputSchema, {
        question,
      }),
    ).toEqual({ question });
    expect(
      v.parse(BrunchQuestionDataSchema, {
        question,
        toolCallId: "tool-question-1",
      }),
    ).toEqual({ question, toolCallId: "tool-question-1" });
  });

  test("writes the exact marker without terminating or waiting for an answer", async () => {
    const writeQuestion = vi.fn();
    const tool = createBrunchQuestionMarkerTool(writeQuestion);

    const result = await tool.run({
      data: { question: "Which line should run this order?" },
      log: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      },
      toolCallId: "tool-question-1",
    });

    expect(writeQuestion).toHaveBeenCalledOnce();
    expect(writeQuestion).toHaveBeenCalledWith({
      question: "Which line should run this order?",
      toolCallId: "tool-question-1",
    });
    expect(result).toEqual({ output: { marked: true } });
  });

  test.each([
    { question: "" },
    { question: "   " },
    { question: "What matters?", toolCallId: "" },
    { question: "What matters?", toolCallId: "   " },
  ])("rejects an incomplete marker: %j", (marker) => {
    expect(v.safeParse(BrunchQuestionDataSchema, marker).success).toBe(false);
    expect(parseBrunchQuestionData(marker)).toBeUndefined();
  });

  test("parses exact question data at the client projection boundary", () => {
    const marker = {
      question: "  Which line should run this order?  ",
      toolCallId: "tool-question-1",
    };

    expect(parseBrunchQuestionData(marker)).toEqual(marker);
    expect(parseBrunchQuestionData(null)).toBeUndefined();
  });

  test("instructs the model to mark and then reproduce the exact question in ordinary prose", async () => {
    const systemPrompt = await readFile(
      new URL("../src/prompts/SYSTEM.md", import.meta.url),
      "utf8",
    );

    expect(systemPrompt).toContain("brunch_mark_question");
    expect(systemPrompt).toContain("exact same question text");
    expect(systemPrompt).toContain("ordinary assistant prose");
    expect(systemPrompt).toContain("does not wait for or accept the answer");
  });
});
