import { afterEach, describe, expect, test, vi } from "vitest";

import { createUtteranceJudgmentHandler } from "./typesafe-utterance-judgment";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const environment = {
  PETRINAUT_OPENAI_VOICE_ENABLED: "true",
  PETRINAUT_VOICE_PROVIDER: "live",
  OPENAI_VOICE_API_KEY: "voice-secret",
  TYPESAFE_API_KEY: "judge-secret",
  PETRINAUT_LIVE_UTTERANCE_JUDGMENT: "log",
  NODE_ENV: "development",
};
const state = {
  transcript: "PRIVATE TRANSCRIPT",
  offeredBrunchText: "PRIVATE RELAY",
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
  test("passes current question as bounded classifier data in local enforcement", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ answers: { contribution: answer } }));
    const handler = createUtteranceJudgmentHandler({
      environment: {
        ...environment,
        NODE_ENV: "development",
        PETRINAUT_LIVE_UTTERANCE_JUDGMENT: "enforce",
      },
      fetch,
    });
    const current = { ...state, currentInterviewQuestion: "PRIVATE QUESTION" };
    expect(
      (await handler(request({ body: JSON.stringify(current) }))).status,
    ).toBe(200);
    const body = fetch.mock.calls[0]?.[1]?.body;
    if (typeof body !== "string") throw new Error("Expected a JSON request");
    expect(JSON.parse(body).state).toEqual(current);
  });

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
    [{ body: "x".repeat(1_000_000) }, 413],
    [
      { body: JSON.stringify({ ...state, transcript: "é".repeat(32_001) }) },
      400,
    ],
    [
      {
        body: JSON.stringify({
          ...state,
          offeredBrunchText: "a".repeat(32_001),
        }),
      },
      400,
    ],
    [{ body: "{not json" }, 400],
    [{ body: JSON.stringify({ ...state, transcript: 42 }) }, 400],
    [{ body: JSON.stringify({ transcript: "hello" }) }, 400],
    [{ body: JSON.stringify({ ...state, transcript: " " }) }, 400],
    [{ body: JSON.stringify({ ...state, currentInterviewQuestion: 42 }) }, 400],
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
        controller.enqueue(new Uint8Array(1_000_000));
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
    { TYPESAFE_API_KEY: " " },
    { PETRINAUT_VOICE_PROVIDER: "realtime" },
    { PETRINAUT_OPENAI_VOICE_ENABLED: "false" },
    { NODE_ENV: "production" },
    { VERCEL_ENV: "production" },
  ])("is unavailable outside the log experiment: %j", async (override) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const response = await createUtteranceJudgmentHandler({
      environment: { ...environment, ...override },
      fetch,
    })(request());
    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  describe("on a preview deployment", () => {
    const previewEnvironment = {
      ...environment,
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
    };
    const previewRequest = (clientIp?: string) =>
      request({
        headers: {
          origin: "https://petrinaut.test",
          "content-type": "application/json",
          ...(clientIp === undefined ? {} : { "x-forwarded-for": clientIp }),
        },
      });
    const judgedFetch = () =>
      vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({ answers: { contribution: answer } }),
      );

    test("judges requests from an identified client", async () => {
      const fetch = judgedFetch();
      const response = await createUtteranceJudgmentHandler({
        environment: previewEnvironment,
        fetch,
      })(previewRequest("203.0.113.7"));
      expect(response.status).toBe(200);
      expect(fetch).toHaveBeenCalledOnce();
    });

    test("rejects requests without a client IP before calling upstream", async () => {
      const fetch = judgedFetch();
      const report = vi.fn();
      const response = await createUtteranceJudgmentHandler({
        environment: previewEnvironment,
        fetch,
        report,
      })(previewRequest());
      expect(response.status).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: "unidentified-client",
          status: 400,
        }),
      );
    });

    test("limits each client to 30 judgments a minute", async () => {
      const fetch = judgedFetch();
      const report = vi.fn();
      const handler = createUtteranceJudgmentHandler({
        environment: previewEnvironment,
        fetch,
        report,
      });
      for (let i = 0; i < 30; i++) {
        expect((await handler(previewRequest("203.0.113.7"))).status).toBe(200);
      }
      expect((await handler(previewRequest("203.0.113.7"))).status).toBe(429);
      expect(fetch).toHaveBeenCalledTimes(30);
      expect(report).toHaveBeenLastCalledWith(
        expect.objectContaining({ outcome: "rate-limited", status: 429 }),
      );
      expect((await handler(previewRequest("203.0.113.8"))).status).toBe(200);
    });
  });

  test("reports judged requests as metadata only", async () => {
    const report = vi.fn();
    let time = 100;
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      time += 42;
      return Response.json({ answers: { contribution: answer } });
    });
    await createUtteranceJudgmentHandler({
      environment: {
        ...environment,
        PETRINAUT_LIVE_UTTERANCE_JUDGMENT: "enforce",
      },
      fetch,
      report,
      now: () => time,
    })(request());
    expect(report).toHaveBeenCalledExactlyOnceWith({
      operation: "utterance-judgment",
      mode: "enforce",
      outcome: "judged",
      status: 200,
      durationMs: 42,
      contribution: "social_or_backchannel",
      confidence: 0.86,
      upstreamStatus: 200,
    });
  });

  test("reports upstream failures with their status and without provider text", async () => {
    const report = vi.fn();
    await createUtteranceJudgmentHandler({
      environment,
      fetch: async () => new Response("PRIVATE PROVIDER TEXT", { status: 429 }),
      report,
    })(request());
    expect(report).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        mode: "log",
        outcome: "upstream-error",
        status: 502,
        upstreamStatus: 429,
      }),
    );
    expect(JSON.stringify(report.mock.calls)).not.toContain("PRIVATE");
  });

  test("does not report requests rejected before the mode check", async () => {
    const report = vi.fn();
    await createUtteranceJudgmentHandler({
      environment: { ...environment, PETRINAUT_LIVE_UTTERANCE_JUDGMENT: "off" },
      fetch: vi.fn<typeof globalThis.fetch>(),
      report,
    })(request());
    expect(report).not.toHaveBeenCalled();
  });

  test("judges the longest eligible text even when every character is escaped", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ answers: { contribution: answer } }),
    );
    const response = await createUtteranceJudgmentHandler({
      environment,
      fetch,
    })(
      request({
        body: JSON.stringify({
          transcript: "\u0001".repeat(32_000),
          offeredBrunchText: "\u0001".repeat(32_000),
          currentInterviewQuestion: "\u0001".repeat(32_000),
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
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
        contribution: {
          type: string;
          instructions: string;
          criteria: Record<string, string>;
        };
      };
    };
    expect(body.model).toBe("jev-latest");
    expect(body.state).toEqual(state);
    expect(Object.keys(body.questions)).toEqual(["contribution"]);
    expect(body.questions.contribution.type).toBe("choice");
    // Guard the measured prompt boundary, not the model's semantic accuracy.
    expect(body.questions.contribution.instructions).toContain(
      "Repeating or paraphrasing the assistant's question is not a new interview question.",
    );
    expect(body.questions.contribution.criteria.interview_content).toContain(
      "Excludes merely repeating or paraphrasing offeredBrunchText without adding anything.",
    );
    expect(body.questions.contribution.criteria.restates_assistant).toContain(
      "Any added answer or correction takes priority as interview_content.",
    );
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

  test.each([
    [2_500, 200],
    [20_000, 502],
  ])(
    "bounds a %i ms upstream observation with status %i",
    async (delay, status) => {
      vi.useFakeTimers();
      const timeoutSpy = vi
        .spyOn(AbortSignal, "timeout")
        .mockImplementation((milliseconds) => {
          const timeout = new AbortController();
          setTimeout(() => timeout.abort(), milliseconds);
          return timeout.signal;
        });
      const fetch = vi.fn<typeof globalThis.fetch>(
        (_url, init) =>
          new Promise((resolve, reject) => {
            setTimeout(
              () =>
                resolve(Response.json({ answers: { contribution: answer } })),
              delay,
            );
            init?.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason),
              { once: true },
            );
          }),
      );
      const pending = createUtteranceJudgmentHandler({ environment, fetch })(
        request(),
      );
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(12_000);
      const response = await pending;
      expect(response.status).toBe(status);
      if (status === 200) {
        expect(await response.json()).toEqual({
          contribution: answer.choice,
          confidence: answer.confidence,
        });
      }
      expect(timeoutSpy).toHaveBeenCalledWith(12_000);
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

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
