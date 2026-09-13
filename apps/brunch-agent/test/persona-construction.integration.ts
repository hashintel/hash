/** Synthetic persona utterances through the real browser, not a model-quality evaluation. */
/* eslint-disable no-await-in-loop -- Each utterance consumes the preceding settled reply. */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";
import { expect } from "@playwright/test";

import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import brunchPersonaTestingExtension from "../.pi/extensions/brunch-persona-testing.ts";
import { agentOwnershipHeaders } from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { openPersonaBrowserBridge } from "../src/evaluations/persona/browser-bridge.ts";
import { submitPersonaBrowserTurn } from "../src/evaluations/persona/browser-turn.ts";
import {
  documentIdFromInitialData,
  openPersonaConversation,
} from "../src/evaluations/persona/launch.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import { browserResultFrom } from "./browser-result.ts";
import { nativeSchemaProvider } from "./native-schema-provider.ts";

import type { BrunchTurnTool } from "../src/evaluations/persona/brunch-turn.ts";
import type { SDCPN } from "@hashintel/petrinaut-core";

const output = mkdtempSync(join(tmpdir(), "persona-construction-"));
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
installFauxProvider(nativeSchemaProvider(faux.provider, [], []));
const app = await loadBuiltBrunchApplication();
let fixture: Awaited<ReturnType<typeof openBrowserFixture>> | undefined;
let bridge: Awaited<ReturnType<typeof openPersonaBrowserBridge>> | undefined;
const text = (value: string) => fauxAssistantMessage([fauxText(value)]);
const call = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
try {
  fixture = await openBrowserFixture(app, resolve("../petrinaut-website/dist"));
  const { page, origin } = fixture;
  faux.setResponses([
    call("read_petrinaut_net", {}, "opening-read"),
    text("Tell me about the operation."),
  ]);
  const opened = await openPersonaConversation(
    page,
    origin,
    "Let us build an operation from scratch.",
    { route: "/" },
  );
  const client = createFlueClient({
    url: opened.session.url,
    headers: agentOwnershipHeaders(opened.session),
  });
  assert.equal(
    opened.submissionIds.length,
    2,
    "Opening also waits for browser continuations",
  );
  assert.equal(
    opened.snapshot.messages.filter((message) => message.purpose === "user")
      .length,
    1,
  );
  const documentId = documentIdFromInitialData(opened.session.initialData);
  assert(documentId);
  const readNet = async () => {
    const stored = await page.evaluate((id) => {
      const documents = JSON.parse(
        localStorage.getItem("petrinaut-sdcpn") ?? "{}",
      ) as Record<string, { sdcpn: SDCPN }>;
      return documents[id]?.sdcpn;
    }, documentId);
    assert(stored);
    return stored;
  };
  assert.deepEqual(
    (await readNet()).places,
    [],
    "Ordinary route starts with an empty net",
  );
  await expect(page.getByTestId("brunch-current-workpiece")).toHaveCount(0);
  writeFileSync(
    join(output, "initial-snapshot.json"),
    JSON.stringify(opened.snapshot, null, 2),
  );
  bridge = await openPersonaBrowserBridge(async (message, signal) => {
    const result = await submitPersonaBrowserTurn(page, message, {
      session: opened.session,
      signal,
    });
    return {
      conversationId: result.session.conversationId,
      text: result.reply.text,
      submissionIds: result.submissionIds,
    };
  });
  process.env.PI_SUBAGENT_NAME = "TEST-browser-construction";
  let persona: BrunchTurnTool | undefined;
  const hooks: (() => void | Promise<void>)[] = [];
  await brunchPersonaTestingExtension({
    registerProvider: () => {
      throw new Error("Must not register a live provider");
    },
    registerFlag: () => {},
    getFlag: (name) =>
      name === "brunch-browser-bridge" ? bridge?.socketPath : undefined,
    registerTool: (tool) => {
      persona = tool;
    },
    on: (event, handler) => {
      if (event === "session_start")
        hooks.push(() =>
          handler(undefined, {
            model: undefined,
            sessionManager: { getSessionId: () => "TEST-browser-construction" },
            modelRegistry: { getProviderAuth: async () => undefined },
          }),
        );
    },
  });
  for (const hook of hooks) await hook();
  assert(persona);
  for (const index of [1, 2]) {
    const reachedRead = Promise.withResolvers<void>();
    const continueRead = Promise.withResolvers<void>();
    const markdown = `# Synthetic operation\n\nThere are ${index} waiting stages. Timing is unknown.`;
    faux.setResponses([
      call("mutate_workpiece", { markdown }, `workpiece-${index}`),
      call("read_petrinaut_net", {}, `read-${index}`),
      async (context: Context) => {
        const observation = browserResultFrom(
          context.messages.flatMap((message) =>
            typeof message.content === "string"
              ? [message.content]
              : message.content.flatMap((part) =>
                  part.type === "text" ? [part.text] : [],
                ),
          ),
          "read_petrinaut_net",
          "Missing browser observation",
        ).metadata?.observation;
        assert(observation);
        reachedRead.resolve();
        await continueRead.promise;
        return call(
          "mutate_petrinaut_net",
          {
            observation: {
              toolCallId: observation.toolCallId,
              baseHash: observation.observed.sha256,
            },
            bases: [
              {
                basisId: "synthetic",
                basis: {
                  kind: "absent",
                  reason: "Synthetic wiring proof, not operational provenance.",
                },
              },
            ],
            operations: [
              {
                operationId: `place-${index}`,
                basisId: "synthetic",
                type: "addPlace",
                input: {
                  id: `waiting-${index}`,
                  name: `WaitingStage${index}`,
                  colorId: null,
                  dynamicsEnabled: false,
                  differentialEquationId: null,
                  x: 360 + (index - 1) * 220,
                  y: 300,
                },
              },
            ],
          },
          `batch-${index}`,
        );
      },
      text(`Stage ${index} is now on the canvas.`),
    ]);
    const pending: ReturnType<BrunchTurnTool["execute"]> = persona.execute(
      `turn-${index}`,
      { message: `Please add waiting stage ${index}.` },
      AbortSignal.timeout(30_000),
    );
    await reachedRead.promise;
    // Switch during the client continuation, not merely between turns.
    await page.getByRole("tab", { name: "Workpiece", exact: true }).click();
    continueRead.resolve();
    const result = await pending;
    assert.equal(
      result.details.elicitorText,
      `Stage ${index} is now on the canvas.`,
    );
    assert(
      result.details.submissionIds.length >= 3,
      "Must wait across read and mutation continuations",
    );
    await expect(
      page.getByRole("tab", { name: "Workpiece", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("brunch-current-workpiece")).toHaveText(
      markdown,
    );
    const history = await client.history();
    const results = clientToolHistoryFrom(history.messages).results;
    assert(results.some((entry) => entry.toolCallId === `read-${index}`));
    assert(results.some((entry) => entry.toolCallId === `batch-${index}`));
    assert.deepEqual(
      (await readNet()).places.map((place) => ({
        id: place.id,
        name: place.name,
        x: place.x,
      })),
      Array.from({ length: index }, (_, offset) => ({
        id: `waiting-${offset + 1}`,
        name: `WaitingStage${offset + 1}`,
        x: 360 + offset * 220,
      })),
      "Actual net must already contain exactly the applied places when reply returns",
    );
    await page.screenshot({ path: join(output, `stage-${index}.png`) });
  }
  await page.screenshot({ path: join(output, "workpiece.png") });
  await page.getByRole("tab", { name: "AI", exact: true }).click();
  await page.screenshot({ path: join(output, "conversation.png") });
  const before = fixture.deliveries.length;
  const net = await page.evaluate(() =>
    localStorage.getItem("petrinaut-sdcpn"),
  );
  assert(net);
  writeFileSync(join(output, "net.json"), net);
  await page.reload();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  await expect(
    page.getByText("Stage 2 is now on the canvas.", { exact: true }),
  ).toBeVisible();
  assert.equal(
    fixture.deliveries.length,
    before,
    "Hydration must not submit or execute old calls",
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("petrinaut-sdcpn")),
    net,
  );
  writeFileSync(
    join(output, "snapshot.json"),
    JSON.stringify(await client.history(), null, 2),
  );
  const generating = Promise.withResolvers<void>();
  faux.setResponses([
    async (_context, options) => {
      generating.resolve();
      await delay(60_000, undefined, { signal: options?.signal });
      return text("Must not finish after Stop");
    },
  ]);
  const cancellation = new AbortController();
  const cancelled = persona.execute(
    "cancel",
    { message: "Begin another review." },
    cancellation.signal,
  );
  const rejected = assert.rejects(cancelled, /abort/i);
  await generating.promise;
  cancellation.abort();
  await rejected;
  await expect(
    page.getByRole("button", { name: "Stop AI response", exact: true }),
  ).toBeHidden();
  await expect
    .poll(async () => (await client.history()).settlements.at(-1)?.outcome)
    .toBe("aborted");
  const stoppedDeliveries = fixture.deliveries.length;
  await assert.rejects(
    persona.execute("no-retry", { message: "Do not resend." }),
    /cannot send again/,
  );
  assert.equal(fixture.deliveries.length, stoppedDeliveries);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("petrinaut-sdcpn")),
    net,
  );
  writeFileSync(
    join(output, "stopped-snapshot.json"),
    JSON.stringify(await client.history(), null, 2),
  );
  assert.deepEqual(fixture.errors, []);
  process.stdout.write(
    `PASS persona browser construction, workpiece, tab independence, cancellation and no replay: ${output}\n`,
  );
} finally {
  await bridge?.close();
  await fixture?.browser.close();
  fixture?.server.closeAllConnections();
  await new Promise<void>((done) =>
    fixture ? fixture.server.close(() => done()) : done(),
  );
  await app.stop();
  globalThis.fetch = originalFetch;
}
