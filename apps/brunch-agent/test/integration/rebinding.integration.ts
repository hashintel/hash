/**
 * T3: a later send can't rebind a conversation. The conversation is created
 * bound to net X; a later send carries a binding to net Y; the model then
 * calls a browser tool. The call is issued with X's binding, Y's claim gets
 * 404, and the model is told the call was not started. Exercises the real
 * built Flue mount with a local scripted model; no provider calls.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import {
  agentOwnershipHeaders,
  brunchRoutes,
  canonicalContent,
  netReaderToolNames,
  type BrowserCallClaim,
} from "@hashintel/brunch-agent";
import { installFauxProvider } from "@local/pi-faux-providers/install-faux-provider";

import { BROWSER_CALL_UNSTARTED_ERROR } from "../../src/shared/conversation/browser-call-rendezvous.ts";
import { flueConversationId } from "../../src/shared/conversation/identity.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";

const directory = mkdtempSync(join(tmpdir(), "brunch-rebinding-"));
process.env.NODE_ENV = "test";
process.env.OTEL_SDK_DISABLED = "true";
process.env.BRUNCH_DEV_DB_PATH = join(directory, "conversation.db");
process.env.BRUNCH_DB_KIND = "sqlite";
process.env.BRUNCH_CHAT_MODEL = "openai/gpt-5.5-2026-04-23";
process.env.BRUNCH_STEP_A_ACCOUNTING = "";
delete process.env.HASH_OTLP_ENDPOINT;

const faux = fauxProvider({ provider: "openai" });
installFauxProvider(faux.provider);
const application = await loadBuiltBrunchApplication();
const identity = {
  ownerKey: "rebinding-owner",
  conversationId: `rebinding-${crypto.randomUUID()}`,
};
const bindingX = { conversationId: identity.conversationId, documentId: "X" };
const bindingY = { conversationId: identity.conversationId, documentId: "Y" };
const conversationUrl = `http://brunch.local/agents/petrinaut/${flueConversationId(identity)}`;
const routerFetch = async (input: RequestInfo | URL, init?: RequestInit) =>
  application.fetch(
    input instanceof Request ? input : new Request(input, init),
  );
const client = createFlueClient({
  url: conversationUrl,
  headers: agentOwnershipHeaders(identity),
  fetch: routerFetch,
});
const claim = (toolCallId: string, binding: typeof bindingX) =>
  routerFetch(
    `${conversationUrl}/${brunchRoutes.browserCalls}/${toolCallId}?binding=${encodeURIComponent(canonicalContent(binding))}`,
    { headers: agentOwnershipHeaders(identity) },
  );

const toolResultText = (context: TranscriptContext, toolCallId: string) => {
  const result = context.messages.find(
    (message) =>
      message.role === "toolResult" && message.toolCallId === toolCallId,
  );
  assert(result?.role === "toolResult", `No result for ${toolCallId}`);
  return result.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
};

try {
  // Created bound to X.
  faux.setResponses([() => fauxAssistantMessage([fauxText("Ready.")])]);
  await client.wait(
    await client.send({
      initialData: { binding: bindingX },
      message: { kind: "user", body: "Let's model the support desk." },
    }),
  );

  // A later send names Y; the model reads the net.
  let readResult: string | undefined;
  faux.setResponses([
    () =>
      fauxAssistantMessage(
        [fauxToolCall(netReaderToolNames.outline, {}, { id: "rebound-read" })],
        { stopReason: "toolUse" },
      ),
    (context) => {
      readResult = toolResultText(context, "rebound-read");
      return fauxAssistantMessage([fauxText("Stopped there.")]);
    },
  ]);
  const admission = await client.send({
    initialData: { binding: bindingY },
    message: { kind: "user", body: "Now look at the other net." },
  });

  // Y's claim never finds the call; X's does, with X's binding.
  let issued: BrowserCallClaim | undefined;
  const yStatuses = new Set<number>();
  for (let attempt = 0; attempt < 200 && !issued; attempt++) {
    const fromY = await claim("rebound-read", bindingY);
    yStatuses.add(fromY.status);
    const fromX = await claim("rebound-read", bindingX);
    if (fromX.ok) issued = (await fromX.json()) as BrowserCallClaim;
    else await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert(issued, "The read was never issued for X's binding.");
  assert.equal(issued.binding, canonicalContent(bindingX));
  assert.deepEqual([...yStatuses], [404]);
  assert.equal((await claim("rebound-read", bindingY)).status, 404);

  // X's editor isn't the one the person is in: it reports the call unstarted.
  const failed = await routerFetch(
    `${conversationUrl}/${brunchRoutes.browserCalls}/rebound-read/fail`,
    {
      method: "POST",
      headers: {
        ...agentOwnershipHeaders(identity),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        capability: issued.capability,
        binding: issued.binding,
        toolName: netReaderToolNames.outline,
        canonicalInput: issued.input,
        disposition: "unstarted",
      }),
    },
  );
  assert.equal(failed.status, 200);
  await client.wait(admission);
  assert(
    readResult?.includes(BROWSER_CALL_UNSTARTED_ERROR),
    `The model was told: ${readResult}`,
  );
  process.stdout.write("REBINDING_PASS\n");
} finally {
  await application.stop();
  rmSync(directory, { recursive: true, force: true });
}
