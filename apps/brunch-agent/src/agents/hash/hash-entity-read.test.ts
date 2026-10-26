/**
 * The HASH agent's entity read through a real in-process Flue runtime and
 * agent loop with a scripted model: the agent registers it, a call is issued
 * to the bound browser as a read, and what the browser settles it with is what
 * the model sees next. The test plays the browser through the real
 * rendezvous. No provider is called.
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
  browserNetToolNames,
  brunchTools,
  canonicalContent,
} from "@hashintel/brunch-agent";

import {
  claimBrowserCall,
  failBrowserCall,
  settleBrowserCall,
} from "../../shared/conversation/browser-call-rendezvous.ts";

// Only the Flue build packages skills; the read doesn't depend on their content.
vi.mock("./skills/eliciting/SKILL.md", () => ({
  default: { name: "eliciting", description: "Eliciting.", instructions: "." },
}));
vi.mock("./skills/modelling/SKILL.md", () => ({
  default: { name: "modelling", description: "Modelling.", instructions: "." },
}));
vi.mock("./skills/petrinaut/SKILL.md", () => ({
  default: { name: "petrinaut", description: "Petrinaut.", instructions: "." },
}));

type Step = (context: TranscriptContext) => AssistantMessage;

const faux = fauxProvider({ provider: "faux", models: [{ id: "faux-1" }] });
const requests: TranscriptContext[] = [];
const steps: Step[] = [];
faux.setResponses(
  Array.from({ length: 20 }, () => (context: TranscriptContext) => {
    requests.push(structuredClone(context));
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

/** A fresh document-bound conversation, with nothing read yet. */
const conversation = () => {
  const instanceId = crypto.randomUUID();
  const binding = { conversationId: instanceId, documentId: "web~net" };
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

const readInput = { entityTypes: ["Supplier"], traversalDepth: 1 };
const supplier = {
  entityId: "alice-web~supplier",
  editionId: "edition-1",
  webId: "alice-web",
  entityTypeIds: ["https://hash.ai/@alice/types/entity-type/supplier/v/1"],
  properties: {
    "https://hash.ai/@alice/types/property-type/name/": "Acme Parts",
  },
  draft: false,
  matched: true,
};

test("the agent offers the read, issues it as a read in a fresh conversation, and the model next sees what the page returned", async () => {
  const chat = conversation();
  let seen: string | undefined;
  let declared: string[] = [];
  steps.push(
    (context) => {
      const [lead] = context.messages;
      declared =
        lead?.role === "system"
          ? (lead.toolsAdded ?? []).map(({ name }) => name)
          : [];
      return fauxAssistantMessage(
        [fauxToolCall(brunchTools.queryHashEntities, readInput, { id: "r1" })],
        { stopReason: "toolUse" },
      );
    },
    (context) => {
      seen = resultText(context, "r1");
      return fauxAssistantMessage([fauxText("Acme Parts is on record.")]);
    },
  );
  const receipt = await chat.send("Who supplies us?");

  // No net was read, yet the call is issued, with no revision to hold it to.
  const claim = await claimed(chat.instanceId, "r1", chat.binding);
  const { capability: _capability, ...issued } = claim;
  expect(issued).toEqual({
    toolName: brunchTools.queryHashEntities,
    input: readInput,
    binding: canonicalContent(chat.binding),
  });
  expect(
    settleBrowserCall({
      instanceId: chat.instanceId,
      toolCallId: "r1",
      capability: claim.capability,
      binding: claim.binding,
      toolName: brunchTools.queryHashEntities,
      canonicalInput: claim.input,
      output: { entities: [supplier] },
      metadata: { documentRevision: { before: "r1" } },
    }),
  ).toBe("settled");
  await chat.wait(receipt, { signal: AbortSignal.timeout(10_000) });

  expect(declared).toContain(brunchTools.queryHashEntities);
  // The model sees the page's entities, edition evidence included, and none
  // of the browser sidecar.
  expect(seen).toBe(JSON.stringify({ entities: [supplier] }));
  expect(browserNetToolNames.has(brunchTools.queryHashEntities)).toBe(false);
});

test("a read that finds nothing the user may see tells the model so", async () => {
  const chat = conversation();
  let seen: string | undefined;
  steps.push(
    () =>
      fauxAssistantMessage(
        [
          fauxToolCall(
            brunchTools.queryHashEntities,
            { webIds: ["alice-web"] },
            { id: "r2" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
    (context) => {
      seen = resultText(context, "r2");
      return fauxAssistantMessage([fauxText("Nothing there.")]);
    },
  );
  const receipt = await chat.send("What's in Alice's web?");
  const claim = await claimed(chat.instanceId, "r2", chat.binding);
  settleBrowserCall({
    instanceId: chat.instanceId,
    toolCallId: "r2",
    capability: claim.capability,
    binding: claim.binding,
    toolName: brunchTools.queryHashEntities,
    canonicalInput: claim.input,
    output: { entities: [] },
  });
  await chat.wait(receipt, { signal: AbortSignal.timeout(10_000) });

  expect(JSON.parse(seen ?? "null")).toEqual({
    entities: [],
    note: "No entities matched that the signed-in user can see.",
  });
});

test("a read whose query fails in the page reaches the model as a tool error that left the document unchanged", async () => {
  const chat = conversation();
  let failed: Extract<Message, { role: "toolResult" }> | undefined;
  steps.push(
    () =>
      fauxAssistantMessage(
        [fauxToolCall(brunchTools.queryHashEntities, readInput, { id: "r3" })],
        { stopReason: "toolUse" },
      ),
    (context) => {
      failed = toolResult(context, "r3");
      return fauxAssistantMessage([fauxText("The read failed.")]);
    },
  );
  const receipt = await chat.send("Who supplies us?");
  const claim = await claimed(chat.instanceId, "r3", chat.binding);
  expect(
    failBrowserCall({
      instanceId: chat.instanceId,
      toolCallId: "r3",
      capability: claim.capability,
      binding: claim.binding,
      toolName: brunchTools.queryHashEntities,
      canonicalInput: claim.input,
      disposition: "failed",
    }),
  ).toBe(true);
  await chat.wait(receipt, { signal: AbortSignal.timeout(10_000) });

  expect(failed?.isError).toBe(true);
  expect(JSON.stringify(failed?.content)).toContain(
    "The non-mutating browser call failed; the document is unchanged.",
  );
});

test("a depth beyond the cap never reaches the browser", async () => {
  const chat = conversation();
  let rejected: Extract<Message, { role: "toolResult" }> | undefined;
  steps.push(
    () =>
      fauxAssistantMessage(
        [
          fauxToolCall(
            brunchTools.queryHashEntities,
            { traversalDepth: 6 },
            { id: "r4" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
    (context) => {
      rejected = toolResult(context, "r4");
      return fauxAssistantMessage([fauxText("Too deep.")]);
    },
  );
  const receipt = await chat.send("Read everything.");
  await chat.wait(receipt, { signal: AbortSignal.timeout(10_000) });

  expect(rejected?.isError).toBe(true);
  expect(
    claimBrowserCall(chat.instanceId, "r4", canonicalContent(chat.binding)),
  ).toBeUndefined();
});
