import { describe, expect, test, vi } from "vitest";

import { BrunchVoiceBridge } from "@hashintel/brunch-agent-transport-aisdk/voice-bridge";

const encoder = new TextEncoder();

const sseResponse = (...chunks: Record<string, unknown>[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "x-vercel-ai-ui-message-stream": "v1",
      },
    },
  );

const collect = async (stream: AsyncIterable<string>) => {
  let text = "";
  for await (const chunk of stream) {
    text += chunk;
  }
  return text;
};

describe("BrunchVoiceBridge", () => {
  test("sends the first finalized transcript through the existing chat route", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        sseResponse(
          { type: "start", messageId: "assistant-1" },
          { type: "text-delta", id: "text-1", delta: "Tell me more." },
          { type: "finish", finishReason: "stop" },
        ),
      );
    const bridge = new BrunchVoiceBridge({
      chatEndpoint: "http://127.0.0.1:4321/api/chat",
      createId: () => "generated-user-message",
      fetch,
    });
    const signal = new AbortController().signal;

    const reply = await collect(
      bridge.respond({
        conversationId: "conv_elevenlabs",
        signal,
        transcript: "The support lead triages the escalation.",
      }),
    );

    expect(reply).toBe("Tell me more.");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:4321/api/chat");
    expect(request.signal).toBe(signal);
    expect(JSON.parse(request.body as string)).toEqual({
      id: "voice:conv_elevenlabs",
      trigger: "submit-message",
      messages: [
        {
          id: "generated-user-message",
          role: "user",
          parts: [
            {
              type: "text",
              text: "The support lead triages the escalation.",
            },
          ],
        },
      ],
    });
  });

  test("speaks brunch_ask and submits the next transcript as its human answer", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse(
          { type: "start", messageId: "assistant-ask" },
          {
            type: "tool-input-available",
            toolCallId: "tool-call-1",
            toolName: "brunch_ask",
            input: { question: "Who owns the first response?" },
          },
          { type: "finish", finishReason: "tool-calls" },
        ),
      )
      .mockResolvedValueOnce(
        sseResponse(
          { type: "start", messageId: "assistant-ask" },
          {
            type: "text-delta",
            id: "text-2",
            delta: "The support lead owns it. What happens next?",
          },
          { type: "finish", finishReason: "stop" },
        ),
      );
    const bridge = new BrunchVoiceBridge({
      chatEndpoint: "http://127.0.0.1:4321/api/chat",
      createId: () => "generated-user-message",
      fetch,
    });

    const question = await collect(
      bridge.respond({
        conversationId: "conv_elevenlabs",
        signal: new AbortController().signal,
        transcript: "Help me model our escalation process.",
      }),
    );
    const answerReply = await collect(
      bridge.respond({
        conversationId: "conv_elevenlabs",
        signal: new AbortController().signal,
        transcript: "The support lead.",
      }),
    );

    expect(question).toBe("Who owns the first response?");
    expect(answerReply).toBe("The support lead owns it. What happens next?");
    const [, secondRequest] = fetch.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(secondRequest.body as string)).toEqual({
      id: "voice:conv_elevenlabs",
      trigger: "submit-message",
      messageId: "assistant-ask",
      messages: [
        {
          id: "assistant-ask",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "brunch_ask",
              toolCallId: "tool-call-1",
              state: "output-available",
              input: { question: "Who owns the first response?" },
              output: { answer: "The support lead." },
            },
          ],
        },
      ],
    });
  });

  test("retains a pending ask when interruption happens before admission", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse(
          { type: "start", messageId: "assistant-ask" },
          {
            type: "tool-input-available",
            toolCallId: "tool-call-1",
            toolName: "brunch_ask",
            input: { question: "Who owns the first response?" },
          },
        ),
      )
      .mockRejectedValueOnce(new DOMException("Interrupted", "AbortError"))
      .mockResolvedValueOnce(
        sseResponse(
          { type: "start", messageId: "assistant-ask" },
          { type: "text-delta", id: "text-2", delta: "Understood." },
        ),
      );
    const bridge = new BrunchVoiceBridge({
      chatEndpoint: "http://127.0.0.1:4321/api/chat",
      createId: () => "generated-user-message",
      fetch,
    });

    await collect(
      bridge.respond({
        conversationId: "conv_elevenlabs",
        signal: new AbortController().signal,
        transcript: "Help me model our escalation process.",
      }),
    );
    await expect(
      collect(
        bridge.respond({
          conversationId: "conv_elevenlabs",
          signal: AbortSignal.abort(),
          transcript: "The support lead.",
        }),
      ),
    ).rejects.toThrow("Interrupted");
    await collect(
      bridge.respond({
        conversationId: "conv_elevenlabs",
        signal: new AbortController().signal,
        transcript: "The support lead.",
      }),
    );

    for (const callIndex of [1, 2]) {
      const [, request] = fetch.mock.calls[callIndex] as [string, RequestInit];
      expect(JSON.parse(request.body as string)).toMatchObject({
        id: "voice:conv_elevenlabs",
        messageId: "assistant-ask",
        messages: [
          {
            parts: [
              {
                toolCallId: "tool-call-1",
                output: { answer: "The support lead." },
              },
            ],
          },
        ],
      });
    }
  });

  test("does not speak an ask question twice when text already ends with it", async () => {
    const fetch = vi.fn().mockResolvedValue(
      sseResponse(
        { type: "start", messageId: "assistant-ask" },
        {
          type: "text-delta",
          id: "text-1",
          delta: "Thanks. Who owns triage?",
        },
        {
          type: "tool-input-available",
          toolCallId: "tool-call-1",
          toolName: "brunch_ask",
          input: { question: "Who owns triage?" },
        },
      ),
    );
    const bridge = new BrunchVoiceBridge({
      chatEndpoint: "http://127.0.0.1:4321/api/chat",
      fetch,
    });

    await expect(
      collect(
        bridge.respond({
          conversationId: "conv_elevenlabs",
          signal: new AbortController().signal,
          transcript: "The support lead.",
        }),
      ),
    ).resolves.toBe("Thanks. Who owns triage?");
  });

  test("forgets provider history and keeps sessions isolated", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        sseResponse(
          { type: "start", messageId: "assistant-1" },
          { type: "text-delta", id: "text-1", delta: "Understood." },
          { type: "finish", finishReason: "stop" },
        ),
      );
    const bridge = new BrunchVoiceBridge({
      chatEndpoint: "http://127.0.0.1:4321/api/chat",
      createId: () => "message-id",
      fetch,
    });

    await collect(
      bridge.respond({
        conversationId: "conv_one",
        signal: new AbortController().signal,
        transcript: "Only this finalized turn.",
      }),
    );
    await collect(
      bridge.respond({
        conversationId: "conv_two",
        signal: new AbortController().signal,
        transcript: "A different expert's turn.",
      }),
    );

    const requestBodies = fetch.mock.calls.map(([, request]) =>
      JSON.parse((request as RequestInit).body as string),
    ) as { id: string; messages: unknown[] }[];
    expect(requestBodies.map(({ id }) => id)).toEqual([
      "voice:conv_one",
      "voice:conv_two",
    ]);
    expect(JSON.stringify(requestBodies)).not.toContain("provider history");
  });

  test("surfaces a safe error without consuming an upstream body", async () => {
    const text = vi.fn().mockResolvedValue("private upstream details");
    const fetch = vi.fn().mockResolvedValue({
      body: null,
      ok: false,
      status: 500,
      text,
    });
    const bridge = new BrunchVoiceBridge({
      chatEndpoint: "http://127.0.0.1:4321/api/chat",
      fetch,
    });

    await expect(
      collect(
        bridge.respond({
          conversationId: "conv_error",
          signal: new AbortController().signal,
          transcript: "A turn that fails.",
        }),
      ),
    ).rejects.toThrow("Brunch could not answer the voice turn.");
    expect(text).not.toHaveBeenCalled();
  });
});
