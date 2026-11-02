/**
 * HASH's Petrinaut tools through a real in-process Flue runtime and agent loop
 * with a scripted model: a call naming the page's editor is issued to the
 * bound browser as a document change against the model's last view of the
 * net, and the model next sees the net read back; a call naming any other
 * editor is not started and never issued. The test plays the browser through
 * the real rendezvous. No provider is called.
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
  canonicalContent,
  hashProcessEditorId,
} from "@hashintel/brunch-agent";

import {
  claimBrowserCall,
  settleBrowserCall,
} from "../../shared/conversation/browser-call-rendezvous.ts";

// Only the Flue build packages skills; these tools don't depend on their content.
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
  Array.from({ length: 20 }, () => (context: TranscriptContext) => {
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

const toolName = "petrinaut_create_place";
const place = {
  id: "queue",
  name: "Queue",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};

/** Claims a call as the bound browser does, once the agent has issued it. */
const claimed = async (
  instanceId: string,
  toolCallId: string,
  binding: string,
): Promise<BrowserCallClaim> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const claim = claimBrowserCall(instanceId, toolCallId, binding);
    if (claim) return claim;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Browser call ${toolCallId} was never issued.`);
};

/**
 * In a fresh document-bound conversation, reads the net at revision `r1`,
 * then creates a place on the editor `editorId` names. Returns the tool
 * result the model saw next and the instance's ids.
 */
const createPlaceAfterRead = async (
  editorId: string,
  browser?: (call: {
    instanceId: string;
    binding: string;
  }) => Promise<BrowserCallClaim>,
) => {
  const instanceId = crypto.randomUUID();
  const binding = { conversationId: instanceId, documentId: "web~net" };
  const router = createAgentRouter(hashAgent);
  const client = createFlueClient({
    url: `http://flue.test/${instanceId}`,
    fetch: async (input, init) =>
      router.fetch(input instanceof Request ? input : new Request(input, init)),
  });
  let seen: Extract<Message, { role: "toolResult" }> | undefined;
  steps.push(
    () =>
      fauxAssistantMessage([fauxToolCall("readNetOutline", {}, { id: "n1" })], {
        stopReason: "toolUse",
      }),
    () =>
      fauxAssistantMessage(
        [
          fauxToolCall(
            toolName,
            { editor_id: editorId, ...place },
            { id: "p1" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
    (context) => {
      seen = toolResult(context, "p1");
      return fauxAssistantMessage([fauxText("Done.")]);
    },
  );
  const receipt = await client.send({
    initialData: { binding },
    message: { kind: "user", body: "Add a queue." },
  });
  const issuedBinding = canonicalContent(binding);
  const read = await claimed(instanceId, "n1", issuedBinding);
  expect(
    settleBrowserCall({
      instanceId,
      toolCallId: "n1",
      capability: read.capability,
      binding: read.binding,
      toolName: "readNetOutline",
      canonicalInput: read.input,
      output: { title: "Replenishment", definition: {}, extensions: {} },
      metadata: { documentRevision: { before: "r1" } },
    }),
  ).toBe("settled");
  const claim = await browser?.({ instanceId, binding: issuedBinding });
  await client.wait(receipt, { signal: AbortSignal.timeout(10_000) });
  return { seen, claim, instanceId, issuedBinding };
};

const readBack = {
  places: [
    {
      id: "queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
    },
  ],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

test("a call naming the page's editor is issued as a change against the model's last view, and the model next sees the net read back", async () => {
  const output = { applied: true, title: "Added place Queue" };
  const { seen, claim } = await createPlaceAfterRead(
    hashProcessEditorId,
    async ({ instanceId, binding }) => {
      const issued = await claimed(instanceId, "p1", binding);
      expect(
        settleBrowserCall({
          instanceId,
          toolCallId: "p1",
          capability: issued.capability,
          binding: issued.binding,
          toolName,
          canonicalInput: issued.input,
          output,
          metadata: {
            documentRevision: { before: "r1", after: "r2" },
            readBack,
          },
        }),
      ).toBe("settled");
      return issued;
    },
  );
  const { capability: _capability, ...issued } = claim ?? {};
  expect(issued).toMatchObject({
    toolName,
    input: { editor_id: hashProcessEditorId, name: "Queue" },
    expectedRevision: "r1",
  });
  expect(seen?.isError).toBe(false);
  const text = seen?.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  expect(JSON.parse(text ?? "null")).toEqual({
    output,
    netAfterChanges: readBack,
  });
});

test("a call naming another editor is not started and never issued", async () => {
  const { seen, instanceId, issuedBinding } =
    await createPlaceAfterRead("another-editor");
  expect(seen?.isError).toBe(true);
  expect(JSON.stringify(seen?.content)).toContain(
    `Not started: editor_id \\"another-editor\\" names no open editor; the open editor is \\"${hashProcessEditorId}\\".`,
  );
  expect(claimBrowserCall(instanceId, "p1", issuedBinding)).toBeUndefined();
});
