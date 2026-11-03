import { expect, test } from "vitest";

import { createGrafanaReader } from "./grafana.ts";

const window = {
  start: new Date("2026-11-03T10:00:00.000Z"),
  end: new Date("2026-11-03T11:00:00.000Z"),
};

const turn = {
  turnId: "turn-1",
  purpose: "agent",
  provider: "openai",
  requestedModel: "gpt-5.4-mini",
  responseModel: null,
  retryOf: null,
  error: null,
  startedAt: "2026-11-03T10:30:00.000Z",
  timeToFirstEventMs: 700,
  durationMs: 2_500,
  terminal: "turn",
  isError: false,
  inputTokens: 9_416,
  cacheReadTokens: 0,
  outputTokens: 49,
  requestShape: null,
  responseShape: null,
  toolCalls: [],
};

const string = (value: string) => ({ stringValue: value });

/** Tempo's v2 trace shape: a chat span with one HTTP request under it, and an unrelated tool span. */
const trace = {
  trace: {
    resourceSpans: [
      {
        scopeSpans: [
          {
            spans: [
              {
                spanId: "chat-span",
                parentSpanId: "agent-span",
                name: "chat gpt-5.4-mini",
                startTimeUnixNano: "1793701800000000000",
                endTimeUnixNano: "1793701802538000000",
                status: {},
                attributes: [
                  { key: "gen_ai.operation.name", value: string("chat") },
                  { key: "flue.submission.id", value: string("sub-1") },
                  { key: "flue.turn.id", value: string("turn-1") },
                  { key: "gen_ai.provider.name", value: string("openai") },
                  {
                    key: "gen_ai.request.model",
                    value: string("gpt-5.4-mini"),
                  },
                  {
                    key: "gen_ai.response.finish_reasons",
                    value: { arrayValue: { values: [string("tool_call")] } },
                  },
                  {
                    key: "gen_ai.usage.input_tokens",
                    value: { intValue: "9416" },
                  },
                ],
              },
              {
                spanId: "http-span",
                parentSpanId: "chat-span",
                name: "POST /v1/responses",
                startTimeUnixNano: "1793701800010000000",
                endTimeUnixNano: "1793701802530000000",
                attributes: [
                  {
                    key: "http.response.status_code",
                    value: { intValue: 200 },
                  },
                ],
              },
              {
                spanId: "tool-span",
                parentSpanId: "agent-span",
                name: "execute_tool addPlace",
                startTimeUnixNano: "1793701803000000000",
                endTimeUnixNano: "1793701803010000000",
                attributes: [
                  {
                    key: "gen_ai.operation.name",
                    value: string("execute_tool"),
                  },
                  { key: "flue.submission.id", value: string("sub-1") },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

const fakeGrafana = () => {
  const requests: URL[] = [];
  const respond = (body: unknown) =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    requests.push(url);
    if (url.pathname === "/api/datasources")
      return respond([
        { uid: "loki", name: "Logs", type: "loki" },
        { uid: "tempo-uid", name: "Traces", type: "tempo" },
      ]);
    if (url.pathname.endsWith("/loki/api/v1/query_range")) {
      const query = url.searchParams.get("query") ?? "";
      return respond({
        data: {
          result: query.includes("flue.submission chronology")
            ? [
                {
                  stream: {
                    service_name: "Brunch Agent",
                    submissionId: "sub-1",
                    outcome: "completed",
                    turns: JSON.stringify([turn]),
                  },
                  values: [
                    [
                      "1793701815336000000",
                      "[brunch] flue.submission chronology",
                    ],
                  ],
                },
              ]
            : [
                {
                  stream: {
                    submissionId: "sub-1",
                    turnId: "turn-1",
                    provider: "openai",
                    model: "gpt-5.4-mini",
                    phase: "request_dispatch",
                    idleMs: "60000",
                    acknowledged: "true",
                    retryClaimed: "false",
                  },
                  values: [
                    ["1793701810000000000", "[brunch] provider.timeout"],
                  ],
                },
              ],
        },
      });
    }
    if (url.pathname.endsWith("/api/search"))
      return respond({ traces: [{ traceID: "trace-1" }] });
    if (url.pathname.endsWith("/api/v2/traces/trace-1")) return respond(trace);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { requests, fetchImpl };
};

const config = {
  url: "http://grafana.test/",
  token: undefined,
  service: "Brunch Agent",
};

test("chronologies come from Loki's structured metadata, timestamped by Loki, filtered by submission", async () => {
  const { requests, fetchImpl } = fakeGrafana();
  const reader = createGrafanaReader(config, fetchImpl);

  const chronologies = await reader.chronologies(window, "sub-1");

  expect(chronologies).toEqual([
    {
      submissionId: "sub-1",
      outcome: "completed",
      turns: [turn],
      timestamp: "2026-11-03T10:30:15.336Z",
    },
  ]);
  const query = requests.at(-1);
  expect(query?.pathname).toBe(
    "/api/datasources/proxy/uid/loki/loki/api/v1/query_range",
  );
  expect(query?.searchParams.get("query")).toBe(
    '{service_name="Brunch Agent"} |= "[brunch] flue.submission chronology" | submissionId="sub-1"',
  );
});

test("idle timeouts read their string-typed metadata back as numbers and booleans", async () => {
  const { fetchImpl } = fakeGrafana();

  const [timeout] = await createGrafanaReader(config, fetchImpl).idleTimeouts(
    window,
  );

  expect(timeout).toMatchObject({
    timestamp: "2026-11-03T10:30:10.000Z",
    idleMs: 60_000,
    acknowledged: true,
    retryClaimed: false,
    lastEventType: null,
  });
});

test("model-call spans are the submission's chat spans, with the HTTP requests beneath them", async () => {
  const { requests, fetchImpl } = fakeGrafana();

  const spans = await createGrafanaReader(config, fetchImpl).modelCallSpans(
    window,
    "sub-1",
  );

  expect(spans).toEqual([
    {
      traceId: "trace-1",
      turnId: "turn-1",
      provider: "openai",
      requestedModel: "gpt-5.4-mini",
      responseModel: null,
      startedAt: "2026-11-03T10:30:00.000Z",
      durationMs: 2_538,
      failed: false,
      errorType: null,
      finishReasons: ["tool_call"],
      inputTokens: 9_416,
      outputTokens: null,
      httpRequests: [{ statusCode: 200, durationMs: 2_520 }],
    },
  ]);
  const search = requests.find((url) => url.pathname.endsWith("/api/search"));
  expect(search?.pathname).toBe(
    "/api/datasources/proxy/uid/tempo-uid/api/search",
  );
  expect(search?.searchParams.get("q")).toBe(
    '{resource.service.name="Brunch Agent" && span.flue.submission.id="sub-1"}',
  );
});

test("a named datasource Grafana lacks is reported by name", async () => {
  const { fetchImpl } = fakeGrafana();

  await expect(
    createGrafanaReader(
      { ...config, tempo: "Production traces" },
      fetchImpl,
    ).modelCallSpans(window, "sub-1"),
  ).rejects.toThrow(
    "Grafana has no datasource named or identified as Production traces.",
  );
});
