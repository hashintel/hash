/**
 * @vitest-environment jsdom
 */
import { afterEach, expect, test, vi } from "vitest";

import { canonicalContent } from "@hashintel/brunch-agent";
import { liveToolRouteSegment } from "@local/flue-aisdk-transport";

import {
  brunchLiveToolStream,
  createBrunchFlueClient,
  type BrunchConnection,
} from "./brunch-flue-client";
import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "./brunch-panel-transport";
import { createInBandBrowserCalls } from "./tools/in-band-browser-call";

const binding = { conversationId: "conversation", documentId: "document" };
const placeInput = {
  id: "place",
  name: "Place",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("every Brunch request, the live-tool stream included, goes through the host's fetch", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(() => {
      throw new Error("The global fetch was used.");
    }),
  );
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const requests: string[] = [];
  const hostFetch = vi.fn<typeof fetch>(async (resource, init) => {
    const url = new URL(
      resource instanceof Request ? resource.url : String(resource),
    );
    const method = init?.method ?? "GET";
    const path = url.pathname.replace(
      /^\/agents\/petrinaut\/[0-9a-f]{64}/u,
      "",
    );
    if (url.pathname.startsWith("/stream")) {
      // Flue's own reply stream: held open until the test stops the turn.
      requests.push(`${method} flue-stream`);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });
    }
    if (path === "") {
      requests.push(`${method} flue-send`);
      return Response.json({
        streamUrl: "http://brunch.test/stream",
        offset: "-1",
        submissionId: "submission",
        uid: "uid",
      });
    }
    if (path === `/${liveToolRouteSegment}`) {
      requests.push(`${method} live-tool-stream`);
      return new Response(new ReadableStream({ start: (c) => c.close() }), {
        headers: { "content-type": "text/event-stream" },
      });
    }
    const call = /^\/browser-calls\/([^/]+)(\/lease|\/fail)?$/u.exec(path);
    if (call) {
      const [, toolCallId, action] = call;
      if (method === "GET") {
        requests.push(`GET claim ${toolCallId}`);
        return Response.json({
          capability: "capability",
          binding: canonicalContent(binding),
          toolName: "addPlace",
          input: placeInput,
        });
      }
      requests.push(
        `POST ${action === undefined ? "result" : action.slice(1)} ${toolCallId}`,
      );
      return new Response(null, { status: 200 });
    }
    throw new Error(`Unexpected request ${method} ${url.href}`);
  });
  const connection: BrunchConnection = {
    ownerKey: "owner",
    chatEndpoint: "http://brunch.test/agents/petrinaut",
    fetch: hostFetch,
  };
  const client = createBrunchFlueClient(connection, binding.conversationId);

  // Flue's submission and the live-tool stream the transport opens for it.
  const stop = new AbortController();
  const transport = createBrunchPanelTransport(
    client,
    new BrunchPanelConversationTracker(),
    {
      liveToolStream: brunchLiveToolStream(connection, binding.conversationId),
    },
  );
  const stream = await transport.sendMessages({
    trigger: "submit-message",
    chatId: binding.conversationId,
    messageId: "user",
    abortSignal: stop.signal,
    messages: [
      { id: "user", role: "user", parts: [{ type: "text", text: "Hi" }] },
    ],
  });
  await vi.waitFor(() => expect(requests).toContain("GET live-tool-stream"));
  stop.abort();
  await stream.cancel().catch(() => {});

  // The browser calls: claim, lease and result for one, claim and fail for another.
  const calls = createInBandBrowserCalls({
    client,
    ownerKey: connection.ownerKey,
    binding,
    metadataFor: () => undefined,
    prepareInput: () => {},
    acceptsRevision: () => true,
    fetch: hostFetch,
  });
  const issued = (toolCallId: string) => ({
    toolCallId,
    toolName: "addPlace",
    input: placeInput,
    signal: new AbortController().signal,
  });
  await calls.run(issued("applied"), async () => {
    vi.advanceTimersByTime(5_000);
    return { applied: true };
  });
  await expect(
    calls.run(issued("thrown"), async () => {
      throw new Error("The edit failed.");
    }),
  ).rejects.toThrow("The edit failed.");

  expect(requests).toEqual(
    expect.arrayContaining([
      "POST flue-send",
      "GET live-tool-stream",
      "GET claim applied",
      "POST lease applied",
      "POST result applied",
      "GET claim thrown",
      "POST fail thrown",
    ]),
  );
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
