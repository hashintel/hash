/** Actual local browser, synthetic provider, existing built website and ChatAgent mount. No external requests. */
/* eslint-disable no-await-in-loop -- Sequential UI actions and streamed responses are the boundary under test. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai";
import { createFlueClient, type DeliveredMessage } from "@flue/sdk";
import { chromium, type Browser, type Page } from "@playwright/test";

import {
  verifyArcTransitionAttempt,
  joinedRootArcInputSchema,
  type ArcTransitionRecord,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  clientToolHistoryFrom,
  snapshotToUiMessages,
} from "@hashintel/brunch-agent-transport-aisdk";
import { latestRunbookIrBlock } from "@hashintel/brunch-agent/workpiece";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import {
  nativeSchemaProvider,
  type NativeRequestCapture,
} from "./native-schema-provider.ts";

// Keep these in lockstep with apps/petrinaut-website prepared-crew-reservation-fixture.
// Brunch-agent lint cannot typecheck a relative import into that app.
const crewReservationFixtureId = "crew-reservation-v1";
const crewReservationFixtureQuery = "brunch-fixture";
const dispatchCrewPlaceId = "dispatch-crew-available";
const startFinalInspectionTransitionId = "start-final-inspection";
const preparedCrewReservationWorkpiece = [
  "Fixture authorship: test-authored preparation for Mission 6.",
  "Non-claims: not a Mission 4 candidate, not model-produced evidence, not capture-backed provenance, and not proof of automatic full-net projection.",
  "",
  "```runbook-ir",
  "# Final inspection and dispatch workpiece",
  "",
  "## Purpose and posture",
  "Maintain the narrow batch path from final inspection to dispatch readiness and test one evidence-backed decision against the live Petrinaut document.",
  "",
  "## Operational account",
  "- A batch that is ready enters final inspection.",
  "- The prepared topology returns the sole dispatch crew at sign-off.",
  "- Whether final inspection reserves that crew is an unconfirmed hypothesis; changing the workpiece or net requires explicit true-user confirmation.",
  "",
  "## Quantity and resource policy",
  "Exactly one dispatch crew is available in this fixture. Revision zero does not establish whether starting final inspection consumes it; the prepared topology currently returns it at sign-off.",
  "",
  "## Current Petrinaut correspondence",
  "The prepared non-empty net contains the batch path and the crew return from sign-off. The standard weight-1 input arc from `Dispatch crew available` to `Start final inspection` is absent while the reservation policy remains unconfirmed.",
  "",
  "## Explicit unknowns",
  "Crew reservation awaits true-user confirmation. Inspection and sign-off timing, failure modes, and recovery behavior remain unresolved.",
  "",
  "## Claim boundary",
  "This prepared revision is test-authored diagnostic material. It is not model-produced evidence and does not establish capture provenance, behavioral execution, or broad projection quality.",
  "```",
].join("\n");

type BrowserStoredDocument = {
  id: string;
  incarnationId?: string;
  rootArcRequestedBaseHash?: string;
  sdcpn?: unknown;
};

const readBrowserDocument = (id: string) => {
  const store = JSON.parse(
    localStorage.getItem("petrinaut-sdcpn") ?? "{}",
  ) as Record<string, BrowserStoredDocument>;
  return store[id]?.sdcpn;
};

const outputDirectory =
  process.env.M7_BROWSER_OUTPUT ?? mkdtempSync(join(tmpdir(), "m7-browser-"));
if (process.env.M7_BROWSER_OUTPUT !== undefined && existsSync(outputDirectory))
  throw new Error(
    "Use a fresh browser evidence directory; retained witnesses must not be overwritten.",
  );
mkdirSync(outputDirectory, { recursive: true });
const websiteDirectory = resolve(
  process.env.M7_WEBSITE_DIST ?? "../petrinaut-website/dist",
);
const save = (name: string, data: unknown) =>
  writeFileSync(
    join(outputDirectory, name),
    `${JSON.stringify(data, null, 2)}\n`,
  );
process.env.NODE_ENV = "test";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(outputDirectory, "conversation.db");
delete process.env.HASH_OTLP_ENDPOINT;
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  if (url.hostname !== "127.0.0.1")
    throw new Error(`External fetch forbidden: ${url.origin}`);
  return nativeFetch(input, init);
};
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", reasoning: true }],
});
const contexts: Context[] = [];
const nativeCaptures: NativeRequestCapture[] = [];
installFauxProvider(
  nativeSchemaProvider(faux.provider, nativeCaptures, contexts),
);
faux.setResponses([
  fauxAssistantMessage([fauxText("Prepared mechanical fixture acknowledged.")]),
]);
const application = await loadBuiltBrunchApplication();
const httpErrors: string[] = [];
const deliveries: { path: string; body: string }[] = [];
const handleRequest = async (
  incoming: IncomingMessage,
  outgoing: ServerResponse,
) => {
  const abort = new AbortController();
  outgoing.on("close", () => abort.abort());
  try {
    const url = new URL(incoming.url ?? "/", `http://${incoming.headers.host}`);
    let response: Response;
    if (url.pathname.startsWith("/agents/")) {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) {
        const bytes: unknown = chunk;
        if (!(bytes instanceof Uint8Array))
          throw new Error("Expected HTTP request bytes.");
        chunks.push(Buffer.from(bytes));
      }
      const body = Buffer.concat(chunks).toString("utf8");
      if (body) deliveries.push({ path: url.pathname, body });
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers))
        if (value !== undefined)
          headers.set(key, Array.isArray(value) ? value.join(",") : value);
      response = await application.fetch(
        new Request(url, {
          method: incoming.method,
          headers,
          signal: abort.signal,
          ...(body ? { body } : {}),
        }),
      );
    } else if (url.pathname.includes("voice")) {
      response = Response.json({ available: false });
    } else {
      const path = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = resolve(websiteDirectory, `.${path}`);
      assert(file.startsWith(`${websiteDirectory}/`));
      const contentType =
        (
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
            ".wasm": "application/wasm",
            ".json": "application/json",
          } as Record<string, string>
        )[extname(file)] ?? "application/octet-stream";
      response = new Response(readFileSync(file), {
        headers: { "content-type": contentType },
      });
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (!abort.signal.aborted) {
          const next = await reader.read();
          if (next.done) break;
          if (!outgoing.write(next.value)) await once(outgoing, "drain");
        }
      } finally {
        await reader.cancel();
      }
    }
    outgoing.end();
  } catch (error) {
    if (!abort.signal.aborted) {
      httpErrors.push(String(error));
      outgoing.writeHead(500).end(String(error));
    }
  }
};
const server = createServer((incoming, outgoing) => {
  void handleRequest(incoming, outgoing);
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
let browser: Browser | undefined;
let page: Page | undefined;
const blocked: string[] = [];
const browserErrors: string[] = [];
try {
  browser = await chromium.launch({
    executablePath:
      process.env.M7_CHROME_PATH ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === origin)
      return route.continue();
    blocked.push(route.request().url());
    return route.abort();
  });
  page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  await page.goto(origin);
  const welcomeTour = page.getByRole("button", { name: "Skip tour" });
  await welcomeTour.waitFor();
  await welcomeTour.click();
  const tracerLink = page.getByRole("link", {
    name: "Open the prepared root-arc mechanical tracer",
  });
  await tracerLink.waitFor();
  assert.equal(
    await tracerLink.getAttribute("href"),
    `?${crewReservationFixtureQuery}=${crewReservationFixtureId}&brunchTracer=root-arc`,
  );
  await page.screenshot({
    path: join(outputDirectory, "selector.png"),
    fullPage: true,
  });
  await tracerLink.click();
  await page
    .getByText("Bound conversation ready. Settle the workpiece before the arc.")
    .waitFor({ timeout: 30_000 });
  const storage = await page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage).map((key) => [
        key,
        localStorage.getItem(key) ?? "",
      ]),
    ),
  );
  save("initial-storage.json", storage);
  const documents = JSON.parse(storage["petrinaut-sdcpn"] ?? "{}") as Record<
    string,
    BrowserStoredDocument
  >;
  const document = Object.values(documents).find((entry) =>
    entry.id.endsWith(":root-arc"),
  );
  assert(document?.incarnationId && document.rootArcRequestedBaseHash);
  const conversationId = `prepared-root-arc:${document.incarnationId}`;
  const preparedRequest = deliveries
    .map((entry) => JSON.parse(entry.body) as Record<string, unknown>)
    .find((entry) => "initialData" in entry);
  save("preparation-request.json", preparedRequest);
  const principalEntry = Object.entries(storage).find(([key]) =>
    key.includes("principal"),
  );
  assert(principalEntry, "The real route must retain a principal");
  const principalKey = principalEntry[1].startsWith('"')
    ? (JSON.parse(principalEntry[1]) as string)
    : principalEntry[1];
  const identity = { conversationId, principalKey };
  const client = createFlueClient({
    url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
    headers: agentOwnershipHeaders(identity),
  });
  const markdown = latestRunbookIrBlock(preparedCrewReservationWorkpiece);
  assert(markdown);
  const hash = createHash("sha256").update(markdown).digest("hex");
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall(
          "update_workpiece",
          { markdown },
          { id: "m7-browser-revision" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([
      fauxText("Prepared workpiece settled for the mechanical tracer."),
    ]),
  ]);
  save(
    "dom-before-chat.json",
    await page.locator("button").evaluateAll((buttons) =>
      buttons.map((button) => ({
        text: button.textContent,
        title: button.getAttribute("title"),
        label: button.getAttribute("aria-label"),
      })),
    ),
  );
  // Existing editor entrypoint, not a fabricated panel or direct browser mutation.
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.isVisible()) await skipTour.click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  const composer = page.locator("textarea");
  await composer.fill(
    "Settle the labelled prepared workpiece for this unpaid mechanical tracer; it is not elicited testimony.",
  );
  await composer.press("Enter");
  await page
    .getByText("Prepared workpiece settled for the mechanical tracer.", {
      exact: true,
    })
    .waitFor({ timeout: 30_000 });
  const pre = await page.evaluate(readBrowserDocument, document.id);
  save("canonical-pre.browser.json", pre);
  const arc = {
    transitionId: startFinalInspectionTransitionId,
    placeId: dispatchCrewPlaceId,
    arcDirection: "input",
    weight: "1",
    type: "standard",
    brunch: {
      requestedBaseHash: document.rootArcRequestedBaseHash,
      basis: {
        kind: "declared",
        revisionId: "m7-browser-revision",
        sha256: hash,
        locators: [{ start: 0, end: markdown.length }],
        rationale:
          "Labelled prepared mechanics only; no elicited testimony or useful-basis claim.",
        scope: "operation",
      },
    },
  };
  // Native refusal must precede browser publication; generic coercion would turn true into 1.
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall(
          "addArc",
          { ...arc, weight: true },
          { id: "m7-browser-boolean-weight" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([
      fauxText(
        "Boolean weight refused by native validation; no browser mutation was authorized.",
      ),
    ]),
  ]);
  await composer.fill(
    "Negative control: attempt a boolean weight, not a numeric string.",
  );
  await composer.press("Enter");
  await page
    .getByText(
      "Boolean weight refused by native validation; no browser mutation was authorized.",
      { exact: true },
    )
    .waitFor({ timeout: 30_000 });
  assert.deepEqual(await page.evaluate(readBrowserDocument, document.id), pre);
  const booleanHistory = await client.history();
  save("boolean-refusal-history.json", booleanHistory);
  assert(
    !clientToolHistoryFrom(booleanHistory.messages).results.some(
      (entry) => entry.toolCallId === "m7-browser-boolean-weight",
    ),
  );
  assert(
    booleanHistory.messages.some((entry) =>
      entry.parts.some(
        (part) =>
          part.type === "dynamic-tool" &&
          part.toolCallId === "m7-browser-boolean-weight" &&
          part.state === "output-error",
      ),
    ),
  );
  await page.screenshot({
    path: join(outputDirectory, "boolean-refusal.png"),
    fullPage: true,
  });
  const invalidArc = {
    ...arc,
    brunch: {
      ...arc.brunch,
      basis: { ...arc.brunch.basis, revisionId: "unknown-revision" },
    },
  };
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall("addArc", invalidArc, {
          id: "m7-browser-unknown-revision",
        }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([
      fauxText(
        "Unknown settled revision refused; no browser mutation was authorized.",
      ),
    ]),
  ]);
  await composer.fill(
    "Negative control: attempt the same prepared arc with an unknown revision citation.",
  );
  await composer.press("Enter");
  await page
    .getByText(
      "Unknown settled revision refused; no browser mutation was authorized.",
      { exact: true },
    )
    .waitFor({ timeout: 30_000 });
  assert.deepEqual(await page.evaluate(readBrowserDocument, document.id), pre);
  const refusedHistory = await client.history();
  save("refused-history.json", refusedHistory);
  assert(
    !clientToolHistoryFrom(refusedHistory.messages).results.some(
      (entry) => entry.toolCallId === "m7-browser-unknown-revision",
    ),
  );
  assert(
    refusedHistory.messages.some((entry) =>
      entry.parts.some(
        (part) =>
          part.type === "dynamic-tool" &&
          part.toolCallId === "m7-browser-unknown-revision" &&
          part.state === "output-error",
      ),
    ),
  );
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("getLatestNetDefinition", {}, { id: "m7-browser-read" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [fauxToolCall("addArc", arc, { id: "m7-browser-arc" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([
      fauxText(
        "Verified browser result received. The prepared arc will not be applied again.",
      ),
    ]),
  ]);
  const beforeArcRequests = contexts.length;
  await composer.fill(
    "Apply the one prepared root arc using the settled citation and issued browser base.",
  );
  await composer.press("Enter");
  await page
    .getByText(
      "Verified browser result received. The prepared arc will not be applied again.",
      { exact: true },
    )
    .waitFor({ timeout: 30_000 });
  assert.equal(
    contexts.length - beforeArcRequests,
    3,
    "one live read, one mutation continuation, and one correlated result continuation",
  );
  const snapshot = await client.history();
  save("history.json", snapshot);
  const issuedArc = snapshot.messages
    .flatMap((message) => message.parts)
    .find(
      (part) =>
        part.type === "dynamic-tool" && part.toolCallId === "m7-browser-arc",
    );
  assert(issuedArc?.type === "dynamic-tool");
  assert.deepEqual(
    issuedArc.input,
    arc,
    "Canonical history retains numeric-string input and immutable basis",
  );
  const projected = clientToolHistoryFrom(snapshot.messages);
  const liveRead = projected.results.find(
    (entry) => entry.toolCallId === "m7-browser-read",
  );
  assert(
    liveRead &&
      typeof liveRead.output === "object" &&
      liveRead.output !== null &&
      "definition" in liveRead.output,
  );
  assert.deepEqual(liveRead.output.definition, pre);
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(liveRead.output.definition))
      .digest("hex"),
    document.rootArcRequestedBaseHash,
  );
  const clientSteps = snapshot.messages
    .filter((entry) => entry.signal?.tagName === "client-tool-result")
    .map(
      (entry) =>
        JSON.parse(
          entry.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join(""),
        ) as { toolCallId: string }[],
    );
  assert.deepEqual(
    clientSteps.map((step) => step.map((result) => result.toolCallId)),
    [["m7-browser-read"], ["m7-browser-arc"]],
  );
  const result = projected.results.find(
    (entry) => entry.toolCallId === "m7-browser-arc",
  );
  assert(result);
  const record = (result.metadata as { transitionRecord: ArcTransitionRecord })
    .transitionRecord;
  assert.equal(record.outcome, "applied");
  assert.equal(record.attempts.length, 1);
  const attempt = await verifyArcTransitionAttempt(record.attempts[0]!);
  assert.equal(attempt.request.input.weight, 1);
  assert(
    !("brunch" in attempt.request.input),
    "Brunch basis is stripped only at canonical execution",
  );
  assert.equal(attempt.request.binding.conversationId, conversationId);
  assert.equal(attempt.request.binding.incarnationId, document.incarnationId);
  assert.equal(
    attempt.request.requestedBaseHash,
    document.rootArcRequestedBaseHash,
  );
  assert.deepEqual(attempt.pre.definition, pre);
  const post = await page.evaluate(readBrowserDocument, document.id);
  assert.deepEqual(attempt.post?.definition, post);
  save("canonical-post.browser.json", post);
  save("transition-records.json", record);
  const resultRequest = deliveries.find(
    (entry) =>
      entry.body.includes("client-tool-result") &&
      entry.body.includes("m7-browser-arc"),
  );
  assert(resultRequest);
  const { idempotencyKey, ...message } = JSON.parse(
    resultRequest.body,
  ) as DeliveredMessage & { idempotencyKey: string };
  const beforeDuplicate = contexts.length;
  await client.wait(await client.send({ idempotencyKey, message }));
  assert.equal(
    contexts.length,
    beforeDuplicate,
    "duplicate delivery must not continue again",
  );
  await page.reload();
  await page
    .getByText("Bound conversation ready. Settle the workpiece before the arc.")
    .waitFor({ timeout: 30_000 });
  assert.deepEqual(await page.evaluate(readBrowserDocument, document.id), post);
  const reopened = snapshotToUiMessages(await client.history(), {
    clientToolNames: new Set(["addArc"]),
    validatedClientToolNames: new Set(["addArc"]),
  });
  assert(
    !reopened.some((message) =>
      message.parts.some(
        (part) =>
          part.type === "tool-addArc" && part.state === "input-available",
      ),
    ),
  );
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  await page
    .getByText(
      "Verified browser result received. The prepared arc will not be applied again.",
      { exact: true },
    )
    .waitFor();
  await page
    .getByText(
      "Verified browser result received. The prepared arc will not be applied again.",
      { exact: true },
    )
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(outputDirectory, "browser.png"),
    fullPage: true,
  });
  // A distinct, valid but contradictory delivery is retained as a refused attempt, never success.
  const conflicting = structuredClone(record);
  conflicting.attempts.push({
    ...structuredClone(attempt),
    post: structuredClone(attempt.pre),
    outcome: "no-op",
    effects: { created: [], updated: [], deleted: [], derived: [] },
  });
  conflicting.outcome = "unknown";
  const conflictingResult = {
    ...result,
    metadata: { transitionRecord: conflicting },
  };
  await assert.rejects(
    client.wait(
      await client.send({
        idempotencyKey: "m7-conflicting-delivery",
        message: {
          kind: "signal",
          type: "client-tool-result",
          tagName: "client-tool-result",
          body: JSON.stringify([conflictingResult]),
        },
      }),
    ),
  );
  assert.equal(
    contexts.length,
    beforeDuplicate,
    "conflicting results must not continue the model",
  );
  const conflictingHistory = await client.history();
  save("conflicting-history.json", conflictingHistory);
  const conflictingProjection = snapshotToUiMessages(conflictingHistory, {
    clientToolNames: new Set(["addArc"]),
  });
  assert(
    conflictingProjection.some((entry) =>
      entry.parts.some(
        (part) =>
          part.type === "tool-addArc" &&
          part.toolCallId === "m7-browser-arc" &&
          part.state === "output-error",
      ),
    ),
  );
  assert.deepEqual(await page.evaluate(readBrowserDocument, document.id), post);
  assert(nativeCaptures.length > 0);
  const nativeArcs = nativeCaptures.flatMap((capture) =>
    capture.serialized.tools.filter((tool) => tool.name === "addArc"),
  );
  assert(nativeArcs.length > 0);
  for (const tool of nativeArcs)
    assert.deepEqual(
      tool.input_schema,
      joinedRootArcInputSchema["~standard"].jsonSchema.input({
        target: "draft-2020-12",
      }),
    );
  save("observations.json", {
    oracle:
      "correlates the real browser transition record and resumes without reapplying",
    outcome: "pass",
    source: "real local Chrome; synthetic model; prepared fixture",
    syntheticModelRequests: contexts.length,
    syntheticNativeSdkRequests: nativeCaptures.length,
    booleanWeightBrowserResults: 0,
    nativeRootSchemaPreservedWithoutStrict: true,
    actualProviderCalls: 0,
    providerCost: 0,
    unknownCitationBrowserResults: 0,
    conflictingContinuationCalls: 0,
    duplicateContinuationCalls: contexts.length - beforeDuplicate,
    browserErrors,
    httpErrors,
    blocked,
  });
  process.stdout.write(`Browser tracer passed: ${outputDirectory}\n`);
} catch (error) {
  save("failure.json", {
    error: String(error),
    browserErrors,
    httpErrors,
    blocked,
    url: page?.url(),
  });
  if (page) {
    save(
      "dom-failure.json",
      await page
        .locator("body")
        .innerText()
        .catch(() => "unavailable"),
    );
    await page
      .screenshot({
        path: join(outputDirectory, "failure.png"),
        fullPage: true,
      })
      .catch(() => {});
  }
  throw error;
} finally {
  writeFileSync(
    join(outputDirectory, "requests.json.gz"),
    gzipSync(`${JSON.stringify(contexts, null, 2)}\n`),
  );
  writeFileSync(
    join(outputDirectory, "native-sdk-requests.json.gz"),
    gzipSync(`${JSON.stringify(nativeCaptures, null, 2)}\n`),
  );
  save("http-deliveries.json", deliveries);
  await browser?.close();
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await application.stop();
  globalThis.fetch = nativeFetch;
}
