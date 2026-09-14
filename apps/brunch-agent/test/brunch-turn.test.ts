import { expect, test, vi } from "vitest";

import { createBrunchTurnTool } from "../src/evaluations/persona/brunch-turn";

import type { PersonaBrowserReply } from "../src/evaluations/persona/browser-bridge";

const reply: PersonaBrowserReply = {
  conversationId: "browser-conversation",
  text: "What happens next?",
  submissionIds: ["user-turn", "browser-continuation"],
};

test("returns only the exact browser reply to the persona, keeping native identities in details", async () => {
  const browserTurn = vi
    .fn<Parameters<typeof createBrunchTurnTool>[0]>()
    .mockResolvedValue(reply);
  const tool = createBrunchTurnTool(browserTurn);
  const signal = new AbortController().signal;
  const result = await tool.execute(
    "pi-call",
    { message: "Our delivery is late." },
    signal,
  );
  expect(browserTurn).toHaveBeenCalledExactlyOnceWith(
    "Our delivery is late.",
    signal,
  );
  expect(result).toEqual({
    content: [{ type: "text", text: "What happens next?" }],
    details: {
      conversationId: "browser-conversation",
      submissionId: "browser-continuation",
      submissionIds: ["user-turn", "browser-continuation"],
      status: "elicitor-replied",
      elicitorText: "What happens next?",
    },
  });
});

test("refuses empty, already-cancelled and overlapping utterances without poisoning the next turn", async () => {
  const pending = Promise.withResolvers<PersonaBrowserReply>();
  const browserTurn = vi
    .fn<Parameters<typeof createBrunchTurnTool>[0]>()
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue(reply);
  const tool = createBrunchTurnTool(browserTurn);
  await expect(tool.execute("empty", { message: " \n " })).rejects.toThrow(
    "must not be empty",
  );
  await expect(
    tool.execute("cancelled", { message: "Never sent" }, AbortSignal.abort()),
  ).rejects.toThrow("aborted");
  expect(browserTurn).not.toHaveBeenCalled();
  const active = tool.execute("active", { message: "First" });
  await expect(
    tool.execute("overlap", { message: "Concurrent" }),
  ).rejects.toThrow("active submission");
  pending.resolve(reply);
  await active;
  await tool.execute("next", { message: "Second" });
  expect(browserTurn.mock.calls.map(([message]) => message)).toEqual([
    "First",
    "Second",
  ]);
});

test("never retries after a bridge failure that may have reached the composer", async () => {
  const failure = new Error("Connection lost after send");
  const browserTurn = vi
    .fn<Parameters<typeof createBrunchTurnTool>[0]>()
    .mockRejectedValue(failure);
  const tool = createBrunchTurnTool(browserTurn);
  await expect(tool.execute("first", { message: "Send once" })).rejects.toBe(
    failure,
  );
  await expect(tool.execute("retry", { message: "Send once" })).rejects.toThrow(
    "inspect canonical Flue history",
  );
  expect(browserTurn).toHaveBeenCalledOnce();
});

test("renders the two sides of a browser turn as width-bounded Markdown", async () => {
  const theme = {
    bold: (text: string) => text,
    italic: (text: string) => text,
    strikethrough: (text: string) => text,
    underline: (text: string) => text,
    fg: (_color: string, text: string) => text,
  };
  const tool = createBrunchTurnTool(async () => reply);
  const result = await tool.execute("test", {
    message: "A short user message",
  });
  expect(
    tool
      .renderCall({ message: "A short user message" }, theme)
      .render(12)
      .map((line) => line.trimEnd()),
  ).toEqual(["User", "", "A short user", "message"]);
  expect(
    tool
      .renderResult(result, { isPartial: false }, theme, { isError: false })
      .render(12)
      .map((line) => line.trimEnd()),
  ).toEqual(["Brunch", "", "What happens", "next?"]);
});
