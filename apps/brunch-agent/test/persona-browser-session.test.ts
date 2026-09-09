import {
  type createFlueClient,
  type FlueClient,
  type FlueConversationSnapshot,
} from "@flue/sdk";
import { describe, expect, test, vi } from "vitest";

import { conversationConstructionMode } from "@hashintel/brunch-agent-plugin-sdcpn";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity";
import { browserSessionOptions } from "../src/evaluations/persona/browser-session";

const identity = { principalKey: "TEST-owner", conversationId: "TEST-browser" };
const binding = {
  conversationId: identity.conversationId,
  documentId: "TEST-document",
  incarnationId: "TEST-incarnation",
};
const config = {
  ...identity,
  url: `http://127.0.0.1:3002/agents/chat/${flueConversationIdFrom(identity)}`,
  uid: "TEST-runtime-uid",
  initialData: {
    mode: conversationConstructionMode,
    construction: { binding },
  },
};
const snapshot: FlueConversationSnapshot = {
  v: 1,
  conversationId: "runtime-conversation-not-the-instance-id",
  offset: "opaque",
  settlements: [],
  messages: [
    {
      id: "binding-signal",
      role: "system",
      purpose: "dispatch",
      display: "hidden",
      signal: { tagName: "brunch.construction-binding" },
      parts: [
        { type: "text", state: "done", text: JSON.stringify({ binding }) },
      ],
    },
  ],
};
const fixture = (value = snapshot) => {
  const client = {
    url: config.url,
    history: vi.fn<FlueClient["history"]>().mockResolvedValue(value),
    send: vi.fn<FlueClient["send"]>(),
    read: vi.fn<FlueClient["read"]>(),
    wait: vi.fn<FlueClient["wait"]>(),
    abort: vi.fn<FlueClient["abort"]>(),
    observe: vi.fn<FlueClient["observe"]>(),
    attachmentUrl: vi.fn<FlueClient["attachmentUrl"]>(),
  } satisfies FlueClient;
  const createClient = vi.fn<typeof createFlueClient>().mockReturnValue(client);
  return { client, createClient };
};
describe("operator browser attachment", () => {
  test("uses actual ownership and a captured UID; never bootstraps an existing session", async () => {
    const { client, createClient } = fixture();
    const options = await browserSessionOptions(config, createClient);
    expect(createClient).toHaveBeenCalledExactlyOnceWith({
      url: config.url,
      headers: agentOwnershipHeaders(identity),
    });
    expect(options).toEqual({
      client,
      uid: config.uid,
      conversationId: identity.conversationId,
    });
    expect(client.send).not.toHaveBeenCalled();
    expect(options).not.toHaveProperty("initialData");
  });
  test("refuses identity mismatch before any HTTP request", async () => {
    const { createClient } = fixture();
    await expect(
      browserSessionOptions(
        { ...config, principalKey: "foreign" },
        createClient,
      ),
    ).rejects.toThrow(/ownership mismatch/u);
    expect(createClient).not.toHaveBeenCalled();
  });
  test("refuses missing and changed canonical bindings instead of rebinding", async () => {
    for (const messages of [
      [],
      [
        {
          ...snapshot.messages[0]!,
          parts: [
            {
              type: "text" as const,
              state: "done" as const,
              text: JSON.stringify({
                binding: { ...binding, incarnationId: "different" },
              }),
            },
          ],
        },
      ],
    ]) {
      const { client, createClient } = fixture({ ...snapshot, messages });
      await expect(browserSessionOptions(config, createClient)).rejects.toThrow(
        /binding missing or mismatched/u,
      );
      expect(client.send).not.toHaveBeenCalled();
    }
  });
  test("refuses foreign binding conversation, mode conversion and non-allowlisted config", async () => {
    const { createClient } = fixture();
    await expect(
      browserSessionOptions(
        {
          ...config,
          initialData: {
            mode: conversationConstructionMode,
            construction: {
              binding: { ...binding, conversationId: "foreign" },
            },
          },
        },
        createClient,
      ),
    ).rejects.toThrow(/binding\/conversation mismatch/u);
    await expect(
      browserSessionOptions({ ...config, initialData: {} }, createClient),
    ).rejects.toThrow(/no mode conversion/u);
    await expect(
      browserSessionOptions(
        { ...config, authorization: "never accepted" },
        createClient,
      ),
    ).rejects.toThrow(/Invalid key/u);
    expect(createClient).not.toHaveBeenCalled();
  });
});
