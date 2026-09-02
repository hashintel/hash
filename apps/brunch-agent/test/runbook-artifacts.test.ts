import { describe, expect, test } from "vitest";

import {
  latestRunbookIrBlock,
  ordinaryElicitationViolationsFrom,
  recoverRunbookIr,
  recoverRunbookWorkpiece,
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
    const workpiece = recoverRunbookWorkpiece(snapshot);
    expect(workpiece?.content).toContain("# Runbook IR");
    expect(workpiece?.sourceMessageId).toBe("a1");
    expect(workpiece?.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(workpiece?.sourceMessageSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  test.each([
    ["construction tool", "addPlace", "construction-tool-use"],
    ["capture tool", "brunch_sweep", "capture-tool-use"],
    ["other tool", "ping", "unexpected-tool-use"],
  ])("classifies %s as an ordinary-path violation", (_, toolName, code) => {
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
              toolName,
              state: "output-available",
              input: {},
              output: "ok",
            },
          ],
        },
      ],
    } as FlueConversationSnapshot;

    expect(
      ordinaryElicitationViolationsFrom(snapshot, { hasWorkpiece: true }),
    ).toContainEqual(expect.objectContaining({ code, detail: toolName }));
  });

  test("construction resources and a missing workpiece invalidate an ordinary member", () => {
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
                path: "/.flue/packaged-skills/example/references/pn-construction.md",
              },
              output: "ok",
            },
          ],
        },
      ],
    } as FlueConversationSnapshot;

    expect(
      ordinaryElicitationViolationsFrom(snapshot, { hasWorkpiece: false }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "construction-resource-read" }),
        expect.objectContaining({ code: "missing-workpiece" }),
      ]),
    );
  });

  test("rejects more than one explicit question in an assistant turn", () => {
    const snapshot = snapshotWithAssistantText(
      "What starts the process? Who performs the first step?",
    );

    expect(
      ordinaryElicitationViolationsFrom(snapshot, { hasWorkpiece: false }),
    ).toContainEqual({
      code: "multiple-questions",
      detail: "a1: 2 question marks",
    });
  });

  test("does not count questions recorded inside the workpiece as interactive questions", () => {
    const snapshot = snapshotWithAssistantText(
      "```runbook-ir\n# Workpiece\n## Open questions\n- Who signs off?\n- When is the crew released?\n```",
    );

    expect(
      ordinaryElicitationViolationsFrom(snapshot, { hasWorkpiece: true }),
    ).not.toContainEqual(
      expect.objectContaining({ code: "multiple-questions" }),
    );
  });

  test("requires successful universal, profile, and workpiece reads for an ordinary workpiece", () => {
    const snapshot = snapshotWithAssistantText(
      "What process should we model?\n```runbook-ir\n# Workpiece\n```",
    );

    expect(
      ordinaryElicitationViolationsFrom(snapshot, { hasWorkpiece: true }),
    ).toEqual(
      expect.arrayContaining([
        {
          code: "missing-required-resource",
          detail: "universal-elicitation.md",
        },
        { code: "missing-required-resource", detail: "profile.md" },
        { code: "missing-required-resource", detail: "workpiece.md" },
      ]),
    );
  });

  test("requires guidance before the first question and the template before workpiece creation", () => {
    const snapshot = {
      messages: [
        {
          id: "a1",
          role: "assistant",
          purpose: "assistant",
          display: "visible",
          parts: [
            {
              type: "text",
              text: "What process should we model?",
              state: "done",
            },
            ...["universal-elicitation.md", "profile.md"].map(
              (name, index) => ({
                type: "dynamic-tool" as const,
                toolCallId: `guidance-${index}`,
                toolName: "read_skill_resource",
                state: "output-available" as const,
                input: {
                  path: `/.flue/packaged-skills/example/references/${name}`,
                },
                output: "ok",
              }),
            ),
            {
              type: "text",
              text: "```runbook-ir\n# Workpiece\n```",
              state: "done",
            },
            {
              type: "dynamic-tool",
              toolCallId: "template",
              toolName: "read_skill_resource",
              state: "output-available",
              input: {
                path: "/.flue/packaged-skills/example/templates/workpiece.md",
              },
              output: "ok",
            },
          ],
        },
      ],
    } as FlueConversationSnapshot;

    expect(
      ordinaryElicitationViolationsFrom(snapshot, { hasWorkpiece: true }),
    ).toEqual(
      expect.arrayContaining([
        {
          code: "late-required-resource",
          detail: "universal-elicitation.md: after first question",
        },
        {
          code: "late-required-resource",
          detail: "profile.md: after first question",
        },
        {
          code: "late-required-resource",
          detail: "workpiece.md: after first workpiece",
        },
      ]),
    );
  });

  test("accepts ordered required disclosure on an ordinary workpiece path", () => {
    const snapshot = {
      messages: [
        {
          id: "a1",
          role: "assistant",
          purpose: "assistant",
          display: "visible",
          parts: [
            ...[
              ["references", "universal-elicitation.md"],
              ["references", "profile.md"],
            ].map(([directory, name], index) => ({
              type: "dynamic-tool" as const,
              toolCallId: `guidance-${index}`,
              toolName: "read_skill_resource",
              state: "output-available" as const,
              input: {
                path: `/.flue/packaged-skills/example/${directory}/${name}`,
              },
              output: "ok",
            })),
            {
              type: "text",
              text: "What process should we model?",
              state: "done",
            },
            {
              type: "dynamic-tool",
              toolCallId: "template",
              toolName: "read_skill_resource",
              state: "output-available",
              input: {
                path: "/.flue/packaged-skills/example/templates/workpiece.md",
              },
              output: "ok",
            },
            {
              type: "text",
              text: "```runbook-ir\n# Workpiece\n```",
              state: "done",
            },
          ],
        },
      ],
    } as FlueConversationSnapshot;

    expect(
      ordinaryElicitationViolationsFrom(snapshot, { hasWorkpiece: true }),
    ).toEqual([]);
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
