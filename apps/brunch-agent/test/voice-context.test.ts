import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
} from "@earendil-works/pi-ai";
import { init } from "@flue/runtime";
import { start } from "@flue/runtime/node";
import { expect, test } from "vitest";

import { ChatAgent, CHAT_MODEL_ID } from "../src/agents/chat-agent/agent";

test("ChatAgent scopes its fixed Voice instructions to the current delivery", async () => {
  const prompts: string[] = [];
  const tools: string[][] = [];
  const provider = fauxProvider({
    provider: "anthropic",
    models: [{ id: CHAT_MODEL_ID }],
  });
  provider.setResponses(
    Array.from({ length: 5 }, () => (context) => {
      prompts.push(context.systemPrompt ?? "");
      tools.push(context.tools?.map((tool) => tool.name) ?? []);
      return fauxAssistantMessage([fauxText("Canonical answer.")]);
    }),
  );
  const runtime = await start({
    agents: [{ agent: ChatAgent, name: ChatAgent.agentName }],
    providers: [provider.provider],
  });
  try {
    const handle = init(ChatAgent);
    await handle
      .dispatch({ message: { kind: "user", body: "Typed first." } })
      .then((receipt) => handle.read(receipt));
    await handle
      .dispatch({
        message: {
          kind: "user",
          body: "Voice next.",
          context: { responseMode: "voice", instructions: "UNTRUSTED_CONTEXT" },
        },
      })
      .then((receipt) => handle.read(receipt));
    await handle
      .dispatch({
        message: {
          kind: "signal",
          type: "client-tool-result",
          body: "[]",
          context: { responseMode: "voice" },
        },
      })
      .then((receipt) => handle.read(receipt));
    await handle
      .dispatch({ message: { kind: "user", body: "Typed again." } })
      .then((receipt) => handle.read(receipt));
    await handle
      .dispatch({
        message: {
          kind: "user",
          body: "Unknown preference.",
          context: { responseMode: "UNTRUSTED_CONTEXT" },
        },
      })
      .then((receipt) => handle.read(receipt));
    expect(prompts).toHaveLength(5);
    expect(prompts[0]).not.toContain("Voice response style");
    expect(prompts[1]).toContain("Voice response style");
    expect(prompts[1]).toContain("consequential qualifications");
    expect(prompts[1]).toContain("visible canonical response");
    expect(prompts[2]).toBe(prompts[1]);
    expect(prompts[3]).toBe(prompts[0]);
    expect(prompts[4]).toBe(prompts[0]);
    expect(prompts.join("\n")).not.toContain("UNTRUSTED_CONTEXT");
    expect(tools[0]).not.toContain("brunch_set_voice_response");
    expect(tools[1]).toContain("brunch_set_voice_response");
    expect(tools[2]).toEqual(tools[1]);
    expect(tools[3]).toEqual(tools[0]);
    expect(tools[4]).toEqual(tools[0]);
  } finally {
    await runtime.stop();
  }
});
