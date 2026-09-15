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
      title: "Read skill resource: sdcpn-modelling / references/profile.md",
    });
  });

  test.each([
    [
      {
        includeContent: false,
        includeSources: true,
        markdown: "draft",
        locateTexts: ["claim"],
      },
      "Read conversation sources and draft passages",
    ],
    [
      {
        includeContent: false,
        includeSources: false,
        markdown: "draft",
        locateTexts: ["claim"],
      },
      "Read draft passages",
    ],
    [
      {
        includeContent: false,
        includeSources: false,
        locateTexts: ["claim"],
      },
      "Read settled passages",
    ],
    [
      { includeContent: false, includeSources: true },
      "Read conversation sources",
    ],
    [
      { includeContent: false, includeSources: false },
      "Checked workpiece revision",
    ],
    [{ includeContent: true, includeSources: true }, "Read ledger"],
    [{}, "Read ledger"],
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
    ).toEqual({ title: "Reading skill resource: %E0%A4%A" });
  });

  test("does not present hidden markers or unknown tools", () => {
    for (const toolName of ["brunch_mark_question", "future_tool"]) {
      expect(
        resolveBrunchToolPresentation({
          toolName,
          state: "success",
          input: {},
          output: {},
          error: undefined,
        }),
      ).toBeUndefined();
    }
  });
});
