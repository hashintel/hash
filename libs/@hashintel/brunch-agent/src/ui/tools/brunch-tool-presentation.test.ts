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

  test("titles a Ledger compile by its lifecycle", () => {
    expect(
      resolveBrunchToolPresentation({
        toolName: "ledger_compile",
        state: "pending",
        input: {},
        output: undefined,
        error: undefined,
      }),
    ).toEqual({ title: "Reading the Ledger", tone: "pending" });
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
    const entries = [
      [
        "claim/create",
        {
          text: "The crew is sized by shift.",
          entities: ["e9"],
          origin: "stated",
          status: "confirmed",
        },
      ],
    ];
    expect(
      resolveBrunchToolPresentation({
        toolName: "ledger_commit",
        state: "pending",
        input: { entries },
        output: undefined,
        error: undefined,
      }),
    ).toEqual({ title: "Recording in the Ledger", tone: "pending" });
    const message = "Unknown entity e9.";
    expect(
      resolveBrunchToolPresentation({
        toolName: "ledger_commit",
        state: "success",
        input: { entries },
        output: {
          status: "refused",
          applied: false,
          code: "unknown-address",
          message,
          revision: 0,
        },
        error: undefined,
      }),
    ).toEqual({
      title: "Ledger commit needs correction",
      tone: "neutral",
      items: [message],
    });
    expect(
      resolveBrunchToolPresentation({
        toolName: "ledger_commit",
        state: "success",
        input: {},
        output: { status: "refused", message: "Missing code and revision." },
        error: undefined,
      }),
    ).toEqual({ title: "Recorded in the Ledger" });
    expect(
      resolveBrunchToolPresentation({
        toolName: "ledger_commit",
        state: "error",
        input: {},
        output: undefined,
        error: "History unavailable",
      }),
    ).toEqual({ title: "Could not record in the Ledger" });
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
