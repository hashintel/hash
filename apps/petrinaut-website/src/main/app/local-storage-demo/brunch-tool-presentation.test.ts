import { describe, expect, test } from "vitest";

import {
  brunchToolLifecycleTitles,
  resolveBrunchToolPresentation,
  visibleOrdinaryBrunchToolNames,
} from "./brunch-tool-presentation";

const states = ["pending", "success", "error"] as const;

describe("Brunch tool presentation", () => {
  test.each(visibleOrdinaryBrunchToolNames)(
    "presents every lifecycle for %s",
    (toolName) => {
      for (const state of states) {
        expect(
          resolveBrunchToolPresentation({
            toolName,
            state,
            input: {},
            output: {},
            error: state === "error" ? "actual failure" : undefined,
          })?.title,
        ).toBe(brunchToolLifecycleTitles[toolName][state]);
      }
    },
  );

  test("names activated skills and resources", () => {
    expect(
      resolveBrunchToolPresentation({
        toolName: "activate_skill",
        state: "success",
        input: { name: "elicitation" },
        output: undefined,
        error: undefined,
      }),
    ).toEqual({ title: "Activated skill: elicitation" });
    expect(
      resolveBrunchToolPresentation({
        toolName: "read_skill_resource",
        state: "success",
        input: {
          path: "/.flue/packaged-skills/skill%3Asdcpn-modelling%3Aabc/references/profile.md",
        },
        output: undefined,
        error: undefined,
      }),
    ).toEqual({
      title:
        "Reviewed modelling guidance: sdcpn-modelling / references/profile.md",
    });
  });

  test.each([
    [
      { includeContent: false, sourceIds: ["m1"], locateTexts: ["claim"] },
      "Read settled passages and conversation sources",
    ],
    [
      { includeContent: false, locateTexts: ["claim"] },
      "Read settled passages",
    ],
    [{ includeContent: false, sourceIds: ["m1"] }, "Read conversation sources"],
    [{ includeContent: false, sourceIds: [] }, "Checked Ledger revision"],
    [{ includeContent: false }, "Checked Ledger revision"],
    [{ includeContent: true, sourceIds: ["m1"] }, "Read conversation sources"],
    [{}, "Read ledger"],
    [undefined, "Read ledger"],
  ])(
    "distinguishes a production-shaped read_workpiece purpose",
    (input, title) => {
      expect(
        resolveBrunchToolPresentation({
          toolName: "read_workpiece",
          state: "success",
          input,
          output: undefined,
          error: undefined,
        })?.title,
      ).toBe(title);
    },
  );

  test("renders a model name as document detail", () => {
    expect(
      resolveBrunchToolPresentation({
        toolName: "read_petrinaut_net",
        state: "success",
        input: {},
        output: { title: "New Process" },
        error: undefined,
      }),
    ).toEqual({ title: "Read current model", detail: "Model: New Process" });
  });

  test("fails safe when a skill resource path is malformed", () => {
    expect(() =>
      resolveBrunchToolPresentation({
        toolName: "read_skill_resource",
        state: "pending",
        input: { path: "/skills/%E0%A4%A" },
        output: undefined,
        error: undefined,
      }),
    ).not.toThrow();
    expect(
      resolveBrunchToolPresentation({
        toolName: "read_skill_resource",
        state: "pending",
        input: { path: "/skills/%E0%A4%A" },
        output: undefined,
        error: undefined,
      }),
    ).toEqual({
      title: "Reviewing modelling guidance: %E0%A4%A",
      tone: "pending",
    });
  });

  test("marks ordinary pending rows gold and typed refusals compact neutral", () => {
    expect(
      resolveBrunchToolPresentation({
        toolName: "mutate_workpiece",
        state: "pending",
        input: { markdown: "# Ledger", baseRevisionId: null },
        output: undefined,
        error: undefined,
      }),
    ).toEqual({ title: "Updating ledger", tone: "pending" });
    expect(
      resolveBrunchToolPresentation({
        toolName: "mutate_workpiece",
        state: "success",
        input: { markdown: "# Ledger", baseRevisionId: "rev-1" },
        output: {
          disposition: "refused",
          applied: false,
          correctable: true,
          code: "silent-shrink",
          message:
            "Workpiece removes more than 25% of the prior body. Nothing was written.",
          currentRevision: {
            revisionId: "rev-1",
            sha256: "a".repeat(64),
            ordinal: 1,
          },
        },
        error: undefined,
      }),
    ).toEqual({
      title: "Ledger update needs correction",
      tone: "neutral",
      items: [
        "Workpiece removes more than 25% of the prior body. Nothing was written.",
      ],
    });
    expect(
      resolveBrunchToolPresentation({
        toolName: "mutate_workpiece",
        state: "success",
        input: {},
        output: {
          disposition: "refused",
          applied: false,
          correctable: true,
          message: "Missing canonical code and current revision.",
        },
        error: undefined,
      }),
    ).toEqual({ title: "Updated ledger" });
    expect(
      resolveBrunchToolPresentation({
        toolName: "mutate_workpiece",
        state: "error",
        input: {},
        output: undefined,
        error: "Current state missing",
      }),
    ).toEqual({ title: "Could not update ledger" });
  });

  test("does not present unknown tools", () => {
    expect(
      resolveBrunchToolPresentation({
        toolName: "future_tool",
        state: "success",
        input: {},
        output: {},
        error: undefined,
      }),
    ).toBeUndefined();
  });
});
