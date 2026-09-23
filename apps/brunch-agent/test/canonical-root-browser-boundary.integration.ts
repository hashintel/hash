/** Root canonical mutation across the built I-mode browser, transport, and server. */
/* eslint-disable no-await-in-loop -- One faux-provider conversation; each sequential browser probe must settle before replacing responses. */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import { parseClientToolResultMetadata } from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { deriveNetFreshness } from "../src/conversation/net-freshness.ts";
import { deriveNetLedger } from "../src/conversation/net-ledger.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import { nativeSchemaProvider } from "./native-schema-provider.ts";

const output = mkdtempSync(join(tmpdir(), "canonical-root-browser-"));
process.env.NODE_ENV = "test";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(output, "conversation.db");
delete process.env.HASH_OTLP_ENDPOINT;
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  assert.equal(
    new URL(input instanceof Request ? input.url : String(input)).hostname,
    "127.0.0.1",
  );
  return originalFetch(input, init);
};
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", reasoning: true }],
});
const providerContexts: Parameters<typeof nativeSchemaProvider>[2] = [];
installFauxProvider(nativeSchemaProvider(faux.provider, [], providerContexts));
const app = await loadBuiltBrunchApplication();
let fixture: Awaited<ReturnType<typeof openBrowserFixture>> | undefined;
try {
  fixture = await openBrowserFixture(app, resolve("../petrinaut-website/dist"));
  const { page, origin, deliveries, errors, blocked } = fixture;
  await page.addInitScript(() => {
    localStorage.setItem("petrinaut-website:assistant", "brunch");
  });
  await page.goto(`${origin}/`);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall("ping", {}, { id: "root-ping-1" }),
        fauxToolCall("getLatestNetDefinition", {}, { id: "root-read-before" }),
        fauxToolCall(
          "mutate_workpiece",
          {
            markdown: "# Queue\nThe person asked for a Queue place.",
            baseRevisionId: null,
          },
          { id: "root-ledger-1" },
        ),
        fauxToolCall(
          "addPlace",
          {
            id: "queue",
            name: "Queue",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
            targetSubnetId: null,
          },
          { id: "root-place-1" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall(
          "addPlace",
          {
            id: "sink",
            name: "Sink",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 100,
            y: 0,
            targetSubnetId: null,
          },
          { id: "root-place-2" },
        ),
        fauxToolCall("getLatestNetDefinition", {}, { id: "root-read-after" }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall(
          "addScenario",
          {
            id: "baseline",
            name: "Baseline",
            scenarioParameters: [],
            parameterOverrides: {},
            initialState: { type: "per_place", content: {} },
          },
          { id: "root-scenario-1" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([fauxText("Root place tool finished.")]),
  ]);
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  await composer.fill("Add one Queue place directly to the empty net.");
  await composer.press("Enter");
  let continued = false;
  try {
    await page
      .getByText("Root place tool finished.", { exact: true })
      .waitFor({ timeout: 8_000 });
    continued = true;
  } catch {
    // An admission failure prevents the continuation; inspect the actual delivery below.
  }
  const first = JSON.parse(deliveries[0]?.body ?? "null") as {
    kind?: string;
    initialData?: {
      mode?: string;
      construction?: {
        binding?: {
          conversationId: string;
          documentId: string;
          incarnationId: string;
        };
      };
    };
  } | null;
  assert.equal(first?.kind, "user");
  assert.equal(first.initialData?.mode, "integrated-brunch-canonical");
  const binding = first.initialData.construction?.binding;
  assert(binding, "Missing actual browser conversation binding");
  const principalKey = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) =>
      entry.includes("principal"),
    );
    const raw = key === undefined ? null : localStorage.getItem(key);
    return raw?.startsWith('"') ? (JSON.parse(raw) as string) : raw;
  });
  assert(principalKey, "Missing actual browser principal");
  const identity = { principalKey, conversationId: binding.conversationId };
  const client = createFlueClient({
    url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
    headers: agentOwnershipHeaders(identity),
  });
  const result = clientToolHistoryFrom(
    (await client.history()).messages,
  ).results.find(({ toolCallId }) => toolCallId === "root-place-1");
  const stored = await page.evaluate((documentId) => {
    const documents = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<
      string,
      { sdcpn?: { places?: { id: string }[]; scenarios?: { id: string }[] } }
    >;
    return {
      places: documents[documentId]?.sdcpn?.places?.map(({ id }) => id),
      scenarios: documents[documentId]?.sdcpn?.scenarios?.map(({ id }) => id),
    };
  }, binding.documentId);
  const resultIngress = deliveries.find(({ path }) =>
    path.endsWith("/browser-calls/root-place-1"),
  );
  const followUpSignals = deliveries.filter(({ body }) => {
    try {
      return (JSON.parse(body) as { kind?: string }).kind === "signal";
    } catch {
      return false;
    }
  });
  const toolParts = (await client.history()).messages
    .flatMap(({ parts }) => parts)
    .filter((part) => part.type === "dynamic-tool");
  const toolPart = toolParts.find((part) => part.toolCallId === "root-place-1");
  const before = clientToolHistoryFrom(
    (await client.history()).messages,
  ).results.find(({ toolCallId }) => toolCallId === "root-read-before");
  const after = clientToolHistoryFrom(
    (await client.history()).messages,
  ).results.find(({ toolCallId }) => toolCallId === "root-read-after");
  assert(result, "Root addPlace did not reach Flue history");
  assert.equal(result.toolName, "addPlace");
  assert.deepEqual(result.output, {
    applied: true,
    title: "Added place Queue",
    target: { kind: "selection", item: { type: "place", id: "queue" } },
  });
  assert(
    stored.places?.includes("queue"),
    "Root place did not persist in browser storage",
  );
  assert(
    stored.scenarios?.includes("baseline"),
    "An unrecorded scenario must still persist its document revision",
  );
  assert(
    resultIngress,
    "The browser did not return the issued result to the direct route",
  );
  assert.deepEqual(
    followUpSignals,
    [],
    "An in-band I tool must not deliver a second Flue signal",
  );
  const resultUrl = `${client.url}/browser-calls/root-place-1`;
  const replyHeaders = {
    ...agentOwnershipHeaders(identity),
    "content-type": "application/json",
  };
  assert.equal(
    (
      await fetch(`${client.url}/browser-calls/not-issued`, {
        method: "POST",
        headers: replyHeaders,
        body: JSON.stringify({
          capability: "forged",
          binding: JSON.stringify(binding),
          toolName: "addPlace",
          canonicalInput: {},
          output: {},
        }),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await fetch(resultUrl, {
        method: "POST",
        headers: replyHeaders,
        body: JSON.stringify({
          capability: "duplicate",
          binding: JSON.stringify(binding),
          toolName: "addPlace",
          canonicalInput: {},
          output: { applied: false },
        }),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await fetch(
        `${resultUrl}?binding=${encodeURIComponent(JSON.stringify(binding))}`,
        { headers: agentOwnershipHeaders(identity) },
      )
    ).status,
    404,
  );
  assert(
    toolParts.some(
      (part) =>
        part.toolCallId === "root-ping-1" && part.state === "output-available",
    ) &&
      toolParts.some(
        (part) =>
          part.toolCallId === "root-ledger-1" &&
          part.state === "output-available",
      ),
    "Mixed server/browser proposal with a Ledger revision was not admitted",
  );
  assert(
    before?.output && after?.output,
    "In-band browser reads did not settle",
  );
  assert(
    !JSON.stringify(before.output).includes('"id":"queue"'),
    "Initial read already saw the future mutation",
  );
  assert(
    JSON.stringify(after.output).includes('"id":"queue"'),
    "Read after mutation did not observe the saved place",
  );
  assert(
    JSON.stringify(after.output).includes('"id":"sink"'),
    "The same-proposal read did not see the second saved place",
  );
  assert(
    toolPart?.type === "dynamic-tool" &&
      toolPart.state === "output-available" &&
      typeof toolPart.output === "object" &&
      toolPart.output !== null &&
      "brunchBrowserResult" in toolPart.output &&
      toolPart.output.brunchBrowserResult === true,
    "The canonical Flue tool has no in-band browser outcome",
  );
  const record = parseClientToolResultMetadata(
    result.metadata,
  )?.canonicalMutationRecord;
  assert(record, "Root addPlace delivered no canonical mutation record");
  assert.equal(record.outcome, "applied");
  assert.equal(record.settlement.status, "settled");
  const nextModelContext = providerContexts.at(1);
  assert(
    nextModelContext,
    "No immediate provider continuation followed the mixed browser/server batch",
  );
  const modelToolResult = nextModelContext.messages.find(
    (message) =>
      message.role === "toolResult" && message.toolCallId === "root-place-1",
  );
  assert(
    modelToolResult && modelToolResult.role === "toolResult",
    "The provider did not see the canonical browser result",
  );
  const modelText = modelToolResult.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  assert.deepEqual(
    JSON.parse(modelText) as unknown,
    result.output,
    "The immediate provider step received an envelope instead of the canonical result",
  );
  assert(
    !modelText.includes("brunchBrowserResult") &&
      !modelText.includes("metadata") &&
      !modelText.includes("binding") &&
      !modelText.includes("sha256"),
    "Host-only browser metadata leaked into model context",
  );
  const sibling = clientToolHistoryFrom(
    (await client.history()).messages,
  ).results.find(({ toolCallId }) => toolCallId === "root-place-2");
  const siblingRecord = parseClientToolResultMetadata(
    sibling?.metadata,
  )?.canonicalMutationRecord;
  assert(
    siblingRecord && record.post,
    "Second root mutation was not independently recorded",
  );
  assert.equal(
    siblingRecord.pre.sha256,
    record.post.sha256,
    "Same-document calls did not execute in admitted order",
  );
  const ledger = await deriveNetLedger(await client.history(), { binding });
  assert(
    ledger.some(
      (event) =>
        event.kind === "mutation" &&
        event.toolCallId === "root-place-1" &&
        event.outcome === "applied",
    ),
    "The canonical history did not independently verify the settled mutation cause",
  );
  assert(
    ledger.some(
      (event) =>
        event.kind === "unrecorded" && event.toolCallId === "root-scenario-1",
    ),
    "A scenario must not acquire a fabricated call-to-revision cause",
  );
  assert(
    continued,
    "Root canonical delivery was not admitted for model continuation",
  );
  // A same-conversation claimant for another document incarnation must not
  // consume the issued input before this browser claims its exact binding.
  const releaseBindingClaim = Promise.withResolvers<void>();
  await page.route("**/browser-calls/root-binding-probe**", async (route) => {
    if (route.request().method() === "GET") await releaseBindingClaim.promise;
    await route.continue();
  });
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall(
          "getLatestNetDefinition",
          {},
          { id: "root-binding-probe" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([fauxText("Correct document claimant continued.")]),
  ]);
  const browserClaim = page.waitForRequest(
    (request) =>
      request.method() === "GET" &&
      new URL(request.url()).pathname.endsWith(
        "/browser-calls/root-binding-probe",
      ),
    { timeout: 8_000 },
  );
  await composer.fill("Read the current net from the correctly bound browser.");
  await composer.press("Enter");
  await browserClaim;
  try {
    const wrongIncarnation = JSON.stringify({
      ...binding,
      incarnationId: `${binding.incarnationId}-other`,
    });
    const response = await fetch(
      `${client.url}/browser-calls/root-binding-probe?binding=${encodeURIComponent(wrongIncarnation)}`,
      { headers: agentOwnershipHeaders(identity) },
    );
    assert.equal(
      response.status,
      404,
      "A wrong document incarnation claimed a browser call",
    );
  } finally {
    releaseBindingClaim.resolve();
  }
  await page
    .getByText("Correct document claimant continued.", { exact: true })
    .waitFor({ timeout: 8_000 });
  assert(
    clientToolHistoryFrom((await client.history()).messages).results.some(
      ({ toolCallId }) => toolCallId === "root-binding-probe",
    ),
    "The correct claimant was starved by a wrong binding",
  );

  // The result route may accept bytes, but only Flue's verified outcome can
  // vouch for cause. Reject both absent and forged host evidence after a real edit.
  for (const recordDisposition of ["missing", "invalid"] as const) {
    const toolCallId = `${recordDisposition}-root-record`;
    await page.route(`**/browser-calls/${toolCallId}`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const body = JSON.parse(route.request().postData() ?? "null") as {
        metadata?: {
          canonicalMutationRecord?: { binding: { documentId: string } };
        };
      };
      if (recordDisposition === "missing") delete body.metadata;
      else if (body.metadata?.canonicalMutationRecord)
        body.metadata.canonicalMutationRecord.binding.documentId =
          "forged-document";
      const response = await route.fetch({ postData: JSON.stringify(body) });
      assert.equal(
        response.status(),
        422,
        "The server acknowledged an unverified root result",
      );
      await route.fulfill({ response });
    });
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall(
            "addPlace",
            {
              id: `${recordDisposition}-place`,
              name:
                recordDisposition === "missing"
                  ? "MissingPlace"
                  : "InvalidPlace",
              colorId: null,
              dynamicsEnabled: false,
              differentialEquationId: null,
              x: 250,
              y: 0,
              targetSubnetId: null,
            },
            { id: toolCallId },
          ),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([fauxText(`${recordDisposition} sidecar refused.`)]),
    ]);
    await composer.fill(
      `Probe an issued root result with ${recordDisposition} host evidence.`,
    );
    await composer.press("Enter");
    await page
      .getByText(`${recordDisposition} sidecar refused.`, { exact: true })
      .waitFor({ timeout: 8_000 });
    const snapshot = await client.history();
    const rootPart = snapshot.messages
      .flatMap(({ parts }) => parts)
      .find(
        (part) =>
          part.type === "dynamic-tool" && part.toolCallId === toolCallId,
      );
    assert(
      rootPart?.type === "dynamic-tool" && rootPart.state === "output-error",
      `${recordDisposition} root evidence acquired a successful Flue outcome`,
    );
    assert(
      !(await deriveNetLedger(snapshot, { binding })).some(
        (event) => event.kind === "mutation" && event.toolCallId === toolCallId,
      ),
      `${recordDisposition} root evidence acquired Ledger cause`,
    );
  }
  const queuedPlace = (id: string, name: string) => ({
    id,
    name,
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 350,
    y: 0,
    targetSubnetId: null,
  });
  for (const firstCall of [
    {
      toolCallId: "root-failed-no-stop",
      toolName: "addPlace",
      input: queuedPlace("failed-no-stop", "FailedNoStop"),
      independent: {
        toolCallId: "root-cancelled-suffix",
        toolName: "addPlace",
        input: queuedPlace("cancelled-suffix", "CancelledSuffix"),
      },
      expectedText: "Unknown write finished without Stop.",
    },
    {
      toolCallId: "root-known-read-error",
      toolName: "getLatestNetDefinition",
      input: {},
      independent: {
        toolCallId: "root-known-independent",
        toolName: "addPlace",
        input: queuedPlace("known-independent", "KnownIndependent"),
      },
      expectedText: "Known read failure did not stop the independent call.",
    },
  ] as const) {
    await page.route(`**/browser-calls/${firstCall.toolCallId}`, (route) =>
      route.request().method() === "POST"
        ? route.abort("failed")
        : route.continue(),
    );
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall(firstCall.toolName, firstCall.input, {
            id: firstCall.toolCallId,
          }),
          fauxToolCall(
            firstCall.independent.toolName,
            firstCall.independent.input,
            { id: firstCall.independent.toolCallId },
          ),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([fauxText(firstCall.expectedText)]),
    ]);
    const startedAt = Date.now();
    await composer.fill(
      `Probe ${firstCall.toolName} failure with an issued sibling.`,
    );
    await composer.press("Enter");
    await page
      .getByText(firstCall.expectedText, { exact: true })
      .waitFor({ timeout: 8_000 });
    assert(
      Date.now() - startedAt < 8_000,
      "Failed browser work waited for its renewable 25-second lease",
    );
    const afterFailure = await client.history();
    const parts = afterFailure.messages.flatMap(
      ({ parts: messageParts }) => messageParts,
    );
    const failedPart = parts.find(
      (part) =>
        part.type === "dynamic-tool" &&
        part.toolCallId === firstCall.toolCallId,
    );
    assert(
      failedPart?.type === "dynamic-tool" &&
        failedPart.state === "output-error",
      "A negative browser result fabricated canonical success",
    );
    assert(
      failedPart.errorText.includes(
        firstCall.toolName === "addPlace" ? "unknown" : "unchanged",
      ),
      "The failure was not conservatively classified by the server",
    );
    const siblingPart = parts.find(
      (part) =>
        part.type === "dynamic-tool" &&
        part.toolCallId === firstCall.independent.toolCallId,
    );
    assert(
      siblingPart?.type === "dynamic-tool" &&
        siblingPart.state ===
          (firstCall.toolName === "addPlace"
            ? "output-error"
            : "output-available"),
      "A known failure poisoned independent work or an unknown failure ran its suffix",
    );
    if (firstCall.toolName === "addPlace")
      assert(
        siblingPart.errorText?.includes("not started"),
        "A skipped sibling was misreported as an attempted write",
      );
    const documentPlaces = await page.evaluate((documentId) => {
      const documents = JSON.parse(
        localStorage.getItem("petrinaut-sdcpn") ?? "{}",
      ) as Record<string, { sdcpn?: { places?: { id: string }[] } }>;
      return documents[documentId]?.sdcpn?.places?.map(({ id }) => id) ?? [];
    }, binding.documentId);
    assert(
      documentPlaces.includes(
        firstCall.toolName === "addPlace"
          ? "failed-no-stop"
          : "known-independent",
      ),
    );
    assert(
      !documentPlaces.includes("cancelled-suffix"),
      "An unknown document effect started the dependent suffix",
    );
    assert(
      !(await deriveNetLedger(afterFailure, { binding })).some(
        (event) =>
          event.kind === "mutation" &&
          event.toolCallId === firstCall.toolCallId,
      ),
      "A failed browser result acquired Ledger cause",
    );
  }
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall(
          "getLatestNetDefinition",
          {},
          { id: "root-read-before-loss" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([fauxText("Fresh net observed before loss.")]),
  ]);
  await composer.fill("Read the saved net before the next edit.");
  await composer.press("Enter");
  await page
    .getByText("Fresh net observed before loss.", { exact: true })
    .waitFor({ timeout: 8_000 });
  const beforeLossHistory = await client.history();
  const beforeLossRead = clientToolHistoryFrom(
    beforeLossHistory.messages,
  ).results.find(({ toolCallId }) => toolCallId === "root-read-before-loss");
  const beforeLossRevision = parseClientToolResultMetadata(
    beforeLossRead?.metadata,
  )?.observation?.observed.revisionId;
  assert(
    beforeLossRevision,
    "The live net read did not report its saved revision",
  );
  assert.equal(
    (
      await deriveNetFreshness(
        beforeLossHistory,
        { binding },
        beforeLossRevision,
      )
    ).kind,
    "current",
  );

  // The document effect can persist while its result POST disappears. Stop must
  // settle the waiter without pretending that the place was rolled back.
  await page.route("**/browser-calls/root-unknown-place", (route) =>
    route.request().method() === "POST"
      ? route.abort("failed")
      : route.continue(),
  );
  // This call's failure acknowledgment also disappears: Stop, not HTTP, must settle it.
  await page.route("**/browser-calls/root-unknown-place/fail", (route) =>
    route.abort("failed"),
  );
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall(
          "addPlace",
          {
            id: "unknown-place",
            name: "UnknownPlace",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 200,
            y: 0,
            targetSubnetId: null,
          },
          { id: "root-unknown-place" },
        ),
        fauxToolCall(
          "addPlace",
          {
            id: "unstarted-place",
            name: "UnstartedPlace",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 300,
            y: 0,
            targetSubnetId: null,
          },
          { id: "root-unstarted-place" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([
      fauxText("This response must not repeat the lost write."),
    ]),
  ]);
  const providerCallsBeforeStop = faux.state.callCount;
  await composer.fill(
    "Add a place, then stop while its browser result is lost.",
  );
  await composer.press("Enter");
  await page.waitForFunction(
    (documentId) => {
      const documents = JSON.parse(
        localStorage.getItem("petrinaut-sdcpn") ?? "{}",
      ) as Record<string, { sdcpn?: { places?: { id: string }[] } }>;
      return documents[documentId]?.sdcpn?.places?.some(
        ({ id }) => id === "unknown-place",
      );
    },
    binding.documentId,
    { timeout: 8_000 },
  );
  await page
    .getByRole("button", { name: "Stop AI response", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('button[aria-label="Stop AI response"]') === null,
    undefined,
    { timeout: 8_000 },
  );
  const stoppedHistory = await client.history();
  const lossEvents = await deriveNetLedger(stoppedHistory, { binding });
  assert(
    lossEvents.some(
      (event) =>
        event.kind === "unrecorded" &&
        event.toolCallId === "root-unknown-place",
    ),
    "A persisted effect with a lost result left the prior read falsely current",
  );
  assert(
    !lossEvents.some((event) => event.toolCallId === "root-unstarted-place"),
    "A skipped sibling was treated as a possible effect",
  );
  for (const reportedRevisionId of [undefined, beforeLossRevision]) {
    const freshness = await deriveNetFreshness(
      stoppedHistory,
      { binding },
      reportedRevisionId,
    );
    assert(
      freshness.kind === "stale" && freshness.lastKnownHash === undefined,
      "A lost browser result did not invalidate the last verified read",
    );
  }
  assert(
    !clientToolHistoryFrom(stoppedHistory.messages).results.some(
      ({ toolCallId }) => toolCallId === "root-unknown-place",
    ),
    "A dropped result acquired a settled Flue cause",
  );
  const postStopDocument = await page.evaluate((documentId) => {
    const documents = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, { sdcpn?: { places?: { id: string }[] } }>;
    return documents[documentId]?.sdcpn?.places?.map(({ id }) => id) ?? [];
  }, binding.documentId);
  assert(
    postStopDocument.includes("unknown-place") &&
      !postStopDocument.includes("unstarted-place"),
    "Stop replayed or executed an unstarted dependent suffix",
  );
  assert(
    !clientToolHistoryFrom(stoppedHistory.messages).results.some(
      ({ toolCallId }) => toolCallId === "root-unstarted-place",
    ),
    "An unstarted sibling acquired a canonical result",
  );
  const stoppedSibling = stoppedHistory.messages
    .flatMap(({ parts }) => parts)
    .find(
      (part) =>
        part.type === "dynamic-tool" &&
        part.toolCallId === "root-unstarted-place",
    );
  assert(
    stoppedSibling?.type === "dynamic-tool" &&
      stoppedSibling.state === "output-error" &&
      stoppedSibling.errorText.includes("not started"),
    "Stop mislabeled an unstarted sibling as attempted",
  );
  assert.equal(
    faux.state.callCount - providerCallsBeforeStop,
    1,
    "Stop retried the attempted write",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  process.stdout.write("CANONICAL_ROOT_BROWSER_BOUNDARY_PASS\n");
} finally {
  if (fixture) {
    await fixture.browser.close();
    await new Promise<void>((done, reject) =>
      fixture?.server.close((error) => (error ? reject(error) : done())),
    );
  }
  await app.stop();
  globalThis.fetch = originalFetch;
}
