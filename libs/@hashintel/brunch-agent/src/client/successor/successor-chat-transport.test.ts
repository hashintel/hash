import { createHash } from "node:crypto";

import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { describe, expect, test, vi } from "vitest";

import { createSuccessorChatTransport } from "./successor-chat-transport";

const endpoint = "http://durable.test/";
const conversation = {
  endpoint,
  actorKey: "actor-1",
  conversationId: "brunch-construction-v1:net-1:evaluation-I",
  web: "web-1",
};
/** SHA-256 of the actor key and conversation ID, NUL between: the server's instance ID. */
const instanceId = createHash("sha256")
  .update(`${conversation.actorKey}\0${conversation.conversationId}`)
  .digest("hex");

const userMessage = (id: string, text: string): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

const replyResponse = () =>
  createUIMessageStreamResponse({
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "start", messageId: "durable:entry-1" });
        controller.enqueue({ type: "text-start", id: "text-1" });
        controller.enqueue({ type: "text-delta", id: "text-1", delta: "Hi." });
        controller.enqueue({ type: "text-end", id: "text-1" });
        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      },
    }),
  });

/** A `fetch` that answers each request in turn, keeping what it was sent. */
const fakeFetch = (...answers: (() => Response | Promise<Response>)[]) => {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: input instanceof Request ? input.url : input.toString(),
      init: init ?? {},
    });
    const answer = answers.shift();
    if (answer === undefined) throw new Error("No answer left.");
    return answer();
  });
  return {
    fetch,
    requests,
    body: (index = 0): unknown => {
      const body = requests[index]?.init.body;
      return typeof body === "string" ? JSON.parse(body) : undefined;
    },
    headers: (index = 0) => new Headers(requests[index]?.init.headers),
  };
};

const send = (
  transport: ReturnType<typeof createSuccessorChatTransport>,
  messages: UIMessage[],
) =>
  transport.sendMessages({
    trigger: "submit-message",
    chatId: conversation.conversationId,
    messageId: undefined,
    messages,
    abortSignal: undefined,
  });

const readText = async (stream: ReadableStream<{ type: string }>) => {
  let text = "";
  const reader = stream.getReader();
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- Each read follows the last.
    const { done, value } = await reader.read();
    if (done) return text;
    if (value.type === "text-delta" && "delta" in value)
      text += String(value.delta);
  }
};

describe("sending a message", () => {
  test("posts the last message to /chat under the instance ID, bound to the document, with the raw ID and web as headers", async () => {
    const wire = fakeFetch(replyResponse);
    const transport = createSuccessorChatTransport({
      conversation: { ...conversation, fetch: wire.fetch },
      documentId: "net-1",
    });

    const stream = await send(transport, [
      userMessage("u-0", "Earlier."),
      userMessage("u-1", "Hello."),
    ]);

    expect(await readText(stream)).toBe("Hi.");
    expect(wire.requests).toHaveLength(1);
    expect(wire.requests[0]?.url).toBe("http://durable.test/chat");
    expect(wire.requests[0]?.init).toMatchObject({
      method: "POST",
      credentials: "include",
    });
    expect(wire.body()).toEqual({
      id: instanceId,
      messages: [userMessage("u-1", "Hello.")],
      trigger: "submit-message",
      binding: {
        conversationId: conversation.conversationId,
        documentId: "net-1",
      },
    });
    expect(wire.headers().get("x-brunch-conversation")).toBe(
      conversation.conversationId,
    );
    expect(wire.headers().get("x-brunch-web")).toBe("web-1");
  });

  test("a 404 is refused as a conversation that does not exist, and not sent again", async () => {
    const wire = fakeFetch(
      () =>
        new Response("Unknown conversation; a document binding creates one.", {
          status: 404,
        }),
    );
    const transport = createSuccessorChatTransport({
      conversation: { ...conversation, fetch: wire.fetch },
      documentId: "net-1",
    });

    await expect(
      send(transport, [userMessage("u-1", "Hello.")]),
    ).rejects.toMatchObject({
      name: "FlueChatAdmissionError",
      failure: { kind: "rejected", status: 404 },
      message: "This conversation does not exist.",
    });
    expect(wire.requests).toHaveLength(1);
  });

  test("a 409 is refused with the server's cause, and not sent again", async () => {
    const wire = fakeFetch(
      () =>
        new Response("The conversation is bound to a different document.", {
          status: 409,
        }),
    );
    const transport = createSuccessorChatTransport({
      conversation: { ...conversation, fetch: wire.fetch },
      documentId: "net-2",
    });

    await expect(
      send(transport, [userMessage("u-1", "Hello.")]),
    ).rejects.toMatchObject({
      name: "FlueChatAdmissionError",
      failure: { kind: "rejected", status: 409 },
      message: "The conversation is bound to a different document.",
    });
    expect(wire.requests).toHaveLength(1);
  });

  test("a 503 is sent again, unchanged, once its Retry-After has passed", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const wire = fakeFetch(
        () =>
          new Response("The server is busy; try again shortly.", {
            status: 503,
            headers: { "Retry-After": "2" },
          }),
        replyResponse,
      );
      const transport = createSuccessorChatTransport({
        conversation: { ...conversation, fetch: wire.fetch },
        documentId: "net-1",
      });

      const sent = send(transport, [userMessage("u-1", "Hello.")]);
      // The instance ID is hashed off the timer queue; wait for the 503's pause.
      while (vi.getTimerCount() === 0) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setImmediate(resolve);
        });
      }
      await vi.advanceTimersByTimeAsync(1999);
      expect(wire.requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await readText(await sent)).toBe("Hi.");
      expect(wire.requests).toHaveLength(2);
      expect(wire.body(1)).toEqual(wire.body(0));
    } finally {
      vi.useRealTimers();
    }
  });

  test("a server that stays busy leaves the message's admission unconfirmed", async () => {
    const busy = () =>
      new Response("The server is busy; try again shortly.", {
        status: 503,
        headers: { "Retry-After": "0" },
      });
    const wire = fakeFetch(...Array.from({ length: 20 }, () => busy));
    const transport = createSuccessorChatTransport({
      conversation: { ...conversation, fetch: wire.fetch },
      documentId: "net-1",
    });

    await expect(
      send(transport, [userMessage("u-1", "Hello.")]),
    ).rejects.toMatchObject({
      name: "FlueChatAdmissionError",
      failure: { kind: "ambiguous" },
    });
    expect(wire.requests.length).toBeGreaterThan(1);
    expect(wire.requests.length).toBeLessThan(20);
  });

  test("a lost connection leaves the message's admission unconfirmed", async () => {
    const wire = fakeFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    const transport = createSuccessorChatTransport({
      conversation: { ...conversation, fetch: wire.fetch },
      documentId: "net-1",
    });

    await expect(
      send(transport, [userMessage("u-1", "Hello.")]),
    ).rejects.toMatchObject({
      name: "FlueChatAdmissionError",
      failure: { kind: "ambiguous" },
    });
  });
});

describe("reconnecting", () => {
  const reconnect = (fetch: typeof globalThis.fetch) =>
    createSuccessorChatTransport({
      conversation: { ...conversation, fetch },
      documentId: "net-1",
    }).reconnectToStream({ chatId: conversation.conversationId });

  test("follows the running turn at the instance's stream", async () => {
    const wire = fakeFetch(replyResponse);

    const stream = await reconnect(wire.fetch);

    expect(stream).not.toBeNull();
    expect(await readText(stream!)).toBe("Hi.");
    expect(wire.requests[0]?.url).toBe(
      `http://durable.test/chat/${instanceId}/stream`,
    );
    expect(wire.requests[0]?.init).toMatchObject({
      method: "GET",
      credentials: "include",
    });
    expect(wire.headers().get("x-brunch-conversation")).toBe(
      conversation.conversationId,
    );
    expect(wire.headers().get("x-brunch-web")).toBe("web-1");
  });

  test.each([
    ["idle", () => new Response(null, { status: 204 })],
    ["unknown", () => new Response("Unknown conversation.", { status: 404 })],
  ])("finds nothing to follow in an %s conversation", async (_, answer) => {
    const wire = fakeFetch(answer);

    expect(await reconnect(wire.fetch)).toBeNull();
  });
});
