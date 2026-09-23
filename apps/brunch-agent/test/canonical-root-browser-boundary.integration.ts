/** Root canonical mutation across the built I-mode browser, transport, and server. */
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
installFauxProvider(nativeSchemaProvider(faux.provider, [], []));
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
          { id: "root-place-1" },
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
        binding?: { conversationId: string; documentId: string };
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
    ) as Record<string, { sdcpn?: { places?: { id: string }[] } }>;
    return documents[documentId]?.sdcpn?.places?.map(({ id }) => id);
  }, binding.documentId);
  const signal = deliveries.find(({ body }) => body.includes("root-place-1"));
  assert(result, "Root addPlace did not reach Flue history");
  assert.equal(result.toolName, "addPlace");
  assert.deepEqual(result.output, {
    applied: true,
    title: "Added place Queue",
    target: { kind: "selection", item: { type: "place", id: "queue" } },
  });
  assert(
    stored?.includes("queue"),
    "Root place did not persist in browser storage",
  );
  assert(signal, "No browser signal carried the root mutation result");
  assert(
    signal.body.includes("canonicalMutationRecord"),
    "Root addPlace outgoing browser signal delivered no canonical mutation record",
  );
  const record = parseClientToolResultMetadata(
    result.metadata,
  )?.canonicalMutationRecord;
  assert(record, "Root addPlace delivered no canonical mutation record");
  assert.equal(record.outcome, "applied");
  assert.equal(record.settlement.status, "settled");
  assert(
    continued,
    "Root canonical delivery was not admitted for model continuation",
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
