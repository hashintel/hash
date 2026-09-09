/** Operator-only attachment to a browser-created session; no state creation or rebinding. */
import { readFileSync } from "node:fs";

import { createFlueClient, type FlueClient } from "@flue/sdk";
import * as v from "valibot";

import {
  browserBindingSchema,
  canonicalContent,
  conversationConstructionMode,
} from "@hashintel/brunch-agent-plugin-sdcpn";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../conversation/identity.ts";
import { CHAT_AGENT_ROUTE } from "../../http/routes.ts";

import type { RegisterBrunchTurnOptions } from "./brunch-turn.ts";

const nonempty = v.pipe(v.string(), v.minLength(1));
const configSchema = v.strictObject({
  url: nonempty,
  principalKey: nonempty,
  conversationId: nonempty,
  uid: nonempty,
  // Copied unchanged from the browser's initial POST. The owning plugin
  // validates its binding below; this is not another construction schema.
  initialData: v.unknown(),
});
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const browserSessionOptions = async (
  input: unknown,
  createClient: typeof createFlueClient = createFlueClient,
): Promise<RegisterBrunchTurnOptions> => {
  const config = v.parse(configSchema, input);
  const identity = {
    principalKey: config.principalKey,
    conversationId: config.conversationId,
  };
  const url = new URL(config.url);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !==
      `/agents/${CHAT_AGENT_ROUTE}/${flueConversationIdFrom(identity)}`
  )
    throw new Error("Browser session URL/ownership mismatch");
  const data = config.initialData;
  if (
    !record(data) ||
    data.mode !== conversationConstructionMode ||
    !record(data.construction)
  ) {
    throw new Error(
      "Capture the browser's construction initialData; no mode conversion is supported",
    );
  }
  const binding = v.parse(browserBindingSchema, data.construction.binding);
  if (binding.conversationId !== identity.conversationId) {
    throw new Error("Browser binding/conversation mismatch");
  }
  const client: FlueClient = createClient({
    url: url.href,
    headers: agentOwnershipHeaders(identity),
  });
  const snapshot = await client.history();
  const bindings = snapshot.messages.filter(
    (message) =>
      message.role === "system" &&
      message.signal?.tagName === "brunch.construction-binding",
  );
  if (
    bindings.length === 0 ||
    bindings.some((message) => {
      const body = message.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("");
      const recorded: unknown = JSON.parse(body);
      return (
        !record(recorded) ||
        canonicalContent(recorded.binding) !== canonicalContent(binding)
      );
    })
  )
    throw new Error(
      "Canonical browser binding missing or mismatched; refusing attachment",
    );
  // initialData is creation-only and MUST NOT accompany a conditional continuation.
  // The first send verifies the captured UID at the actual admission boundary.
  return { conversationId: identity.conversationId, client, uid: config.uid };
};

export const readBrowserSessionOptions = (path: string) =>
  browserSessionOptions(JSON.parse(readFileSync(path, "utf8")) as unknown);
