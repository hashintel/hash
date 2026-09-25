import { describe, expect, test } from "vitest";

import { latestRunbookIrBlock } from "../src/runbook-ir";
import {
  selectRunbookWorkpiece,
  type WorkpieceHistory,
  type WorkpieceHistoryMessage,
} from "../src/workpiece";

const workpiece = (name: string): string =>
  `\`\`\`runbook-ir\n# ${name}\n\`\`\``;

const assistantMessage = (
  id: string,
  submissionId: string,
  name: string,
): WorkpieceHistoryMessage => ({
  id,
  role: "assistant",
  purpose: "assistant",
  submissionId,
  parts: [{ type: "text", text: workpiece(name) }],
});

const history = (
  messages: readonly WorkpieceHistoryMessage[],
): WorkpieceHistory => ({
  conversationId: "conversation",
  messages,
});

describe("latestRunbookIrBlock", () => {
  test("takes the last complete fenced block", () => {
    expect(
      latestRunbookIrBlock(
        "```runbook-ir\n# first\n```\nlater\n```runbook-ir\n# second\n```",
      ),
    ).toBe("# second");
  });

  test("skips an opening fence that never reaches a newline", () => {
    expect(latestRunbookIrBlock("```runbook-ir still on one line```")).toBe(
      undefined,
    );
  });

  test("scans a long whitespace prefix without quadratic backtracking", () => {
    const prefix = "```runbook-ir\n" + "\n ".repeat(8_000);
    expect(latestRunbookIrBlock(`${prefix}# body\n\`\`\``)).toBe("# body");
    expect(latestRunbookIrBlock(prefix)).toBeUndefined();
  });
});

describe("selectRunbookWorkpiece", () => {
  test("returns nothing without an assistant runbook-ir block", () => {
    expect(
      selectRunbookWorkpiece(
        history([
          {
            id: "user",
            role: "user",
            purpose: "user",
            parts: [{ type: "text", text: workpiece("User authored") }],
          },
        ]),
      ),
    ).toBeUndefined();
  });

  test("selects the latest assistant revision and numbers revisions in log order", () => {
    expect(
      selectRunbookWorkpiece(
        history([
          assistantMessage("revision-1", "turn-1", "Revision one"),
          {
            id: "no-block",
            role: "assistant",
            purpose: "assistant",
            submissionId: "turn-2",
            parts: [{ type: "text", text: "No fenced block here." }],
          },
          assistantMessage("revision-2", "turn-3", "Revision two"),
        ]),
      ),
    ).toMatchObject({
      content: "# Revision two",
      revision: 1,
      sourceMessageId: "revision-2",
      sourceSubmissionId: "turn-3",
    });
  });
});
