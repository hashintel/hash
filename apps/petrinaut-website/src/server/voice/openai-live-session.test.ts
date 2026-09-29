import { describe, expect, test, vi } from "vitest";

import { createOpenAILiveSessionHandler } from "./openai-live-session";
import { createOpenAIVoiceConfigHandler } from "./openai-voice-config";

const environment = {
  PETRINAUT_OPENAI_VOICE_ENABLED: "true",
  PETRINAUT_VOICE_PROVIDER: "live",
  OPENAI_VOICE_API_KEY: "server-only-secret",
};
const request = (overrides: RequestInit & { duplex?: "half" } = {}) =>
  new Request("https://petrinaut.test/api/voice/live-session", {
    method: "POST",
    headers: {
      origin: "https://petrinaut.test",
      "content-type": "application/sdp",
    },
    body: "v=0\r\no=offer",
    ...overrides,
  });

describe("Live configuration and session creation", () => {
  test.each([
    [undefined, "live", true],
    ["realtime", "realtime", true],
    ["live", "live", true],
    ["live-brunch", null, false],
  ])(
    "selects %s without silently falling back",
    async (value, provider, available) => {
      const handler = createOpenAIVoiceConfigHandler({
        ...environment,
        PETRINAUT_VOICE_PROVIDER: value,
      });
      const response = await handler(
        new Request("https://petrinaut.test/api/voice/config"),
      );
      expect(await response.json()).toEqual({
        available,
        provider,
        connectionTimeoutMs: 15_000,
      });
    },
  );

  test.each([
    [{ method: "GET", body: undefined }, 405],
    [
      {
        headers: {
          origin: "https://attacker.test",
          "content-type": "application/sdp",
        },
      },
      403,
    ],
    [{ headers: { "content-type": "application/sdp" } }, 403],
    [
      {
        headers: {
          origin: "https://petrinaut.test",
          "content-type": "application/json",
        },
      },
      415,
    ],
    [{ body: "not SDP" }, 400],
    [{ body: "v=0" + "x".repeat(65_536) }, 413],
  ] satisfies [RequestInit, number][])(
    "rejects unsafe requests before fetching: %j",
    async (overrides, status) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      const response = await createOpenAILiveSessionHandler({
        environment,
        fetch,
      })(request(overrides));
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("cancels a chunked offer as soon as it exceeds the byte limit", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const cancel = vi.fn();
    const chunks = [new TextEncoder().encode("v=0"), new Uint8Array(65_534)];
    const pull = vi.fn(
      (controller: ReadableStreamDefaultController<Uint8Array>) => {
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
    );
    const body = new ReadableStream({ pull, cancel }, { highWaterMark: 0 });
    const response = await createOpenAILiveSessionHandler({
      environment,
      fetch,
    })(
      request({
        body,
        duplex: "half",
      }),
    );
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(pull).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("preserves an offer at the byte limit across split UTF-8 chunks", async () => {
    const sdp = "v=0\r\n" + "x".repeat(65_529) + "é";
    const encoded = new TextEncoder().encode(sdp);
    expect(encoded.byteLength).toBe(65_536);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.subarray(0, 65_535));
        controller.enqueue(encoded.subarray(65_535));
        controller.close();
      },
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        session: { id: "session" },
        transport: { type: "webrtc", sdp: "v=0\r\no=answer" },
      }),
    );
    const response = await createOpenAILiveSessionHandler({
      environment,
      fetch,
    })(
      request({
        body,
        duplex: "half",
      }),
    );
    expect(response.status).toBe(201);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[1]?.body).toContain(
      JSON.stringify({ type: "webrtc", sdp }),
    );
  });

  test.each(["request", "deadline"])(
    "cancels a stalled offer on %s abort without contacting the provider",
    async (source) => {
      const abort = new AbortController();
      const timeout = vi.spyOn(AbortSignal, "timeout");
      if (source === "deadline") timeout.mockReturnValue(abort.signal);
      const fetch = vi.fn<typeof globalThis.fetch>();
      const cancel = vi.fn();
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          controller = streamController;
          controller.enqueue(new TextEncoder().encode("v=0"));
        },
        cancel,
      });
      const pending = createOpenAILiveSessionHandler({ environment, fetch })(
        request({
          body,
          signal: source === "request" ? abort.signal : undefined,
          duplex: "half",
        }),
      );
      try {
        abort.abort();
        await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
        expect((await pending).status).toBe(502);
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        // Release the broken implementation's read too, so a regression cannot leak work.
        if (!cancel.mock.calls.length) controller.close();
        await pending;
        timeout.mockRestore();
      }
    },
  );

  test.each([
    { PETRINAUT_OPENAI_VOICE_ENABLED: "false" },
    { OPENAI_VOICE_API_KEY: " " },
  ])("requires existing enablement/credentials: %j", async (override) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(
      (
        await createOpenAILiveSessionHandler({
          environment: { ...environment, ...override },
          fetch,
        })(request())
      ).status,
    ).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each([undefined, "realtime", "live"])(
    "allows a browser-selected Live session with server default %s",
    async (provider) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json(
          {
            session: { id: "preview/session:id" },
            transport: { type: "webrtc", sdp: "v=0\r\no=answer" },
          },
          { status: 201 },
        ),
      );
      const response = await createOpenAILiveSessionHandler({
        environment: {
          ...environment,
          PETRINAUT_VOICE_PROVIDER: provider,
          VERCEL_ENV: "production",
        },
        fetch,
      })(request());

      expect(response.status).toBe(201);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]![0]).toBe(
        "https://api.openai.com/v1/live/sessions",
      );
    },
  );

  test("creates one client-delegated WebRTC session with Brunch-authoritative delivery instructions and no tools", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          session: { id: "opaque/session:id" },
          transport: { type: "webrtc", sdp: "v=0\r\no=answer" },
          secret: "must-not-leak",
        },
        { status: 201 },
      ),
    );
    const response = await createOpenAILiveSessionHandler({
      environment,
      fetch,
    })(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      sessionId: "opaque/session:id",
      sdp: "v=0\r\no=answer",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/live/sessions");
    expect(typeof init?.body).toBe("string");
    const body: unknown = JSON.parse(init?.body as string);
    expect(body).toEqual({
      session: {
        model: "gpt-live-1",
        delegation: { type: "client" },
        store: false,
        instructions: expect.stringMatching(
          /Backchannel policy:[\s\S]*Interruption policy:[\s\S]*Delegation policy:[\s\S]*Backend tools:[\s\S]*Brunch:[\s\S]*Delegate to the backend when:[\s\S]*Do not delegate to the backend when:[\s\S]*Delegate before giving an answer that depends on backend work\. Do not guess the result while waiting\.[\s\S]*Brunch is the sole authority[\s\S]*You have no tools[\s\S]*supplied settled Brunch context[\s\S]*best-effort/i,
        ) as unknown,
        audio: { output: { voice: "marin" } },
      },
      transport: { type: "webrtc", sdp: "v=0\r\no=offer" },
    });
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer server-only-secret",
    );
  });

  test.each(["cedar", "not-a-voice"])(
    "rejects the non-Live voice %s before contacting the provider",
    async (voice) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      const response = await createOpenAILiveSessionHandler({
        environment,
        fetch,
      })(
        request({
          headers: {
            origin: "https://petrinaut.test",
            "content-type": "application/sdp",
            "x-petrinaut-voice": voice,
          },
        }),
      );

      expect(response.status).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("forwards a selected Live voice", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        session: { id: "session" },
        transport: { type: "webrtc", sdp: "v=0\r\no=answer" },
      }),
    );
    const response = await createOpenAILiveSessionHandler({
      environment,
      fetch,
    })(
      request({
        headers: {
          origin: "https://petrinaut.test",
          "content-type": "application/sdp",
          "x-petrinaut-voice": "quartz",
        },
      }),
    );

    expect(response.status).toBe(201);
    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string) as {
      session: { audio: { output: { voice: string } } };
    };
    expect(body.session.audio.output.voice).toBe("quartz");
  });

  test("sanitizes provider failure and never retries", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("server-only-secret", { status: 429 }),
    );
    const response = await createOpenAILiveSessionHandler({
      environment,
      fetch,
    })(request());
    expect(response.status).toBe(502);
    expect(response.headers.get("x-voice-upstream-status")).toBe("429");
    expect(await response.text()).not.toContain("server-only-secret");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("does not contact the provider for an already aborted request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const response = await createOpenAILiveSessionHandler({
      environment,
      fetch,
    })(request({ signal: AbortSignal.abort() }));
    expect(response.status).toBe(502);
    expect(fetch).not.toHaveBeenCalled();
  });
});
