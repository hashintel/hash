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
  const provider = fauxProvider({
    provider: "anthropic",
    models: [{ id: CHAT_MODEL_ID }],
  });
  provider.setResponses(
    Array.from({ length: 6 }, () => (context) => {
      prompts.push(context.systemPrompt ?? "");
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
      .dispatch({
        message: {
          kind: "user",
          body: "Explain the source's unresolved question.",
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
    expect(prompts).toHaveLength(6);
    expect(prompts[0]).not.toContain("Voice response presentation");
    expect(prompts[1]).toContain("Voice response presentation");
    expect(prompts[1]).toContain(
      "complete canonical on-screen response normally",
    );
    expect(prompts[1]).toContain("marked question in its exact wording");
    expect(prompts[1]).toContain(
      "Realtime rephrases the completed response later",
    );
    expect(prompts[1]).not.toContain("Respond conversationally and concisely");
    expect(prompts[1]).not.toContain("one or two spoken sentences");
    expect(prompts[1]).not.toContain("offers to read long responses");
    expect(prompts[2]).toBe(prompts[1]);
    expect(prompts[3]).toBe(prompts[1]);
    expect(prompts[4]).toBe(prompts[0]);
    expect(prompts[5]).toBe(prompts[0]);
    // These assertions pin producer instructions, not faux-provider compliance.
    const markerInstruction =
      "Before presenting a direct question for the person to answer, call brunch_mark_question with its exact text";
    expect(prompts[0]).not.toContain(markerInstruction);
    expect(prompts[1]).toContain(markerInstruction);
    expect(prompts[1]).toContain(
      "A source-attributed or repeated question still needs a marker when you ask the person to answer it",
    );
    expect(prompts[1]).toContain(
      "Do not mark quoted questions you are only discussing, rhetorical questions, or headings",
    );
    expect(prompts[1]).toContain(
      "An unmarked question may be omitted from the spoken rephrasing",
    );
    expect(prompts.join("\n")).not.toContain("UNTRUSTED_CONTEXT");
  } finally {
    await runtime.stop();
  }
});
