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

  test("names the Ledger scope a compile reads", () => {
    expect(
      resolveBrunchToolPresentation({
        toolName: "ledger_compile",
        state: "success",
        input: { address: "operational/resources" },
        output: undefined,
        error: undefined,
      }),
    ).toEqual({ title: "Read the Ledger: operational/resources" });
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
    const changes = [
      {
        op: "add",
        address: "purpose",
        content: "Size the crew.",
        source: "person",
        standing: "settled",
      },
    ];
    expect(
      resolveBrunchToolPresentation({
        toolName: "ledger_commit",
        state: "pending",
        input: { changes },
        output: undefined,
        error: undefined,
      }),
    ).toEqual({ title: "Recording in the Ledger", tone: "pending" });
    const message =
      "No category invented; nothing was recorded. add takes a category path.";
    expect(
      resolveBrunchToolPresentation({
        toolName: "ledger_commit",
        state: "success",
        input: { changes },
        output: {
          status: "refused",
          applied: false,
          code: "unknown-category",
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
