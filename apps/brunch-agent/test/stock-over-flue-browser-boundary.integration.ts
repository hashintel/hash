/** Stock's canonical tools through the built F-mode browser and Flue transport. */
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

import { STOCK_OVER_FLUE_MODE } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import {
  nativeSchemaProvider,
  type NativeRequestCapture,
} from "./native-schema-provider.ts";

const output = mkdtempSync(join(tmpdir(), "stock-over-flue-browser-"));
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
const captures: NativeRequestCapture[] = [];
installFauxProvider(nativeSchemaProvider(faux.provider, captures, []));
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
          { id: "f-place-1" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([fauxText("Stock-over-Flue place finished.")]),
  ]);
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  await composer.fill("Add a Queue place directly to this empty net.");
  await composer.press("Enter");
  await page
    .getByText("Stock-over-Flue place finished.", { exact: true })
    .waitFor({ timeout: 30_000 });

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
  assert.equal(first.initialData?.mode, STOCK_OVER_FLUE_MODE);
  const binding = first.initialData.construction?.binding;
  assert(binding, "Missing actual F-mode browser conversation binding");
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
  const history = await client.history();
  const results = clientToolHistoryFrom(history.messages).results;
  assert.deepEqual(
    results.map(({ toolName }) => toolName),
    ["addPlace"],
  );
  const result = results.find(({ toolCallId }) => toolCallId === "f-place-1");
  assert(result, "No Flue result for canonical F-mode addPlace");
  assert.deepEqual(result.output, {
    applied: true,
    title: "Added place Queue",
    target: { kind: "selection", item: { type: "place", id: "queue" } },
  });
  assert.equal(
    result.metadata,
    undefined,
    "F must not attach a Brunch mutation record",
  );
  const issued = history.messages
    .flatMap((message) =>
      message.role === "assistant" && message.purpose === "assistant"
        ? message.parts
        : [],
    )
    .filter((part) => part.type === "dynamic-tool");
  assert.deepEqual(
    issued.map(({ toolName }) => toolName),
    ["addPlace"],
    "F must not issue Brunch Ledger or projection tools",
  );
  assert.equal(issued[0]?.state, "output-available");
  const stored = await page.evaluate((documentId) => {
    const documents = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<
      string,
      { incarnationId: string; sdcpn: { places: { id: string }[] } }
    >;
    return documents[documentId];
  }, binding.documentId);
  assert.equal(stored?.incarnationId, binding.incarnationId);
  assert(stored.sdcpn.places.some(({ id }) => id === "queue"));
  assert.equal(await page.getByRole("tab", { name: /^Ledger/u }).count(), 0);

  const canonicalNames = Object.keys(petrinautAiTools);
  assert(canonicalNames.includes("createExperiment"));
  const providerNames = captures[0]?.serialized.tools
    .map(({ name }) => name)
    .filter((name) => name !== "task");
  assert.deepEqual(providerNames, canonicalNames);
  for (const absent of [
    "mutate_workpiece",
    "read_workpiece",
    "draft_petrinaut_experiment",
    "declare_petrinaut_projection",
    "apply_petrinaut_construction",
  ])
    assert(!providerNames.includes(absent), `F unexpectedly exposed ${absent}`);
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  process.stdout.write("STOCK_OVER_FLUE_BROWSER_BOUNDARY_PASS\n");
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
