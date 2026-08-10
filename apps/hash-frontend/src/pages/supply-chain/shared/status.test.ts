import { describe, expect, it } from "vitest";

import {
  deriveStatusActionState,
  parseStatusTokens,
  statusCommentRequired,
  statusTokensToPlainText,
} from "./status";

import type { StatusEntry, StatusOption } from "./status";

const entry = (at: string, category: StatusOption, text = ""): StatusEntry => ({
  entityId: `web~${at}` as StatusEntry["entityId"],
  at,
  category,
  text,
  tokens: text ? [{ tokenType: "text", text }] : [],
  user: "User",
});

describe("deriveStatusActionState", () => {
  it("labels missing status as to action", () => {
    expect(deriveStatusActionState([])).toEqual({
      label: "To action",
      tone: "neutral",
    });
  });

  it("labels started and updated statuses as investigating", () => {
    expect(
      deriveStatusActionState([
        entry("2026-01-01T00:00:00.000Z", "Investigation started"),
        entry("2026-01-02T00:00:00.000Z", "Investigation update"),
      ]),
    ).toEqual({ label: "Investigating", tone: "neutral" });
  });

  it("labels concluded status as investigated", () => {
    expect(
      deriveStatusActionState([
        entry("2026-01-01T00:00:00.000Z", "Investigation started"),
        entry("2026-01-02T00:00:00.000Z", "Investigation concluded"),
      ]),
    ).toEqual({ label: "Investigated", tone: "success" });
  });

  it("labels either rejected status as rejected", () => {
    expect(
      deriveStatusActionState([
        entry("2026-01-01T00:00:00.000Z", "Investigation concluded"),
        entry("2026-01-02T00:00:00.000Z", "Rejected (data issue)"),
      ]),
    ).toEqual({ label: "Rejected", tone: "danger" });
  });
});

describe("statusCommentRequired", () => {
  it("only allows the initial status without a comment", () => {
    expect(statusCommentRequired("Investigation started")).toBe(false);
    expect(statusCommentRequired("Investigation update")).toBe(true);
    expect(statusCommentRequired("Investigation concluded")).toBe(true);
    expect(statusCommentRequired("Rejected (infeasible)")).toBe(true);
    expect(statusCommentRequired("Rejected (data issue)")).toBe(true);
  });
});

describe("structured status content", () => {
  it("prefers valid tokens and falls back to legacy plain text", () => {
    const tokens = [{ tokenType: "text" as const, text: "Structured" }];

    expect(parseStatusTokens(tokens, "Legacy")).toEqual(tokens);
    expect(parseStatusTokens(undefined, "Legacy")).toEqual([
      { tokenType: "text", text: "Legacy" },
    ]);
    expect(parseStatusTokens([{ tokenType: "mention" }], "Legacy")).toEqual([
      { tokenType: "text", text: "Legacy" },
    ]);
  });

  it("exports line breaks and mention labels as plain text", () => {
    expect(
      statusTokensToPlainText(
        [
          { tokenType: "text", text: "Ask " },
          {
            tokenType: "mention",
            mentionType: "user",
            entityId: "web~user" as StatusEntry["entityId"],
          },
          { tokenType: "hardBreak" },
          { tokenType: "text", text: "today" },
        ],
        () => "@alex",
      ),
    ).toBe("Ask @alex\ntoday");
  });
});
