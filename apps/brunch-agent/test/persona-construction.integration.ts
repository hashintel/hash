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
import {
  openRetainedPersonaBrowser,
  reconcilePersonaResume,
} from "../src/evaluations/persona/launch/resume.ts";
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
let finishBarrier: ReturnType<typeof Promise.withResolvers<void>> | undefined;
installFauxProvider(
  nativeSchemaProvider(faux.provider, [], [], "streamSimple", async () => {
    await finishBarrier?.promise;
  }),
);
let app = await loadBuiltBrunchApplication();
let fixture: Awaited<ReturnType<typeof openBrowserFixture>> | undefined;
let bridge: Awaited<ReturnType<typeof openPersonaBrowserBridge>> | undefined;
const text = (value: string) => fauxAssistantMessage([fauxText(value)]);
const call = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
try {
  fixture = await openBrowserFixture(
    { fetch: (request) => app.fetch(request), stop: () => app.stop() },
    resolve("../petrinaut-website/dist"),
  );
  const { page, origin } = fixture;
  faux.setResponses([
    call("read_petrinaut_net", {}, "opening-read"),
    text("Tell me about the operation."),
  ]);
  const ready = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const opening = openPersonaConversation(
    page,
    origin,
    "Let us build an operation from scratch.",
    {
      route: "/",
      beforeOpening: async () => {
        ready.resolve();
        await release.promise;
      },
    },
  );
  await Promise.race([ready.promise, opening]);
  assert.equal(
    fixture.deliveries.length,
    0,
    "Recording pause precedes all model calls",
  );
  await expect(
    page.getByRole("textbox", { name: "Message AI assistant", exact: true }),
  ).toBeVisible();
  await delay(100);
  assert.equal(
    fixture.deliveries.length,
    0,
    "No admission while waiting for recording",
  );
  release.resolve();
  const opened = await opening;
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
    if (index === 1) finishBarrier = Promise.withResolvers<void>();
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxText(
            `Preparing stage ${index}; the workpiece is not updated yet.`,
          ),
          fauxToolCall(
            "mutate_workpiece",
            { markdown, baseRevisionId: index === 1 ? null : "workpiece-1" },
            { id: `workpiece-${index}` },
          ),
        ],
        { stopReason: "toolUse" },
      ),
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
    void pending.catch(() => {});
    if (index === 1) {
      await expect(
        page.getByText("Preparing stage 1; the workpiece is not updated yet.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Stop AI response", exact: true }),
      ).toBeVisible();
      const partial = await client.history();
      assert(
        !partial.messages
          .flatMap((message) => message.parts)
          .some(
            (part) =>
              part.type === "dynamic-tool" && part.toolCallId === "workpiece-1",
          ),
        "No tool input is admitted before provider completion",
      );
      await page.screenshot({ path: join(output, "streaming.png") });
      finishBarrier?.resolve();
      finishBarrier = undefined;
    }
    await reachedRead.promise;
    if (index === 1) {
      await page
        .getByRole("button", { name: "2 operations", exact: true })
        .click();
      await expect(
        page.getByText("mutate_workpiece", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: join(output, "tools.png"),
        animations: "disabled",
      });
    }
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
    const workpiece = history.messages
      .flatMap((message) => message.parts)
      .find(
        (part) =>
          part.type === "dynamic-tool" &&
          part.toolCallId === `workpiece-${index}`,
      );
    assert(workpiece?.type === "dynamic-tool");
    assert.equal(workpiece.state, "output-available");
    assert.partialDeepStrictEqual(workpiece.output, {
      revisionId: `workpiece-${index}`,
      ordinal: index,
      mutation: { baseRevisionId: index === 1 ? null : "workpiece-1" },
    });
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
  faux.setResponses([
    call(
      "mutate_workpiece",
      {
        markdown: "# Must not replace an existing revision",
        baseRevisionId: null,
      },
      "stale-empty-base",
    ),
    text("The stale first-revision write was refused."),
  ]);
  await persona.execute("stale-base-turn", {
    message:
      "Exercise a stale first-revision write; preserve the current account.",
  });
  const stale = (await client.history()).messages
    .flatMap((message) => message.parts)
    .find(
      (part) =>
        part.type === "dynamic-tool" && part.toolCallId === "stale-empty-base",
    );
  assert(stale?.type === "dynamic-tool");
  assert.equal(stale.state, "output-error");
  assert.match(stale.errorText, /baseRevisionId/);
  await page.getByRole("tab", { name: "Workpiece", exact: true }).click();
  await expect(page.getByTestId("brunch-current-workpiece")).toHaveText(
    "# Synthetic operation\n\nThere are 2 waiting stages. Timing is unknown.",
  );
  await page.getByRole("tab", { name: "AI", exact: true }).click();
  finishBarrier = Promise.withResolvers<void>();
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxText("Review in progress; this turn will be stopped."),
        fauxToolCall(
          "mutate_workpiece",
          {
            markdown: "# Must not apply after Stop",
            baseRevisionId: "workpiece-2",
          },
          { id: "cancelled-write" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
  ]);
  const cancelled = persona.execute("cancel", {
    message: "Begin another review.",
  });
  const rejected = assert.rejects(
    cancelled,
    /Persona browser turn was stopped/,
  );
  await expect(
    page.getByText("Review in progress; this turn will be stopped.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Stop AI response", exact: true })
    .click();
  await rejected;
  finishBarrier.resolve();
  finishBarrier = undefined;
  await expect(
    page.getByRole("button", { name: "Stop AI response", exact: true }),
  ).toBeHidden();
  await expect
    .poll(async () => (await client.history()).settlements.at(-1)?.outcome)
    .toBe("aborted");
  const stopped = await client.history();
  assert(
    !stopped.messages
      .flatMap((message) => message.parts)
      .some(
        (part) =>
          part.type === "dynamic-tool" && part.toolCallId === "cancelled-write",
      ),
    "Stop must not admit buffered tool input",
  );
  await page.screenshot({ path: join(output, "stopped.png") });
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
  // Native restart + original browser storage. Never resend the interrupted utterance.
  await app.stop();
  app = await loadBuiltBrunchApplication();
  await openRetainedPersonaBrowser(page, origin, "/", opened.session);
  await assert.rejects(
    reconcilePersonaResume(page, opened.session, "A different utterance"),
    /disagree on the last admitted utterance/,
  );
  const resumed = await reconcilePersonaResume(
    page,
    opened.session,
    "Begin another review.",
  );
  assert.match(resumed.prompt, /settled as: aborted/);
  assert.equal(
    fixture.deliveries.length,
    stoppedDeliveries,
    "Resume reconciliation is read-only",
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("petrinaut-sdcpn")),
    net,
  );
  await page.getByRole("tab", { name: "Workpiece", exact: true }).click();
  await expect(page.getByTestId("brunch-current-workpiece")).toHaveText(
    "# Synthetic operation\n\nThere are 2 waiting stages. Timing is unknown.",
  );
  await page.getByRole("tab", { name: "AI", exact: true }).click();
  faux.setResponses([
    call("read_petrinaut_net", {}, "resumed-read"),
    text("Resumed against the existing two-stage model."),
  ]);
  const continued = await submitPersonaBrowserTurn(
    page,
    "Please pick up where we left off.",
    { session: opened.session },
  );
  assert.equal(continued.session.uid, opened.session.uid);
  assert.equal(
    continued.submissionIds.length,
    2,
    "Resumed turns still execute browser tools",
  );
  assert.equal(
    continued.snapshot.messages.filter((message) => message.purpose === "user")
      .length,
    resumed.snapshot.messages.filter((message) => message.purpose === "user")
      .length + 1,
  );
  await page.screenshot({ path: join(output, "resumed.png") });
  writeFileSync(
    join(output, "resumed-snapshot.json"),
    JSON.stringify(continued.snapshot, null, 2),
  );
  await assert.rejects(
    openRetainedPersonaBrowser(page, origin, "/", {
      ...opened.session,
      principalKey: "different-principal",
    }),
    /principal is missing or changed/,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("petrinaut-sdcpn")),
    net,
  );
  assert.deepEqual(fixture.errors, []);
  process.stdout.write(
    `PASS persona browser streaming, admitted tools, construction, workpiece, tab independence, panel Stop and no replay: ${output}\n`,
  );
} catch (error) {
  await fixture?.page.screenshot({ path: join(output, "failure.png") });
  writeFileSync(
    join(output, "failure.txt"),
    `${String(error)}\n${await fixture?.page.locator("body").ariaSnapshot()}`,
  );
  process.stderr.write(
    `Browser failure evidence: ${output}\n${String(error)}\n`,
  );
  throw error;
} finally {
  finishBarrier?.resolve();
  await bridge?.close();
  await fixture?.browser.close();
  fixture?.server.closeAllConnections();
  await new Promise<void>((done) =>
    fixture ? fixture.server.close(() => done()) : done(),
  );
  await app.stop();
  globalThis.fetch = originalFetch;
}
