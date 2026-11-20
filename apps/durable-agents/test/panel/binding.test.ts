/**
 * The panel's one binding, against the durable agents server in-process
 * over SQLite: the chat transport creates the conversation with the
 * binding as the panel holds it, `incarnationId` included, and the same
 * binding then claims the turn's browser call and has a hand edit admitted.
 */
import { expect, test, vi } from "vitest";

import {
  createHandEditReporter,
  createSuccessorBrowserCalls,
} from "@hashintel/brunch-agent/client";

import { browserToolName } from "../../src/browser-call/browser-call";
import { calls } from "../platform/support";
import { fauxAssistantMessage } from "../scripted-model";
import { openPanelChat, textOf } from "./panel-chat";
import { binding, openPanelServer } from "./panel-server";

test("the binding a panel's transport creates its conversation with claims the turn's browser call and has a hand edit admitted", async () => {
  const panel = await openPanelServer([
    calls([browserToolName, "browser-1", { title: "Queue" }]),
    fauxAssistantMessage("Titled."),
  ]);
  const browserCalls = createSuccessorBrowserCalls({
    conversation: panel.conversation,
    binding,
    claimant: "tab-1",
    metadataFor: () => undefined,
    prepareInput: () => {},
    admit: async () => ({ admitted: true }),
    acceptsRevision: () => true,
  });
  const runs: Promise<void>[] = [];
  const { chat } = openPanelChat(panel.conversation, {
    onToolCall: ({ toolCall }) => {
      if (browserCalls.has(toolCall.toolName))
        runs.push(
          browserCalls.run(
            { ...toolCall, signal: new AbortController().signal },
            async () => ({ ok: true, title: "Queue" }),
          ),
        );
    },
  });

  await chat.sendMessage({ text: "Name the net Queue." });
  await Promise.all(runs);

  const created = panel.requests.find(
    ({ url }) => url === panel.endpoints.chat,
  );
  expect(created?.body).toMatchObject({ binding });
  expect(chat.error).toBeUndefined();
  expect(textOf(chat.messages.at(-1))).toBe("Titled.");
  expect(
    panel.requests
      .filter(({ url }) =>
        url.startsWith(`${panel.endpoints.browserCalls}/browser-1`),
      )
      .map(({ status }) => status),
  ).toEqual([200, 200, 200]);

  const reporter = createHandEditReporter({
    conversation: panel.conversation,
    binding,
    document: { revision: () => "revision-2", subscribe: () => () => {} },
    readShown: async () => "revision-1",
  });
  const stop = reporter.start();
  await vi.waitFor(() =>
    expect(
      panel.requests
        .filter(({ url }) => url === panel.endpoints.handEdits)
        .map(({ status }) => status),
    ).toEqual([200]),
  );
  stop();
});
