import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { afterEach, expect, test, vi } from "vitest";

import {
  checkPersonaConfiguration,
  registerPersonaAccounting,
  type PersonaAccountingApi,
  type PersonaAccountingContext,
} from "../src/evaluations/persona/request-accounting.ts";

import type { Provider } from "@earendil-works/pi-ai";

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true });
});
const setup = () => {
  const directory = mkdtempSync(join(tmpdir(), "TEST-persona-accounting-"));
  directories.push(directory);
  vi.stubEnv("PI_CODING_AGENT_DIR", directory);
  vi.stubEnv("PI_OFFLINE", "1");
  vi.stubEnv("ANTHROPIC_API_KEY", "TEST-accounting-key");
  for (const name of [
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_OAUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "DEBUG",
  ])
    vi.stubEnv(name, "");
  writeFileSync(
    join(directory, "settings.json"),
    JSON.stringify({ retry: { enabled: false, provider: { maxRetries: 0 } } }),
  );
  const ledgerPath = join(directory, "usage-ledger.json");
  writeFileSync(
    ledgerPath,
    JSON.stringify({
      limits: { calls: 200, usd: 100 },
      reservation: {
        runId: "TEST-persona",
        status: "active",
        calls: 4,
        usd: 28,
        perCall: { maxOutputTokens: 16, reservedUsd: 7 },
      },
      totals: {
        spentCalls: 0,
        spentUsd: 0,
        remainingCalls: 200,
        remainingUsd: 100,
        outstandingReservedCalls: 0,
        outstandingReservedUsd: 0,
      },
      calls: [],
    }),
  );
  writeFileSync(join(directory, "attempt-ledger.md"), "# TEST only\n");
  vi.stubEnv(
    "BRUNCH_STEP_A_ACCOUNTING",
    JSON.stringify({ ledgerPath, runId: "TEST-persona" }),
  );
  let provider: Provider | undefined;
  let start:
    | ((event: unknown, context: PersonaAccountingContext) => Promise<void>)
    | undefined;
  const pi: PersonaAccountingApi = {
    registerProvider: (registered) => {
      provider = registered;
    },
    on: (_event, handler) => {
      start = handler;
    },
  };
  registerPersonaAccounting(pi);
  if (!provider || !start) throw new Error("TEST missing registration");
  const models = createModels();
  models.setProvider(provider);
  const model = provider
    .getModels()
    .find((entry) => entry.id === "claude-sonnet-4-6")!;
  const context: PersonaAccountingContext = {
    model,
    sessionManager: { getSessionId: () => "TEST-actual-pi-session" },
    modelRegistry: { getProviderAuth: (id) => models.getAuth(id) },
  };
  return { directory, ledgerPath, provider, model, context, start };
};

test("registered native provider accounts separate requests with real Pi identity and unchanged native auth", async () => {
  const fixture = setup();
  const native = anthropicProvider();
  expect(fixture.provider.id).toBe(native.id);
  expect(fixture.provider.getModels()).toEqual(native.getModels());
  await fixture.start(undefined, fixture.context);
  let dispatches = 0;
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    dispatches++;
    if (typeof init?.body !== "string")
      throw new Error("TEST expected serialized payload");
    const payload: unknown = JSON.parse(init.body);
    expect(payload).toMatchObject({
      model: "claude-sonnet-4-6",
      max_tokens: 16,
    });
    const frames = [
      {
        type: "message_start",
        message: {
          id: `msg_TEST_${dispatches}`,
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [],
          usage: {
            input_tokens: 100,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      },
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 10 },
      },
      { type: "message_stop" },
    ];
    return new Response(
      frames
        .map(
          (frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`,
        )
        .join(""),
      { headers: { "content-type": "text/event-stream" } },
    );
  };
  // Both public stream paths and different routing session IDs (as used by
  // summaries) retain Pi identity, with one unique accounting request per call.
  for (const method of ["streamSimple", "streamSimple", "stream"] as const) {
    // eslint-disable-next-line no-await-in-loop -- Participants must settle before the next request is reserved.
    const response = await fixture.provider[method](
      fixture.model,
      { messages: [{ role: "user", content: "TEST synthetic", timestamp: 0 }] },
      {
        apiKey: "TEST-accounting-key",
        fetch,
        sessionId: `TEST-routing-${dispatches}`,
      },
    ).result();
    expect(response.stopReason).toBe("stop");
  }
  const ledger = JSON.parse(readFileSync(fixture.ledgerPath, "utf8")) as {
    calls: {
      identity: { kind: string; sessionId: string; requestId: string };
      status: string;
    }[];
    totals: { spentCalls: number };
  };
  expect(dispatches).toBe(3);
  expect(ledger.totals.spentCalls).toBe(3);
  expect(ledger.calls.every((call) => call.status === "complete")).toBe(true);
  expect(
    new Set(ledger.calls.map((call) => call.identity.requestId)).size,
  ).toBe(3);
  for (const call of ledger.calls)
    expect(call.identity).toEqual({
      kind: "pi",
      sessionId: "TEST-actual-pi-session",
      requestId: call.identity.requestId,
    });
});

test("wrong resolved key, uninitialized session and wrong model refuse before dispatch or ledger mutation", async () => {
  const fixture = setup();
  const options = {
    apiKey: "TEST-accounting-key",
    fetch: vi.fn<typeof globalThis.fetch>(),
  };
  expect(() =>
    fixture.provider.streamSimple(fixture.model, { messages: [] }, options),
  ).toThrow(/configuration refused/);
  await fixture.start(undefined, fixture.context);
  expect(() =>
    fixture.provider.streamSimple(
      fixture.model,
      { messages: [] },
      { ...options, apiKey: "TEST-other-key" },
    ),
  ).toThrow(/configuration refused/);
  expect(() =>
    fixture.provider.streamSimple(
      { ...fixture.model, id: "claude-haiku" },
      { messages: [] },
      options,
    ),
  ).toThrow(/configuration refused/);
  expect(options.fetch).not.toHaveBeenCalled();
  const ledger: unknown = JSON.parse(readFileSync(fixture.ledgerPath, "utf8"));
  expect(ledger).toMatchObject({ calls: [] });
});

for (const file of ["auth.json", "models.json"]) {
  test(`${file} cannot introduce another credential or model source`, () => {
    const fixture = setup();
    writeFileSync(
      join(fixture.directory, file),
      JSON.stringify({ anthropic: { type: "oauth" } }),
    );
    expect(() => checkPersonaConfiguration()).toThrow(/configuration refused/);
  });
}

test("invalid accounting config leaves a refusing provider, not an unmetered fallback", () => {
  const fixture = setup();
  vi.stubEnv("BRUNCH_STEP_A_ACCOUNTING", "TEST-invalid");
  let blocked: Provider | undefined;
  registerPersonaAccounting({
    registerProvider: (provider) => {
      blocked = provider;
    },
    on: () => {},
  });
  expect(() => blocked?.streamSimple(fixture.model, { messages: [] })).toThrow(
    /configuration refused/,
  );
});
