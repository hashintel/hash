/**
 * The HASH agent's save through a real in-process Flue runtime and agent loop
 * with a scripted model: it is issued to the bound browser as a document
 * change, held to the model's last view of the net, and what the browser
 * settles it with is what the model sees next. The test plays the browser
 * through the real rendezvous. No provider is called.
 */
import {
  type AssistantMessage,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Message,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { start } from "@flue/runtime/node";
import { createAgentRouter } from "@flue/runtime/routing";
import { createFlueClient } from "@flue/sdk";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

import {
  type BrowserCallClaim,
  type BrowserCallFailureDisposition,
  brunchTools,
  canonicalContent,
} from "@hashintel/brunch-agent";

import {
  claimBrowserCall,
  failBrowserCall,
  settleBrowserCall,
} from "../../shared/conversation/browser-call-rendezvous.ts";

// Only the Flue build packages skills; the save doesn't depend on their content.
vi.mock("./skills/eliciting/SKILL.md", () => ({
  default: { name: "eliciting", description: "Eliciting.", instructions: "." },
}));
vi.mock("./skills/modelling/SKILL.md", () => ({
  default: { name: "modelling", description: "Modelling.", instructions: "." },
}));
vi.mock("./skills/petrinaut/SKILL.md", () => ({
  default: { name: "petrinaut", description: "Petrinaut.", instructions: "." },
}));
vi.mock("./skills/hash-graph/SKILL.md", () => ({
  default: {
    name: "hash-graph",
    description: "HASH graph.",
    instructions: ".",
  },
}));

type Step = (context: TranscriptContext) => AssistantMessage;

const faux = fauxProvider({ provider: "faux", models: [{ id: "faux-1" }] });
const steps: Step[] = [];
faux.setResponses(
  Array.from({ length: 40 }, () => (context: TranscriptContext) => {
    const step = steps.shift();
    if (!step) throw new Error("The script ran out of scripted agent steps.");
    return step(context);
  }),
);

const toolResult = (context: TranscriptContext, toolCallId: string) =>
  context.messages.find(
    (message): message is Extract<Message, { role: "toolResult" }> =>
      message.role === "toolResult" && message.toolCallId === toolCallId,
  );
const resultText = (context: TranscriptContext, toolCallId: string) =>
  toolResult(context, toolCallId)
    ?.content.flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");

let hashAgent: Parameters<typeof createAgentRouter>[0];
let stopRuntime: () => Promise<void> = async () => {};
beforeAll(async () => {
  vi.stubEnv("BRUNCH_CHAT_MODEL", "faux/faux-1");
  vi.stubEnv("BRUNCH_CHAT_THINKING", "");
  const { HashAgent } = await import("./agent.ts");
  hashAgent = HashAgent;
  const flue = await start({ agents: [HashAgent], providers: [faux.provider] });
  stopRuntime = () => flue.stop();
});
afterAll(async () => {
  await stopRuntime();
  vi.unstubAllEnvs();
});

const documentId = "web~net";
const saveInput = { documentId };

/** A fresh document-bound conversation, with nothing read yet. */
const conversation = () => {
  const instanceId = crypto.randomUUID();
  const binding = { conversationId: instanceId, documentId };
  const router = createAgentRouter(hashAgent);
  const client = createFlueClient({
    url: `http://flue.test/${instanceId}`,
    fetch: async (input, init) =>
      router.fetch(input instanceof Request ? input : new Request(input, init)),
  });
  return {
    instanceId,
    binding,
    send: async (body: string) =>
      client.send({
        initialData: { binding },
        message: { kind: "user", body },
      }),
    wait: client.wait.bind(client),
  };
};

/** Claims a call as the bound browser does, once the agent has issued it. */
const claimed = async (
  instanceId: string,
  toolCallId: string,
  binding: object,
): Promise<BrowserCallClaim> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const claim = claimBrowserCall(
      instanceId,
      toolCallId,
      canonicalContent(binding),
    );
    if (claim) return claim;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Browser call ${toolCallId} was never issued.`);
};

test("a save with no view of the net in context is refused as not started and never issued", async () => {
  const chat = conversation();
  let refused: Extract<Message, { role: "toolResult" }> | undefined;
  steps.push(
    () =>
      fauxAssistantMessage(
        [fauxToolCall(brunchTools.saveHashNet, saveInput, { id: "s0" })],
        { stopReason: "toolUse" },
      ),
    (context) => {
      refused = toolResult(context, "s0");
      return fauxAssistantMessage([fauxText("I need to read the net.")]);
    },
  );
  const receipt = await chat.send("Save it.");
  await chat.wait(receipt, { signal: AbortSignal.timeout(10_000) });

  expect(refused?.isError).toBe(true);
  expect(JSON.stringify(refused?.content)).toContain(
    "Not started: no current view of the net is in your context",
  );
  expect(
    claimBrowserCall(chat.instanceId, "s0", canonicalContent(chat.binding)),
  ).toBeUndefined();
});

/**
 * Reads the net at revision `r1`, then saves, and settles the save as the
 * browser does: with `output`, or failed with `disposition`. Returns the
 * save's claim and the result the model saw next.
 */
const saveAfterRead = async (
  settle:
    | { readonly output: unknown }
    | { readonly disposition: BrowserCallFailureDisposition },
) => {
  const chat = conversation();
  let seen: Extract<Message, { role: "toolResult" }> | undefined;
  let seenText: string | undefined;
  steps.push(
    () =>
      fauxAssistantMessage([fauxToolCall("readNetOutline", {}, { id: "n1" })], {
        stopReason: "toolUse",
      }),
    () =>
      fauxAssistantMessage(
        [fauxToolCall(brunchTools.saveHashNet, saveInput, { id: "s1" })],
        { stopReason: "toolUse" },
      ),
    (context) => {
      seen = toolResult(context, "s1");
      seenText = resultText(context, "s1");
      return fauxAssistantMessage([fauxText("Done.")]);
    },
  );
  const receipt = await chat.send("Save the net.");
  const read = await claimed(chat.instanceId, "n1", chat.binding);
  expect(
    settleBrowserCall({
      instanceId: chat.instanceId,
      toolCallId: "n1",
      capability: read.capability,
      binding: read.binding,
      toolName: "readNetOutline",
      canonicalInput: read.input,
      output: { title: "Replenishment", definition: {}, extensions: {} },
      metadata: { documentRevision: { before: "r1" } },
    }),
  ).toBe("settled");

  const claim = await claimed(chat.instanceId, "s1", chat.binding);
  const call = {
    instanceId: chat.instanceId,
    toolCallId: "s1",
    capability: claim.capability,
    binding: claim.binding,
    toolName: brunchTools.saveHashNet,
    canonicalInput: claim.input,
  };
  if ("output" in settle)
    expect(settleBrowserCall({ ...call, output: settle.output })).toBe(
      "settled",
    );
  else
    expect(failBrowserCall({ ...call, disposition: settle.disposition })).toBe(
      true,
    );
  await chat.wait(receipt, { signal: AbortSignal.timeout(10_000) });
  return { claim, seen, seenText };
};

const saved = {
  saved: true,
  decisionTime: "2026-10-24T01:00:00.000Z",
  title: "Replenishment",
  stillDirty: true,
};

test("a save is issued as a change against the model's last view, and the model next sees the page's result", async () => {
  const { claim, seenText } = await saveAfterRead({ output: saved });
  const { capability: _capability, ...issued } = claim;
  expect(issued).toEqual({
    toolName: brunchTools.saveHashNet,
    input: saveInput,
    binding: claim.binding,
    expectedRevision: "r1",
  });
  expect(JSON.parse(seenText ?? "null")).toEqual(saved);
});

test("an unconfirmed save tells the model it is not confirmed and not to save again until asked", async () => {
  const { seenText } = await saveAfterRead({
    output: { saved: false, error: "Failed to fetch" },
  });
  expect(JSON.parse(seenText ?? "null")).toEqual({
    saved: false,
    error: "Failed to fetch",
    note: "The save is not confirmed: a version may or may not have been written. Tell the user, who can check the version list, and don't call save_hash_net again until they ask.",
  });
});

test("a save the user declined or the page refused tells the model nothing was saved, and why", async () => {
  const { seenText } = await saveAfterRead({
    output: {
      applied: false,
      reason: "The user declined this save; nothing was saved.",
    },
  });
  expect(JSON.parse(seenText ?? "null")).toEqual({
    saved: false,
    reason: "The user declined this save; nothing was saved.",
    note: "The save did not start; nothing was saved.",
  });
});

test("a save the browser refused as stale reaches the model as not started", async () => {
  const { seen } = await saveAfterRead({ disposition: "stale" });
  expect(seen?.isError).toBe(true);
  expect(JSON.stringify(seen?.content)).toContain(
    "Not started: the document changed by other means after your last view of the net.",
  );
});

test("a save that failed after it started reaches the model as an effect that is unknown", async () => {
  const { seen } = await saveAfterRead({ disposition: "failed" });
  expect(seen?.isError).toBe(true);
  expect(JSON.stringify(seen?.content)).toContain(
    "an attempted document effect is unknown",
  );
});
