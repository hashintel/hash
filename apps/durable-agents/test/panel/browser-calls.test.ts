/**
 * The Brunch panel's successor browser calls (`@hashintel/brunch-agent/client`)
 * against the durable agents server, in-process over SQLite: how a tab
 * claims, starts, runs and settles a call the server issued, how a second
 * tab takes or is refused it, and what a reloaded tab reads back.
 *
 * These tests build the server with `createDurableAgentsServer` and mount
 * the browser-call routes beside it, as `startDurableAgentsServer` does, but
 * with no HASH entry: the conversation and web headers arrive unchecked.
 */
import { expect, onTestFinished, test, vi } from "vitest";

import {
  brunchHeaders,
  canonicalContent,
  type BrowserContext,
} from "@hashintel/brunch-agent";
import {
  createSuccessorBrowserCalls,
  readSuccessorBrowserCalls,
} from "@hashintel/brunch-agent/client";

import {
  browserToolName,
  callTtlMs,
} from "../../src/browser-call/browser-call";
import { calls } from "../platform/support";
import { fauxAssistantMessage } from "../scripted-model";
import { openPanelChat, textOf } from "./panel-chat";
import {
  conversationId,
  documentId,
  openPanelServer,
  type PanelIntercept,
  web,
} from "./panel-server";

import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

type Admit = Parameters<typeof createSuccessorBrowserCalls>[0]["admit"];
type Admission = Awaited<ReturnType<Admit>>;

const binding: BrowserContext["binding"] = { conversationId, documentId };
const titled = { ok: true, title: "Queue" };

/** A promise and the function that resolves it. */
const gate = <Value = void>() => {
  let open: (value: Value) => void = () => {};
  const opened = new Promise<Value>((resolve) => {
    open = resolve;
  });
  return { open, opened };
};

/**
 * The server, whose model answers `responses` and calls `setNetTitle`, a
 * dynamic tool the browser runs, with the browser-call routes mounted where
 * the server serves them; and a connection to it that records every request
 * and its answer. `intercept` may answer a request in the server's place.
 */
const openServer = async (
  responses: FauxResponseStep[],
  options: { readonly intercept?: PanelIntercept } = {},
) => {
  const server = await openPanelServer(responses, {
    ...options,
    // As the production host does, a new conversation's browser calls are bound to the chat's binding.
    admitNewConversation: (body) => ({
      binding: body.binding as BrowserContext["binding"],
    }),
  });
  const { endpoints, requests } = server;
  /** The browser-call requests, by the route each names under the call. */
  const browserCallRequests = () =>
    requests.flatMap((request) =>
      request.url.startsWith(`${endpoints.browserCalls}/`)
        ? [
            {
              ...request,
              route:
                request.url
                  .slice(endpoints.browserCalls.length + 1)
                  .split("/")[1] ?? "claim",
            },
          ]
        : [],
    );
  return { ...server, browserCallRequests };
};

type Server = Awaited<ReturnType<typeof openServer>>;

/**
 * One tab's browser calls: it runs every call `admit` lets start through
 * `execute`, recording each run, and claims as `claimant`.
 */
const openTab = (
  server: Server,
  {
    claimant,
    admit = async () => ({ admitted: true }),
    execute = async () => titled,
    metadataFor = () => undefined,
  }: {
    readonly claimant: string;
    readonly admit?: Admit;
    readonly execute?: (input: unknown) => Promise<unknown>;
    readonly metadataFor?: Parameters<
      typeof createSuccessorBrowserCalls
    >[0]["metadataFor"];
  },
) => {
  const executed: unknown[] = [];
  const browserCalls = createSuccessorBrowserCalls({
    conversation: server.conversation,
    binding,
    claimant,
    metadataFor,
    prepareInput: () => {},
    admit,
    acceptsRevision: () => true,
  });
  /** Run `toolCall` in band, as the panel's `onToolCall` does. */
  const run = (toolCall: {
    readonly toolCallId: string;
    readonly toolName: string;
    readonly input: unknown;
  }) =>
    browserCalls.run(
      { ...toolCall, signal: new AbortController().signal },
      async (input) => {
        executed.push(input);
        return execute(input);
      },
    );
  return { browserCalls, executed, run };
};

/** A chat on the conversation whose browser tool calls `tab` runs in band; none runs without one. */
const openChat = (server: Server, tab?: ReturnType<typeof openTab>) => {
  const runs: Promise<void>[] = [];
  const { chat } = openPanelChat(server.conversation, {
    onToolCall: ({ toolCall }) => {
      if (tab?.browserCalls.has(toolCall.toolName))
        runs.push(tab.run(toolCall));
    },
  });
  return { chat, runs };
};

const titleCall = calls([browserToolName, "browser-1", { title: "Queue" }]);
const issuedCall = {
  toolCallId: "browser-1",
  toolName: browserToolName,
  input: { title: "Queue" },
};

/** Until the server has issued `browser-1`. */
const issued = async (server: Server) =>
  vi.waitFor(async () =>
    expect(
      (await readSuccessorBrowserCalls(server.conversation)).map(
        ({ toolCallId }) => toolCallId,
      ),
    ).toEqual(["browser-1"]),
  );

test("a browser call is claimed, started, run and settled, and the turn goes on with its result", async () => {
  const server = await openServer([titleCall, fauxAssistantMessage("Titled.")]);
  const tab = openTab(server, { claimant: "tab-1" });
  const { chat, runs } = openChat(server, tab);

  await chat.sendMessage({ text: "Name the net Queue." });
  await Promise.all(runs);

  expect(chat.error).toBeUndefined();
  expect(textOf(chat.messages.at(-1))).toBe("Titled.");
  expect(tab.executed).toEqual([{ title: "Queue" }]);
  const sent = server.browserCallRequests();
  expect(sent.map(({ route, status }) => [route, status])).toEqual([
    ["claim", 200],
    ["start", 200],
    ["result", 200],
  ]);
  expect(sent[0]?.body).toEqual({
    claimant: "tab-1",
    binding: canonicalContent(binding),
  });
  for (const request of sent) {
    expect(request.method).toBe("POST");
    expect(request.credentials).toBe("include");
    expect(request.headers.get(brunchHeaders.conversation)).toBe(
      conversationId,
    );
    expect(request.headers.get(brunchHeaders.web)).toBe(web);
  }
  expect(sent[2]?.body).toMatchObject({
    toolName: browserToolName,
    canonicalInput: { title: "Queue" },
    output: titled,
  });
});

test("a second tab takes a call until its holder starts it; after that, a tab is told it is open in another tab", async () => {
  const server = await openServer([titleCall, fauxAssistantMessage("Titled.")]);
  const approvalInFirst = gate<Admission>();
  const first = openTab(server, {
    claimant: "tab-1",
    admit: () => approvalInFirst.opened,
  });
  const { chat, runs } = openChat(server, first);
  const sent = chat.sendMessage({ text: "Name the net Queue." });
  await vi.waitFor(() =>
    expect(
      server.browserCallRequests().map(({ route, status }) => [route, status]),
    ).toEqual([["claim", 200]]),
  );

  // A reloaded or second tab takes the call while the first waits for approval.
  const executing = gate();
  const finish = gate();
  const second = openTab(server, {
    claimant: "tab-2",
    execute: async () => {
      executing.open();
      await finish.opened;
      return titled;
    },
  });
  const secondRun = second.run(issuedCall);
  await executing.opened;

  // Approved in the first tab, the call no longer starts there.
  approvalInFirst.open({ admitted: true });
  await Promise.all(runs);
  expect(first.executed).toEqual([]);
  expect(first.browserCalls.openInOtherTabs.getSnapshot()).toEqual(
    new Set(["browser-1"]),
  );

  // A third tab can't take a call that has started.
  const third = openTab(server, { claimant: "tab-3" });
  await third.run(issuedCall);
  expect(third.executed).toEqual([]);
  expect(third.browserCalls.openInOtherTabs.getSnapshot()).toEqual(
    new Set(["browser-1"]),
  );

  finish.open();
  await Promise.all([secondRun, sent]);
  expect(chat.error).toBeUndefined();
  expect(textOf(chat.messages.at(-1))).toBe("Titled.");
  expect(second.executed).toEqual([{ title: "Queue" }]);
  expect(second.browserCalls.openInOtherTabs.getSnapshot()).toEqual(new Set());
});

test("a result whose answer is lost after it committed is sent again and settles the call once", async () => {
  let lost = false;
  const server = await openServer(
    [titleCall, fauxAssistantMessage("Titled.")],
    {
      intercept: (url, _init, forward) => {
        if (lost || !url.endsWith("/result")) return undefined;
        lost = true;
        // The server commits the result; the network drops its answer.
        return forward().then(() => {
          throw new TypeError("Failed to fetch");
        });
      },
    },
  );
  const tab = openTab(server, { claimant: "tab-1" });
  const { chat, runs } = openChat(server, tab);

  await chat.sendMessage({ text: "Name the net Queue." });
  await Promise.all(runs);

  expect(chat.error).toBeUndefined();
  expect(textOf(chat.messages.at(-1))).toBe("Titled.");
  expect(tab.executed).toHaveLength(1);
  const results = server
    .browserCallRequests()
    .filter(({ route }) => route === "result");
  // The first answer never arrived; the second is the server's receipt.
  expect(results.map(({ status }) => status)).toEqual([undefined, 200]);
  expect(results[1]?.body).toEqual(results[0]?.body);
  const [record] = await readSuccessorBrowserCalls(server.conversation);
  expect(record).toMatchObject({ status: "settled", output: titled });
});

test("a reloaded tab reads a settled call back with its output and metadata, and never runs it again", async () => {
  const server = await openServer([titleCall, fauxAssistantMessage("Titled.")]);
  const documentRevision = { before: "r-1", after: "r-2" };
  const tab = openTab(server, {
    claimant: "tab-1",
    metadataFor: () => ({ documentRevision }),
  });
  const { chat, runs } = openChat(server, tab);
  await chat.sendMessage({ text: "Name the net Queue." });
  await Promise.all(runs);

  // The reload replays the turn's stream, which delivers the call again.
  const reloaded = openTab(server, { claimant: "tab-2" });
  const before = server.browserCallRequests().length;
  await reloaded.run(issuedCall);

  expect(reloaded.executed).toEqual([]);
  expect(reloaded.browserCalls.openInOtherTabs.getSnapshot()).toEqual(
    new Set(),
  );
  expect(
    server
      .browserCallRequests()
      .slice(before)
      .map(({ route, status }) => [route, status]),
  ).toEqual([["claim", 409]]);
  expect(await readSuccessorBrowserCalls(server.conversation)).toEqual([
    expect.objectContaining({
      toolCallId: "browser-1",
      toolName: browserToolName,
      input: { title: "Queue" },
      status: "settled",
      output: titled,
      metadata: { documentRevision },
      admittable: false,
    }),
  ]);
});

test("a call past its deadline ends quietly: nothing runs and nothing is reported", async () => {
  const server = await openServer([titleCall, fauxAssistantMessage("Titled.")]);
  const tab = openTab(server, { claimant: "tab-1" });
  const { chat } = openChat(server);
  void chat.sendMessage({ text: "Name the net Queue." });
  await issued(server);
  const [record] = await readSuccessorBrowserCalls(server.conversation);
  expect(record).toMatchObject({ admittable: true });
  expect(record?.expiresAt).toBeGreaterThan(Date.now() + callTtlMs - 60_000);

  server.clock.now = Date.now() + callTtlMs + 1;
  await expect(tab.run(issuedCall)).resolves.toBeUndefined();

  expect(tab.executed).toEqual([]);
  expect(tab.browserCalls.openInOtherTabs.getSnapshot()).toEqual(new Set());
  expect(
    server
      .browserCallRequests()
      .filter(({ url }) => url.includes("/browser-1"))
      .map(({ route, status }) => [route, status]),
  ).toEqual([["claim", 409]]);
});

test("a tab whose lease check finds the call taken while its approval waits says it is open in another tab", async () => {
  onTestFinished(() => {
    vi.useRealTimers();
  });
  // Only the lease check's interval: the server's own timers run.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const server = await openServer([titleCall, fauxAssistantMessage("Titled.")]);
  const first = openTab(server, {
    claimant: "tab-1",
    // The panel's approval is stopped when its call's signal aborts.
    admit: ({ signal }) =>
      new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () =>
            resolve({
              admitted: false,
              output: { applied: false, reason: "Stopped before approval." },
            }),
          { once: true },
        );
      }),
  });
  const { chat, runs } = openChat(server, first);
  const sent = chat.sendMessage({ text: "Name the net Queue." });
  await vi.waitFor(() =>
    expect(
      server.browserCallRequests().map(({ route, status }) => [route, status]),
    ).toEqual([["claim", 200]]),
  );

  // Another tab takes the call and starts it.
  const executing = gate();
  const finish = gate();
  const second = openTab(server, {
    claimant: "tab-2",
    execute: async () => {
      executing.open();
      await finish.opened;
      return titled;
    },
  });
  const secondRun = second.run(issuedCall);
  await executing.opened;

  // Each tab's next lease check: the first tab's claim no longer holds.
  await vi.advanceTimersByTimeAsync(5_000);
  await Promise.all(runs);
  expect(first.executed).toEqual([]);
  expect(first.browserCalls.openInOtherTabs.getSnapshot()).toEqual(
    new Set(["browser-1"]),
  );
  const leases = server
    .browserCallRequests()
    .filter(({ route }) => route === "lease");
  expect(leases.map(({ status }) => status)).toEqual(
    expect.arrayContaining([200, 409]),
  );
  expect(leases).toHaveLength(2);

  finish.open();
  await Promise.all([secondRun, sent]);
  expect(chat.error).toBeUndefined();
  expect(textOf(chat.messages.at(-1))).toBe("Titled.");
  expect(second.executed).toEqual([{ title: "Queue" }]);
  // Only the second tab started the call, and nothing failed it.
  expect(
    server
      .browserCallRequests()
      .filter(({ route }) => route !== "lease")
      .map(({ route, status }) => [route, status]),
  ).toEqual([
    ["claim", 200],
    ["claim", 200],
    ["start", 200],
    ["result", 200],
  ]);
});
