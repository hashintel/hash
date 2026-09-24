/** Built I-mode browser → canonical Petrinaut mutation → settled Flue history. Faux provider only. */
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

import { INTEGRATED_BRUNCH_MODE } from "@hashintel/brunch-agent-plugin-sdcpn";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { isAppliedChange, netCalls } from "../src/conversation/net-changes.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import { loadBuiltBrunchApplication } from "./load-built-application.ts";
import { nativeSchemaProvider } from "./native-schema-provider.ts";

process.env.NODE_ENV = "test";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(
  mkdtempSync(join(tmpdir(), "canonical-browser-")),
  "conversation.db",
);
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
const place = {
  id: "queue",
  name: "Queue",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
  targetSubnetId: null,
};
try {
  fixture = await openBrowserFixture(app, resolve("../petrinaut-website/dist"));
  const { page, origin, deliveries, errors, blocked } = fixture;
  await page.addInitScript(() =>
    localStorage.setItem("petrinaut-website:assistant", "brunch"),
  );
  await page.goto(`${origin}/`);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("getLatestNetDefinition", {}, { id: "read-before" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [fauxToolCall("addPlace", place, { id: "add-queue" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [fauxToolCall("getLatestNetDefinition", {}, { id: "read-after" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([fauxText("Queue was added.")]),
  ]);
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  await composer.fill(
    "Add a Queue place to the empty net and read the result.",
  );
  await composer.press("Enter");
  await page
    .getByText("Queue was added.", { exact: true })
    .waitFor({ timeout: 40_000 });
  const first = JSON.parse(deliveries[0]?.body ?? "null") as {
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
  };
  assert.equal(first.initialData?.mode, INTEGRATED_BRUNCH_MODE);
  const binding = first.initialData.construction?.binding;
  assert(binding);
  const principalKey = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) =>
      entry.includes("principal"),
    );
    const raw = key === undefined ? null : localStorage.getItem(key);
    return raw?.startsWith('"') ? (JSON.parse(raw) as string) : raw;
  });
  assert(principalKey);
  const identity = { principalKey, conversationId: binding.conversationId };
  const client = createFlueClient({
    url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
    headers: agentOwnershipHeaders(identity),
  });
  const calls = netCalls(await client.history());
  assert.deepEqual(
    calls.map(({ toolCallId }) => toolCallId),
    ["read-before", "add-queue", "read-after"],
  );
  const [before, mutation, after] = calls;
  assert(before && mutation && after);
  assert.equal(before.revisionAfter, undefined);
  assert.equal(mutation.revisionBefore, before.revisionBefore);
  assert.equal(isAppliedChange(mutation), true);
  assert.equal(after.revisionBefore, mutation.revisionAfter);
  assert.equal(after.revisionAfter, undefined);
  assert.deepEqual(
    (
      after.output as { definition: { places: { id: string }[] } }
    ).definition.places.map(({ id }) => id),
    ["queue"],
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
