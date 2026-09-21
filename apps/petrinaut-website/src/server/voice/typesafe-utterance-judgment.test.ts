import { describe, expect, test, vi } from "vitest";

import { createUtteranceJudgmentHandler } from "./typesafe-utterance-judgment";

const environment = {
  PETRINAUT_OPENAI_VOICE_ENABLED: "true",
  PETRINAUT_VOICE_PROVIDER: "live",
  OPENAI_VOICE_API_KEY: "voice-secret",
  TYPESAFE_API_KEY: "judge-secret",
  PETRINAUT_LIVE_UTTERANCE_JUDGMENT: "log",
};
const state = {
  transcript: "PRIVATE TRANSCRIPT",
  relayedBrunchText: "PRIVATE RELAY",
};
const request = (overrides: RequestInit & { duplex?: "half" } = {}) =>
  new Request("https://petrinaut.test/api/voice/utterance-judgment", {
    method: "POST",
    headers: {
      origin: "https://petrinaut.test",
      "content-type": "application/json",
    },
    body: JSON.stringify(state),
    ...overrides,
  });
const answer = {
  type: "choice",
  choice: "social_or_backchannel",
  confidence: 0.86,
  probabilities: { social_or_backchannel: 0.9, interview_content: 0.1 },
};

describe("utterance judgment handler", () => {
  test.each([
    [{ method: "GET", body: undefined }, 405],
    [
      {
        headers: {
          origin: "https://attacker.test",
          "content-type": "application/json",
        },
      },
      403,
    ],
    [{ headers: { "content-type": "application/json" } }, 403],
    [
      {
        headers: {
          origin: "https://petrinaut.test",
          "content-type": "text/plain",
        },
      },
      415,
    ],
    [{ body: "x".repeat(65_537) }, 413],
    [
      { body: JSON.stringify({ ...state, transcript: "é".repeat(33_000) }) },
      413,
    ],
    [{ body: "{not json" }, 400],
    [{ body: JSON.stringify({ ...state, transcript: 42 }) }, 400],
    [{ body: JSON.stringify({ transcript: "hello" }) }, 400],
    [{ body: JSON.stringify({ ...state, transcript: " " }) }, 400],
    [
      { body: JSON.stringify({ ...state, transcript: "a".repeat(32_001) }) },
      400,
    ],
  ] satisfies [RequestInit, number][])(
    "rejects unsafe request %j",
    async (overrides, status) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      const response = await createUtteranceJudgmentHandler({
        environment,
        fetch,
      })(request(overrides));
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("cancels an oversized chunked body before reading the remainder", async () => {
    const cancel = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(65_537));
      },
      cancel,
    });
    const response = await createUtteranceJudgmentHandler({
      environment,
      fetch,
    })(request({ body, duplex: "half" }));
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each([
    { PETRINAUT_LIVE_UTTERANCE_JUDGMENT: undefined },
    { PETRINAUT_LIVE_UTTERANCE_JUDGMENT: "enforce" },
    { TYPESAFE_API_KEY: " " },
    { PETRINAUT_VOICE_PROVIDER: "realtime" },
    { PETRINAUT_OPENAI_VOICE_ENABLED: "false" },
  ])("is unavailable outside the log experiment: %j", async (override) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const response = await createUtteranceJudgmentHandler({
      environment: { ...environment, ...override },
      fetch,
    })(request());
    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("sends one fixed question with only the supplied text state and normalizes the answer", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ answers: { contribution: answer } }),
    );
    const response = await createUtteranceJudgmentHandler({
      environment,
      fetch,
    })(
      request({
        body: JSON.stringify({ ...state, model: "evil", questions: "evil" }),
      }),
    );
    expect(await response.json()).toEqual({
      contribution: "social_or_backchannel",
      confidence: 0.86,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer judge-secret",
    );
    expect(init?.body).toBeTypeOf("string");
    const body = JSON.parse(init?.body as string) as {
      model: string;
      state: unknown;
      questions: {
        contribution: { type: string; criteria: Record<string, string> };
      };
    };
    expect(body.model).toBe("jev-latest");
    expect(body.state).toEqual(state);
    expect(Object.keys(body.questions)).toEqual(["contribution"]);
    expect(body.questions.contribution.type).toBe("choice");
    expect(Object.keys(body.questions.contribution.criteria).sort()).toEqual([
      "control",
      "interview_content",
      "no_content",
      "relay_request",
      "restates_assistant",
      "social_or_backchannel",
    ]);
  });

  test.each([
    null,
    { answers: { contribution: { ...answer, choice: "PRIVATE" } } },
    { answers: { contribution: { ...answer, confidence: 1.1 } } },
    { answers: { contribution: { ...answer, type: "score" } } },
  ])(
    "rejects malformed upstream answers without exposing content: %j",
    async (body) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json(body),
      );
      const response = await createUtteranceJudgmentHandler({
        environment,
        fetch,
      })(request());
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain("PRIVATE");
    },
  );

  test("upstream errors expose status only and never retry", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("PRIVATE PROVIDER TEXT", { status: 429 }),
    );
    const response = await createUtteranceJudgmentHandler({
      environment,
      fetch,
    })(request());
    expect(response.status).toBe(502);
    expect(response.headers.get("x-voice-upstream-status")).toBe("429");
    expect(await response.text()).not.toContain("PRIVATE");
    expect(fetch).toHaveBeenCalledOnce();
  });

  test("aborts upstream when the caller disconnects, without exposing the error", async () => {
    const abort = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      abort.abort(new Error("PRIVATE"));
      init?.signal?.throwIfAborted();
      return Response.json({});
    });
    const response = await createUtteranceJudgmentHandler({
      environment,
      fetch,
    })(request({ signal: abort.signal }));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("PRIVATE");
    expect(fetch).toHaveBeenCalledOnce();
  });
});
