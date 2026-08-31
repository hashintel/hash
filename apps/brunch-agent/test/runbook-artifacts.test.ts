import { describe, expect, test } from "vitest";

import {
  latestRunbookIrBlock,
  recoverRunbookIr,
  RUNBOOK_IR_FENCE,
  skillResourcePathsFrom,
} from "../src/evaluations/runbook/artifacts.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";

const snapshotWithAssistantText = (text: string): FlueConversationSnapshot =>
  ({
    messages: [
      {
        id: "a1",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        parts: [{ type: "text", text, state: "done" }],
      },
    ],
  }) as FlueConversationSnapshot;

describe("runbook artifact recovery", () => {
  test("takes the last fenced IR block", () => {
    const text = [
      "```" + RUNBOOK_IR_FENCE,
      "# first",
      "```",
      "later",
      "```" + RUNBOOK_IR_FENCE,
      "# second",
      "```",
    ].join("\n");
    expect(latestRunbookIrBlock(text)).toBe("# second");
  });

  test("recovers an IR from assistant history", () => {
    const snapshot = snapshotWithAssistantText(
      [
        "```" + RUNBOOK_IR_FENCE,
        "# Runbook IR",
        "## Purpose and outcome",
        "```",
      ].join("\n"),
    );
    expect(recoverRunbookIr(snapshot)).toContain("# Runbook IR");
  });

  test("collects only successfully read skill resource paths", () => {
    const snapshot = {
      messages: [
        {
          id: "a1",
          role: "assistant",
          purpose: "assistant",
          display: "visible",
          parts: [
            {
              type: "dynamic-tool",
              toolCallId: "t1",
              toolName: "read_skill_resource",
              state: "output-available",
              input: {
                path: "/.flue/packaged-skills/skill:sdcpn-modelling:abc/elicitation.md",
              },
              output: "ok",
            },
            {
              type: "dynamic-tool",
              toolCallId: "t2",
              toolName: "read_skill_resource",
              state: "output-error",
              input: {
                path: "/.flue/packaged-skills/skill:sdcpn-modelling:abc/missing.md",
              },
              errorText: "not found",
            },
            {
              type: "dynamic-tool",
              toolCallId: "t3",
              toolName: "read_skill_resource",
              state: "input-available",
              input: {
                path: "/.flue/packaged-skills/skill:sdcpn-modelling:abc/pending.md",
              },
            },
          ],
        },
      ],
    } as FlueConversationSnapshot;
    expect(skillResourcePathsFrom(snapshot)).toEqual([
      "/.flue/packaged-skills/skill:sdcpn-modelling:abc/elicitation.md",
    ]);
  });
});
