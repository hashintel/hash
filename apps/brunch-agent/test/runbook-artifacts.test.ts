import { describe, expect, test } from "vitest";

import {
  latestFencedBlock,
  PN_JSON_FENCE,
  recoverPnJson,
  recoverRunbookIr,
  RUNBOOK_IR_FENCE,
  skillResourcePathsFrom,
} from "../src/runbook-artifacts.ts";

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
    expect(latestFencedBlock(text, RUNBOOK_IR_FENCE)).toBe("# second");
  });

  test("recovers IR and PN JSON from assistant history", () => {
    const snapshot = snapshotWithAssistantText(
      [
        "```" + RUNBOOK_IR_FENCE,
        "# Runbook IR",
        "## Purpose and outcome",
        "```",
        "```" + PN_JSON_FENCE,
        '{"title":"Example","places":[],"transitions":[]}',
        "```",
      ].join("\n"),
    );
    expect(recoverRunbookIr(snapshot)).toContain("# Runbook IR");
    expect(recoverPnJson(snapshot)).toEqual({
      title: "Example",
      places: [],
      transitions: [],
    });
  });

  test("collects read_skill_resource paths", () => {
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
          ],
        },
      ],
    } as FlueConversationSnapshot;
    expect(skillResourcePathsFrom(snapshot)).toEqual([
      "/.flue/packaged-skills/skill:sdcpn-modelling:abc/elicitation.md",
    ]);
  });
});
