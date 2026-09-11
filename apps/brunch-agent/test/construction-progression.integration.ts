/** Actual built ChatAgent and Chrome; synthetic responses only, never a provider/genuine admission. */
/* eslint-disable no-await-in-loop -- Causal browser progression is intentionally serial. */
import assert from "node:assert/strict";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai";
import {
  createFlueClient,
  FlueExecutionError,
  type DeliveredMessage,
} from "@flue/sdk";
import { chromium } from "@playwright/test";

import {
  observedArcInputSchema,
  verifyMutationAttempt,
  type ArcMutationRecord,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { conversationConstructionMode } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import {
  clientToolHistoryFrom,
  CLIENT_TOOL_RESULT_SIGNAL,
} from "@hashintel/brunch-agent-transport-aisdk";
import {
  generateArcId,
  getArcEndpointKey,
  placeArcEndpoint,
} from "@hashintel/petrinaut-core";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { browserResultFrom, type BrowserResult } from "./browser-result.ts";
import {
  nativeSchemaProvider,
  type NativeRequestCapture,
} from "./native-schema-provider.ts";

const output =
  process.env.M7_CONSTRUCTION_OUTPUT ??
  mkdtempSync(join(tmpdir(), "m7-construction-"));
if (process.env.M7_CONSTRUCTION_OUTPUT) {
  assert(!existsSync(output));
  mkdirSync(output, { recursive: true });
}
const website = resolve(
  process.env.M7_WEBSITE_DIST ?? "../petrinaut-website/dist",
);
const save = (name: string, data: unknown) =>
  writeFileSync(join(output, `${name}.json`), JSON.stringify(data, null, 2));
process.env.NODE_ENV = "test";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(output, "conversation.db");
delete process.env.HASH_OTLP_ENDPOINT;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (input, init) => {
  assert.equal(
    new URL(input instanceof Request ? input.url : String(input)).hostname,
    "127.0.0.1",
  );
  return fetchOriginal(input, init);
};
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", reasoning: true }],
});
const captures: NativeRequestCapture[] = [];
const contexts: Context[] = [];
installFauxProvider(nativeSchemaProvider(faux.provider, captures, contexts));
const app = await loadBuiltBrunchApplication();
const deliveries: { path: string; body: string }[] = [];
const errors: string[] = [];
const server = createServer((incoming, outgoing) => {
  const abort = new AbortController();
  outgoing.on("close", () => abort.abort());
  void (async () => {
    const url = new URL(incoming.url ?? "/", `http://${incoming.headers.host}`);
    let response: Response;
    if (url.pathname.startsWith("/agents/")) {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) {
        const bytes: unknown = chunk;
        assert(bytes instanceof Uint8Array);
        chunks.push(Buffer.from(bytes));
      }
      const body = Buffer.concat(chunks).toString("utf8");
      if (body) deliveries.push({ path: url.pathname, body });
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers))
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(",") : value);
      response = await app.fetch(
        new Request(url, {
          method: incoming.method,
          headers,
          signal: abort.signal,
          ...(body ? { body } : {}),
        }),
      );
    } else if (url.pathname.includes("voice"))
      response = Response.json({ available: false });
    else {
      const file = resolve(
        website,
        `.${url.pathname === "/" ? "/index.html" : url.pathname}`,
      );
      assert(file.startsWith(`${website}/`));
      const mime: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".wasm": "application/wasm",
        ".json": "application/json",
      };
      response = new Response(readFileSync(file), {
        headers: {
          "content-type": mime[extname(file)] ?? "application/octet-stream",
        },
      });
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
      const reader = response.body.getReader();
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          if (!outgoing.write(next.value)) await once(outgoing, "drain");
        }
      } finally {
        await reader.cancel();
      }
    }
    outgoing.end();
  })().catch((error: unknown) => {
    if (!abort.signal.aborted) {
      errors.push(String(error));
      outgoing.writeHead(500).end(String(error));
    }
  });
});
const closeServer = promisify(server.close.bind(server));
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium
  .launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  })
  .catch(async (error: unknown) => {
    await app.stop();
    await closeServer();
    throw error;
  });
const page = await browser
  .newPage({ viewport: { width: 1440, height: 1000 } })
  .catch(async (error: unknown) => {
    await browser.close();
    await app.stop();
    await closeServer();
    throw error;
  });
const blocked: string[] = [];
page.on("pageerror", (error) => errors.push(String(error)));
await page.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === origin) return route.continue();
  blocked.push(route.request().url());
  return route.abort();
});
const tool = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const text = (value: string) => fauxAssistantMessage([fauxText(value)]);
const toolOutput = (
  context: Context,
  name: string,
): Record<string, unknown> => {
  const result = context.messages.findLast(
    (message) => message.role === "toolResult" && message.toolName === name,
  );
  assert(result?.role === "toolResult" && !result.isError);
  return JSON.parse(
    result.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join(""),
  ) as Record<string, unknown>;
};
const browserResult = (context: Context, name: string): BrowserResult =>
  browserResultFrom(
    context.messages.flatMap((message) =>
      typeof message.content === "string"
        ? [message.content]
        : message.content.flatMap((part) =>
            part.type === "text" ? [part.text] : [],
          ),
    ),
    name,
    "No actual model-facing browser result",
  );
let completed = 0;
let basis: Record<string, unknown> | undefined;
let firstCall: Record<string, unknown> | undefined;
let secondCall: Record<string, unknown> | undefined;
const quote =
  "TEST synthetic account: reserve one available resource when the operation starts; timing is unknown.";
const corrected =
  "TEST synthetic correction: the same operation must reserve two available resources; timing remains unknown.";
const settle = (content: string, revisionId: string) => [
  tool(
    "mutate_workpiece",
    { markdown: `# Synthetic workpiece\n\n${content}` },
    revisionId,
  ),
  (context: Context) => {
    const result = toolOutput(context, "mutate_workpiece");
    assert.equal(result.revisionId, revisionId);
    return tool(
      "read_workpiece",
      { locateTexts: [content] },
      `${revisionId}-locate`,
    );
  },
  (context: Context) => {
    const result = toolOutput(context, "read_workpiece");
    const current = result.currentWorkpiece as {
      revisionId: string;
      sha256: string;
    };
    const lookup = result.locatorLookup as {
      subject: { kind: string };
      queries: { occurrences: { start: number; end: number }[] }[];
    };
    assert.equal(lookup.subject.kind, "current-revision");
    const span = lookup.queries[0]?.occurrences[0];
    assert(span);
    basis = {
      kind: "declared",
      revisionId: current.revisionId,
      sha256: current.sha256,
      locators: [span],
      rationale:
        "Synthetic operation-level mechanical basis; not real testimony or useful semantic coverage.",
      scope: "operation",
    };
    completed++;
    return tool("getLatestNetDefinition", {}, `${revisionId}-read`);
  },
];
try {
  await page.goto(`${origin}/?brunchTracer=construction`);
  const skip = page.getByRole("button", { name: "Skip tour" });
  await skip.waitFor();
  await skip.click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  const composer = page.locator("textarea");
  const send = async (body: string, done: string) => {
    await composer.fill(body);
    await composer.press("Enter");
    await page.getByText(done, { exact: true }).waitFor({ timeout: 30_000 });
  };
  assert.equal(
    deliveries.length,
    0,
    "No prepared bootstrap before the first real user send",
  );
  faux.setResponses([
    ...settle(quote, "construction-revision-one"),
    (context) => {
      const result = browserResult(context, "getLatestNetDefinition");
      const observation = result.metadata?.observation;
      assert(observation && basis);
      const definition = observation.observed.definition as {
        places: { id: string; name: string }[];
        transitions: { id: string; name: string }[];
      };
      const place = definition.places.find(
        (entry) => entry.name === "Dispatch crew available",
      );
      const transition = definition.transitions.find(
        (entry) => entry.name === "Start final inspection",
      );
      assert(place && transition);
      firstCall = {
        transitionId: transition.id,
        placeId: place.id,
        arcDirection: "input",
        type: "standard",
        weight: "1",
        brunch: {
          basis,
          observationToolCallId: observation.toolCallId,
          requestedBaseHash: observation.observed.sha256,
        },
      };
      completed++;
      return tool("addArc", firstCall, "construction-add");
    },
    (context) => {
      assert.equal(
        browserResult(context, "addArc").toolCallId,
        "construction-add",
      );
      completed++;
      return text("First observed mutation complete.");
    },
  ]);
  await send(quote, "First observed mutation complete.");
  assert.equal(completed, 3);
  const stored = await page.evaluate(() => {
    const document = (
      JSON.parse(localStorage.getItem("petrinaut-sdcpn") ?? "{}") as Record<
        string,
        { id: string; incarnationId: string; sdcpn: unknown }
      >
    )["synthetic-construction-substrate-v1"];
    const key = Object.keys(localStorage).find((entry) =>
      entry.includes("principal"),
    );
    if (!document || !key) throw new Error("Missing actual host binding");
    const raw = localStorage.getItem(key) ?? "";
    return {
      document,
      principalKey: raw.startsWith('"') ? (JSON.parse(raw) as string) : raw,
    };
  });
  const identity = {
    principalKey: stored.principalKey,
    conversationId: `construction-candidate-v1:${stored.document.incarnationId}`,
  };
  const client = createFlueClient({
    url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
    headers: agentOwnershipHeaders(identity),
  });
  const firstRequest = JSON.parse(deliveries[0]!.body) as DeliveredMessage & {
    initialData: unknown;
  };
  assert.equal(firstRequest.kind, "user");
  assert.deepEqual(firstRequest.initialData, {
    mode: conversationConstructionMode,
    construction: {
      binding: {
        conversationId: identity.conversationId,
        documentId: stored.document.id,
        incarnationId: stored.document.incarnationId,
      },
    },
  });
  faux.setResponses([
    ...settle(corrected, "construction-revision-two"),
    (context) => {
      const result = browserResult(context, "getLatestNetDefinition");
      const observation = result.metadata?.observation;
      assert(observation && basis && firstCall);
      const { type: _type, brunch: _brunch, ...canonical } = firstCall;
      secondCall = {
        ...canonical,
        weight: 2,
        brunch: {
          basis,
          observationToolCallId: observation.toolCallId,
          requestedBaseHash: observation.observed.sha256,
        },
      };
      completed++;
      return tool("updateArcWeight", secondCall, "construction-correct");
    },
    (context) => {
      assert.equal(
        browserResult(context, "updateArcWeight").toolCallId,
        "construction-correct",
      );
      completed++;
      return tool("getLatestNetDefinition", {}, "construction-why-read");
    },
    (context) => {
      const observation = browserResult(context, "getLatestNetDefinition")
        .metadata?.observation;
      assert(observation);
      return tool(
        "query_workpiece",
        {
          transition: "Start final inspection",
          place: "Dispatch crew available",
          arcDirection: "input",
          field: "weight",
          observationToolCallId: observation.toolCallId,
        },
        "construction-why",
      );
    },
    (context) => {
      const answer = toolOutput(context, "query_workpiece");
      save("why", answer);
      assert.equal(answer.disposition, "partially-supported");
      assert.equal(answer.originToolCallId, "construction-add");
      assert.equal(
        (answer.recordedChange as { toolCallId: string }).toolCallId,
        "construction-correct",
      );
      assert.equal(
        (answer.governing as { revisionId: string }).revisionId,
        "construction-revision-two",
      );
      completed++;
      return text(
        "Corrected weight explained from the settled second workpiece; original arc origin remains distinct.",
      );
    },
  ]);
  await send(
    corrected,
    "Corrected weight explained from the settled second workpiece; original arc origin remains distinct.",
  );
  assert.equal(completed, 7);
  const history = await client.history();
  save("history", history);
  const records = clientToolHistoryFrom(history.messages).results.filter(
    (result) =>
      ["construction-add", "construction-correct"].includes(result.toolCallId),
  );
  assert.equal(records.length, 2);
  for (const result of records) {
    const record = (result.metadata as { mutationRecord: ArcMutationRecord })
      .mutationRecord;
    assert.equal(record.outcome, "applied");
    for (const attempt of record.attempts) await verifyMutationAttempt(attempt);
  }
  save("records", records);
  save("raw-calls", { firstCall, secondCall });
  const received = deliveries
    .map(
      (entry) =>
        JSON.parse(entry.body) as DeliveredMessage & { idempotencyKey: string },
    )
    .find(
      (entry) =>
        entry.kind === "signal" &&
        entry.body.includes('"toolCallId":"construction-correct"'),
    );
  assert(received);
  const count = contexts.length;
  const { idempotencyKey, ...message } = received;
  await client.wait(await client.send({ idempotencyKey, message }));
  assert.equal(
    contexts.length,
    count,
    "Duplicate result must not continue or reapply",
  );
  for (const name of ["addArc", "updateArcWeight"] as const) {
    const tools = captures.flatMap((capture) =>
      capture.serialized.tools.filter((entry) => entry.name === name),
    );
    assert(tools.length > 0, `Native ${name} tool not captured`);
    for (const entry of tools)
      assert.deepEqual(
        entry.input_schema,
        observedArcInputSchema(name).toJSONSchema({ io: "input" }),
      );
  }
  assert(secondCall && basis);
  const beforeMixed = contexts.length;
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall("updateArcWeight", secondCall, { id: "mixed-weight" }),
        fauxToolCall(
          "mutate_workpiece",
          { markdown: "TEST forbidden sibling settlement" },
          { id: "mixed-revision" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    text("UNSAFE mixed weight/revision continuation"),
  ]);
  let mixedRejected = false;
  try {
    await client.wait(
      await client.send({
        message: {
          kind: "user",
          body: "TEST reject native weight plus server revision before either publishes.",
        },
      }),
    );
  } catch {
    mixedRejected = true;
  }
  const mixedHistory = await client.history();
  save("mixed-weight-revision-history", mixedHistory);
  save("mixed-weight-revision-verdict", {
    mixedRejected,
    calls: contexts.length - beforeMixed,
  });
  assert(
    mixedRejected,
    "Mixed weight/revision proposal must reject at actual built registration",
  );
  assert.equal(
    contexts.length,
    beforeMixed + 1,
    "No mixed proposal continuation",
  );
  assert(
    !mixedHistory.messages
      .flatMap((entry) => entry.parts)
      .some(
        (part) =>
          part.type === "dynamic-tool" &&
          ["mixed-weight", "mixed-revision"].includes(part.toolCallId),
      ),
    "No sibling tool may publish before rejection",
  );
  // Existing properties UI creates the unrecorded edit. The preceding read is model-obtainable.
  const selection = new URL(page.url());
  selection.searchParams.set("itemType", "arc");
  selection.searchParams.set(
    "itemId",
    generateArcId({
      inputId: getArcEndpointKey(placeArcEndpoint("dispatch-crew-available")),
      outputId: "start-final-inspection",
    }),
  );
  await page.goto(selection.href);
  const show = page.getByRole("button", {
    name: "Show AI assistant",
    exact: true,
  });
  await show.waitFor();
  await show.click();
  let staleCall: Record<string, unknown> | undefined;
  faux.setResponses([
    tool("getLatestNetDefinition", {}, "before-hand-edit"),
    (context) => {
      const observation = browserResult(context, "getLatestNetDefinition")
        .metadata?.observation;
      assert(observation && secondCall);
      staleCall = {
        ...secondCall,
        weight: 4,
        brunch: {
          basis,
          observationToolCallId: observation.toolCallId,
          requestedBaseHash: observation.observed.sha256,
        },
      };
      return text("Read before the deliberate external edit.");
    },
  ]);
  await send(
    "TEST obtain a read before the hand-edit control.",
    "Read before the deliberate external edit.",
  );
  assert(staleCall);
  const weight = page.getByRole("spinbutton");
  await weight.fill("3");
  await weight.press("Tab");
  await page.getByText(/Live document hash differs/).waitFor();
  faux.setResponses([
    tool("updateArcWeight", staleCall, "construction-stale"),
    (context) => {
      const result = browserResult(context, "updateArcWeight");
      assert.equal(result.toolCallId, "construction-stale");
      assert.equal((result.output as { applied: boolean }).applied, false);
      completed++;
      return text("Stale hand-edit base refused without applying.");
    },
  ]);
  await send(
    "TEST attempt the old raw base after the external edit.",
    "Stale hand-edit base refused without applying.",
  );
  assert.equal(await weight.inputValue(), "3");
  const staleRow = page.getByRole("button", {
    name: /Not applied.*requested base/u,
  });
  await staleRow.waitFor();
  assert.equal(await staleRow.getAttribute("data-tone"), "neutral");
  assert.equal(
    await staleRow.locator('[data-tool-result-icon="not-applied"]').count(),
    1,
  );
  assert.equal(
    await staleRow.locator('[data-tool-result-icon="complete"]').count(),
    0,
  );
  assert(
    !((await staleRow.textContent()) ?? "").includes("Updated arc weight"),
  );
  await page.screenshot({
    path: join(output, "stale-not-applied.png"),
    fullPage: true,
  });
  const staleHistory = await client.history();
  save("stale-history", staleHistory);
  const stale = clientToolHistoryFrom(staleHistory.messages).results.find(
    (entry) => entry.toolCallId === "construction-stale",
  );
  assert(stale);
  const staleRecord = (stale.metadata as { mutationRecord: ArcMutationRecord })
    .mutationRecord;
  assert.equal(staleRecord.outcome, "stale");
  for (const attempt of staleRecord.attempts)
    await verifyMutationAttempt(attempt);
  faux.setResponses([
    tool("getLatestNetDefinition", {}, "hand-edit-why-read"),
    (context) => {
      const observation = browserResult(context, "getLatestNetDefinition")
        .metadata?.observation;
      assert(observation);
      return tool(
        "query_workpiece",
        {
          transition: "Start final inspection",
          place: "Dispatch crew available",
          arcDirection: "input",
          field: "weight",
          observationToolCallId: observation.toolCallId,
        },
        "hand-edit-why",
      );
    },
    (context) => {
      const answer = toolOutput(context, "query_workpiece");
      save("hand-edit-why", answer);
      assert.equal(answer.disposition, "refused");
      assert.match(String(answer.reason), /Unrecorded/u);
      completed++;
      return text(
        "Unrecorded hand edit is not attributable to this conversation.",
      );
    },
  ]);
  await send(
    "TEST ask why after the hand edit and refused stale attempt.",
    "Unrecorded hand edit is not attributable to this conversation.",
  );
  // Unknown observation cannot reach a browser; no guessed/sibling base.
  faux.setResponses([
    tool(
      "updateArcWeight",
      {
        ...staleCall,
        brunch: {
          ...(staleCall.brunch as Record<string, unknown>),
          observationToolCallId: "unknown-read",
        },
      },
      "construction-unknown-read",
    ),
    text("Unknown read refused before browser execution."),
  ]);
  await send(
    "TEST cite an unknown observation.",
    "Unknown read refused before browser execution.",
  );
  assert(
    !clientToolHistoryFrom((await client.history()).messages).results.some(
      (entry) => entry.toolCallId === "construction-unknown-read",
    ),
  );
  // Full proposal refusal at the existing admission boundary, not partial browser execution.
  const beforeBatch = contexts.length;
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall("getLatestNetDefinition", {}, { id: "batch-one" }),
        fauxToolCall("updateArcWeight", staleCall, { id: "batch-two" }),
      ],
      { stopReason: "toolUse" },
    ),
  ]);
  await assert.rejects(
    async () =>
      client.wait(
        await client.send({
          message: { kind: "user", body: "TEST reject two browser calls." },
        }),
      ),
    /browser/iu,
  );
  assert.equal(contexts.length, beforeBatch + 1);
  assert(
    !clientToolHistoryFrom((await client.history()).messages).results.some(
      (entry) => entry.toolCallId.startsWith("batch-"),
    ),
  );
  const original = records[1];
  assert(original);
  const originalRecord = (
    original.metadata as { mutationRecord: ArcMutationRecord }
  ).mutationRecord;
  const foreign = structuredClone(originalRecord);
  for (const attempt of foreign.attempts) {
    attempt.binding.incarnationId = "foreign-incarnation";
    attempt.request.binding.incarnationId = "foreign-incarnation";
  }
  const beforeForeign = contexts.length;
  await assert.rejects(
    async () =>
      client.wait(
        await client.send({
          message: {
            kind: "signal",
            type: CLIENT_TOOL_RESULT_SIGNAL,
            tagName: CLIENT_TOOL_RESULT_SIGNAL,
            body: JSON.stringify([
              { ...original, metadata: { mutationRecord: foreign } },
            ]),
          },
        }),
      ),
    (error: unknown) =>
      error instanceof FlueExecutionError && error.failure === "failed",
  );
  assert.equal(contexts.length, beforeForeign);
  const conflicting = structuredClone(originalRecord);
  conflicting.outcome = "unknown";
  conflicting.attempts[0]!.outcome = "unknown";
  const beforeConflict = contexts.length;
  await assert.rejects(
    async () =>
      client.wait(
        await client.send({
          message: {
            kind: "signal",
            type: CLIENT_TOOL_RESULT_SIGNAL,
            tagName: CLIENT_TOOL_RESULT_SIGNAL,
            body: JSON.stringify([
              { ...original, metadata: { mutationRecord: conflicting } },
            ]),
          },
        }),
      ),
    (error: unknown) =>
      error instanceof FlueExecutionError && error.failure === "failed",
  );
  assert.equal(contexts.length, beforeConflict);
  assert.equal(completed, 9);
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  await page.screenshot({ path: join(output, "browser.png"), fullPage: true });
  save("observations", {
    completed,
    syntheticRequests: contexts.length,
    actualBrowserRecords: records.length,
    errors,
    blocked,
    paidCalls: 0,
    claim:
      "Synthetic local progression only; not full root coverage, provider or genuine admission",
  });
} finally {
  save("deliveries", deliveries);
  save("errors", errors);
  writeFileSync(
    join(output, "contexts.json.gz"),
    gzipSync(JSON.stringify(contexts)),
  );
  writeFileSync(
    join(output, "native-captures.json.gz"),
    gzipSync(JSON.stringify(captures)),
  );
  await browser.close();
  await app.stop();
  await closeServer();
}
