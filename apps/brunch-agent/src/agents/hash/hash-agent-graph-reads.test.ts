/**
 * The HASH agent's graph reads through a real in-process Flue runtime and
 * agent loop with a scripted model: the agent registers them, a call is issued
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
  type ClientToolResult,
  type HashEntityCountInput,
  type HashEntityCountJoinResult,
  type HashEntityReadInput,
  type HashEntityReadResult,
  type HashEntityTypeReadResult,
  brunchTools,
  canonicalContent,
  hashProcessEditorId,
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
vi.mock("./skills/hash-graph/SKILL.md", () => ({
  default: {
    name: "hash-graph",
    description: "HASH graph.",
    instructions: ".",
  },
}));

type Step = (context: TranscriptContext) => AssistantMessage;

const faux = fauxProvider({ provider: "faux", models: [{ id: "faux-1" }] });
const requests: TranscriptContext[] = [];
const steps: Step[] = [];
faux.setResponses(
  Array.from({ length: 60 }, () => (context: TranscriptContext) => {
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

let hashAgent: typeof import("./agent.ts").HashAgent;
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
    const claim = claimBrowserCall({
      agentName: hashAgent.agentName,
      instanceId,
      toolCallId,
      binding: canonicalContent(binding),
    });
    if (claim) return claim;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Browser call ${toolCallId} was never issued.`);
};

const readInput = { entityTypes: ["Supplier"], traversalDepth: 1 };
const supplier = {
  entityId: "alice-web~supplier",
  label: "Acme Parts",
  editionId: "edition-1",
  webId: "alice-web",
  entityTypeIds: ["https://hash.ai/@alice/types/entity-type/supplier/v/1"],
  properties: {
    "https://hash.ai/@alice/types/property-type/name/": "Acme Parts",
  },
  draft: false,
  matched: true,
};
const supplierRead = {
  propertyTypes: [
    {
      baseUrl: "https://hash.ai/@alice/types/property-type/name/",
      propertyTypeId: "https://hash.ai/@alice/types/property-type/name/v/1",
      title: "Name",
    },
  ],
  entityTypes: [
    {
      entityTypeId: "https://hash.ai/@alice/types/entity-type/supplier/v/1",
      title: "Supplier",
    },
  ],
  entities: [supplier],
} satisfies HashEntityReadResult;
/** What the model is shown of `supplierRead`. */
const supplierText = [
  "entities: 1",
  "properties:",
  "  name (https://hash.ai/@alice/types/property-type/name/v/1): Name",
  "entity types:",
  "  Supplier: https://hash.ai/@alice/types/entity-type/supplier/v/1",
  "entities:",
  '- Supplier "Acme Parts"',
  "  entityId: alice-web~supplier",
  "  editionId: edition-1",
  '  name: "Acme Parts"',
].join("\n");

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
        [fauxToolCall(brunchTools.hashQueryEntities, readInput, { id: "r1" })],
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
    toolName: brunchTools.hashQueryEntities,
    input: readInput,
    binding: canonicalContent(chat.binding),
  });
  expect(
    settleBrowserCall({
      agentName: hashAgent.agentName,
      instanceId: chat.instanceId,
      toolCallId: "r1",
      capability: claim.capability,
      binding: claim.binding,
      toolName: brunchTools.hashQueryEntities,
      canonicalInput: claim.input,
      output: supplierRead,
      metadata: { documentRevision: { before: "r1" } },
    }),
  ).toBe("settled");
  await chat.wait(receipt, { signal: AbortSignal.timeout(10_000) });

  expect(declared).toContain(brunchTools.hashQueryEntities);
  // The model sees the page's entities as compact text, edition evidence
  // included, and none of the browser sidecar.
  expect(seen).toBe(supplierText);
});

test("a step proposing the read beside a net read issues both to the browser, and the model next sees both results", async () => {
  const chat = conversation();
  let seenEntities: string | undefined;
  let seenNet: string | undefined;
  steps.push(
    () =>
      fauxAssistantMessage(
        [
          fauxToolCall(brunchTools.hashQueryEntities, readInput, {
            id: "m1",
          }),
          fauxToolCall(
            "petrinaut_get_net",
            { editor_id: hashProcessEditorId, detail: "outline" },
            { id: "m2" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
    (context) => {
      seenEntities = resultText(context, "m1");
      seenNet = resultText(context, "m2");
      return fauxAssistantMessage([fauxText("Read both.")]);
    },
  );
  const receipt = await chat.send("Who supplies the net's inputs?");

  const [entityClaim, netClaim] = await Promise.all([
    claimed(chat.instanceId, "m1", chat.binding),
    claimed(chat.instanceId, "m2", chat.binding),
  ]);
  expect(entityClaim.toolName).toBe(brunchTools.hashQueryEntities);
  expect(netClaim.toolName).toBe("petrinaut_get_net");
  const outline = {
    title: "Supply",
    definition: { places: [] },
    extensions: {},
  };
  expect(
    settleBrowserCall({
      agentName: hashAgent.agentName,
      instanceId: chat.instanceId,
      toolCallId: "m2",
      capability: netClaim.capability,
      binding: netClaim.binding,
      toolName: "petrinaut_get_net",
      canonicalInput: netClaim.input,
      output: outline,
      metadata: { documentRevision: { before: "r1" } },
    }),
  ).toBe("settled");
  expect(
    settleBrowserCall({
      agentName: hashAgent.agentName,
      instanceId: chat.instanceId,
      toolCallId: "m1",
      capability: entityClaim.capability,
      binding: entityClaim.binding,
      toolName: brunchTools.hashQueryEntities,
      canonicalInput: entityClaim.input,
      output: supplierRead,
      metadata: { documentRevision: { before: "r1" } },
    }),
  ).toBe("settled");
  await chat.wait(receipt, { signal: AbortSignal.timeout(10_000) });

  expect(seenEntities).toBe(supplierText);
  expect(JSON.parse(seenNet ?? "null")).toEqual(outline);
});

test("a read that finds nothing the user may see shows the model the empty result as it is", async () => {
  const chat = conversation();
  let seen: string | undefined;
  steps.push(
    () =>
      fauxAssistantMessage(
        [
          fauxToolCall(
            brunchTools.hashQueryEntities,
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
    agentName: hashAgent.agentName,
    instanceId: chat.instanceId,
    toolCallId: "r2",
    capability: claim.capability,
    binding: claim.binding,
    toolName: brunchTools.hashQueryEntities,
    canonicalInput: claim.input,
    output: { propertyTypes: [], entityTypes: [], entities: [] },
  });
  await chat.wait(receipt, { signal: AbortSignal.timeout(10_000) });

  expect(seen).toBe(
    "No entities matched that the signed-in user can see. One may still exist but be hidden from them, archived (pass includeArchived: true), a draft (pass includeDrafts: true), or filed under another type title or web; only the webIds named were read.",
  );
});

test("a read the page fails reaches the model as a tool error that left the document unchanged", async () => {
  const chat = conversation();
  let failed: Extract<Message, { role: "toolResult" }> | undefined;
  steps.push(
    () =>
      fauxAssistantMessage(
        [fauxToolCall(brunchTools.hashQueryEntities, readInput, { id: "r3" })],
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
      agentName: hashAgent.agentName,
      instanceId: chat.instanceId,
      toolCallId: "r3",
      capability: claim.capability,
      binding: claim.binding,
      toolName: brunchTools.hashQueryEntities,
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

/** Runs one read in a fresh conversation, settles it with `output`, and returns what the model saw next. */
const readOnce = async (
  toolName: string,
  input: Parameters<typeof fauxToolCall>[1],
  output: ClientToolResult["output"],
): Promise<{
  claim: BrowserCallClaim;
  declared: string[];
  seen: string | undefined;
}> => {
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
        [fauxToolCall(toolName, input, { id: "once" })],
        { stopReason: "toolUse" },
      );
    },
    (context) => {
      seen = resultText(context, "once");
      return fauxAssistantMessage([fauxText("Read.")]);
    },
  );
  const receipt = await chat.send("What is in HASH?");
  const claim = await claimed(chat.instanceId, "once", chat.binding);
  expect(
    settleBrowserCall({
      agentName: hashAgent.agentName,
      instanceId: chat.instanceId,
      toolCallId: "once",
      capability: claim.capability,
      binding: claim.binding,
      toolName,
      canonicalInput: claim.input,
      output,
      metadata: { documentRevision: { before: "r1" } },
    }),
  ).toBe("settled");
  await chat.wait(receipt, { signal: AbortSignal.timeout(10_000) });
  return { claim, declared, seen };
};

const supplierType = {
  entityTypeId: "https://hash.ai/@alice/types/entity-type/supplier/v/1",
  title: "Supplier",
  description: "Someone who supplies parts.",
  properties: [
    {
      baseUrl: "https://hash.ai/@alice/types/property-type/name/",
      title: "Name",
    },
  ],
  links: [
    {
      linkEntityTypeId: "https://hash.ai/@alice/types/entity-type/supplies/v/1",
      title: "Supplies",
      destinationEntityTypeIds: [
        "https://hash.ai/@alice/types/entity-type/product/v/1",
      ],
    },
  ],
} satisfies HashEntityTypeReadResult["entityTypes"][number];

test("the entity type read is offered, issued as a read in a fresh conversation with the entities' type ids as given, and the model next sees the page's types", async () => {
  const input = {
    entityTypeIds: ["https://hash.ai/@alice/types/entity-type/supplier/v/2"],
    webIds: ["alice-web"],
  };
  const { claim, declared, seen } = await readOnce(
    brunchTools.hashQueryEntityTypes,
    input,
    { entityTypes: [supplierType] },
  );
  const { capability: _capability, ...issued } = claim;
  expect(issued).toEqual({
    toolName: brunchTools.hashQueryEntityTypes,
    input,
    binding: claim.binding,
  });
  expect(declared).toContain(brunchTools.hashQueryEntityTypes);
  expect(seen).toBe(
    [
      "entity types: 1",
      "- Supplier: https://hash.ai/@alice/types/entity-type/supplier/v/1",
      "  description: Someone who supplies parts.",
      "  properties:",
      "    name (https://hash.ai/@alice/types/property-type/name/): Name",
      "  links:",
      "    Supplies: https://hash.ai/@alice/types/entity-type/supplies/v/1 -> https://hash.ai/@alice/types/entity-type/product/v/1",
    ].join("\n"),
  );
});

test("the web read is offered, issued as a read in a fresh conversation, and the model next sees the page's webs", async () => {
  const webs = [
    { webId: "alice-web", kind: "user", shortname: "alice", name: "Alice" },
    { webId: "org-web", kind: "organization", shortname: "acme", name: "Acme" },
  ];
  const { claim, declared, seen } = await readOnce(
    brunchTools.hashQueryWebs,
    {},
    { webs },
  );
  const { capability: _capability, ...issued } = claim;
  expect(issued).toEqual({
    toolName: brunchTools.hashQueryWebs,
    input: {},
    binding: claim.binding,
  });
  expect(declared).toContain(brunchTools.hashQueryWebs);
  expect(seen).toBe(
    [
      "webs: 2",
      '- user "Alice" @alice webId: alice-web',
      '- organization "Acme" @acme webId: org-web',
    ].join("\n"),
  );
});

test("the entity count is offered, issued as a read in a fresh conversation with its filters as given, and the model next sees the page's count", async () => {
  const input = {
    entityTypes: ["Sales Order"],
    webIds: ["alice-web", "org-web"],
  };
  const salesOrder = "https://hash.ai/@acme/types/entity-type/sales-order/v/1";
  const { claim, declared, seen } = await readOnce(
    brunchTools.hashCountEntities,
    input,
    {
      count: 1234,
      webScope: "named",
      entityTypes: [
        { entityTypeId: salesOrder, title: "Sales Order", count: 1234 },
      ],
      webs: [
        {
          webId: "alice-web",
          kind: "user",
          shortname: "alice",
          name: "Alice",
          count: 1200,
        },
        {
          webId: "org-web",
          kind: "organization",
          shortname: "acme",
          name: "Acme",
          count: 34,
        },
      ],
    },
  );
  const { capability: _capability, ...issued } = claim;
  expect(issued).toEqual({
    toolName: brunchTools.hashCountEntities,
    input,
    binding: claim.binding,
  });
  expect(declared).toContain(brunchTools.hashCountEntities);
  expect(seen).toBe(
    [
      "entities: 1,234",
      "webs counted: the webIds named",
      "filters: drafts excluded (pass includeDrafts: true), archived excluded (pass includeArchived: true)",
      "by entity type:",
      `- 1,234 Sales Order: ${salesOrder}`,
      "by web:",
      '- 1,200 user "Alice" @alice webId: alice-web',
      '- 34 organization "Acme" @acme webId: org-web',
    ].join("\n"),
  );
});

test("an entity read asking for an entity's full values is issued as asked, and the model next sees the value in full", async () => {
  const definitionUrl =
    "https://hash.ai/@h/types/property-type/definition-object/";
  const definition = {
    places: Array.from({ length: 100 }, (_, index) => `place-${index}`),
  };
  const net = {
    ...supplier,
    entityId: "alice-web~net",
    properties: { [definitionUrl]: definition },
  };
  const output = { propertyTypes: [], entityTypes: [], entities: [net] };
  const input = { entityIds: [net.entityId], fullValuesFor: [net.entityId] };

  const { claim, seen } = await readOnce(
    brunchTools.hashQueryEntities,
    input,
    output,
  );
  expect(claim.input).toEqual(input);
  expect(seen).toContain(`definition_object: ${JSON.stringify(definition)}`);

  // Without asking, the same value is summarised.
  const compact = await readOnce(
    brunchTools.hashQueryEntities,
    { entityIds: [net.entityId] },
    output,
  );
  expect(compact.seen).toMatch(
    /definition_object: <object, [\d.]+ KB: places [\d.]+ KB>/,
  );

  // Asking for part of it by path shows that part alone.
  const pathInput = {
    entityIds: [net.entityId],
    fullValuesFor: [
      { entityId: net.entityId, path: ["definition_object", "places", "7"] },
    ],
  };
  const part = await readOnce(brunchTools.hashQueryEntities, pathInput, output);
  expect(part.claim.input).toEqual(pathInput);
  expect(part.seen).toContain(
    'path ["definition_object","places","7"]: "place-7"',
  );
  expect(part.seen).toContain(`entityId: ${net.entityId}`);
  expect(part.seen).toMatch(/definition_object: <object, /);
});

test("a full page of the type read shows the model its cursor, and the last page says nothing of more", async () => {
  const cursor = supplierType.entityTypeId;
  const output = { entityTypes: [supplierType] };
  const paged = await readOnce(
    brunchTools.hashQueryEntityTypes,
    { limit: 25 },
    {
      ...output,
      cursor,
    },
  );
  expect(paged.seen?.split("\n")[1]).toBe(
    `This page is full (limit 25, max 1,000), so more entity types may match. To read the next page, repeat the same read with cursor: ${cursor}`,
  );

  const whole = await readOnce(brunchTools.hashQueryEntityTypes, {}, output);
  expect(whole.seen).not.toContain("more entity types may match");
});

test("a full page of the entity read shows the model its cursor, as given, and how to read the next page; the last page says nothing of more", async () => {
  const pageInput = { ...readInput, limit: 1, cursor: "WyJwcmV2aW91cyJd" };
  const cursor = "WyIyMDI2LTEwLTI2Iiwic3VwcGxpZXIiXQ";
  const partial = await readOnce(brunchTools.hashQueryEntities, pageInput, {
    ...supplierRead,
    cursor,
  });
  // The page gets the limit and cursor exactly as the model gave them.
  expect(partial.claim.input).toEqual(pageInput);
  const [count, next, ...rest] = partial.seen?.split("\n") ?? [];
  expect(count).toBe("entities: 1");
  expect(next).toBe(
    `This page is full (limit 1, max 1,000), so more may match. To read the next page, repeat the same read with cursor: ${cursor}`,
  );
  expect(rest.join("\n")).toBe(supplierText.split("\n").slice(1).join("\n"));

  const last = await readOnce(
    brunchTools.hashQueryEntities,
    pageInput,
    supplierRead,
  );
  expect(last.seen).toBe(supplierText);
});

test("an entity read whose text would be too large reaches the model as a refusal, with none of the read and no cursor", async () => {
  const large = "words ".repeat(20_000);
  const other = { ...supplier, entityId: "alice-web~other", label: "Other" };
  const { label: _label, ...unlabelled } = supplier;
  const link = {
    ...unlabelled,
    entityId: "alice-web~link",
    matched: false,
    properties: {},
    linkData: {
      leftEntityId: supplier.entityId,
      rightEntityId: other.entityId,
    },
  };
  const nameUrl = "https://hash.ai/@alice/types/property-type/name/";
  const input = {
    ...readInput,
    fullValuesFor: [supplier.entityId, other.entityId],
  };
  const cursor = "WyJuZXh0Il0";
  const { seen } = await readOnce(brunchTools.hashQueryEntities, input, {
    ...supplierRead,
    entities: [
      { ...supplier, properties: { [nameUrl]: large } },
      { ...other, properties: { [nameUrl]: large } },
      link,
    ],
    cursor,
  });
  const lines = seen?.split("\n") ?? [];
  expect(lines[0]).toMatch(
    /^Refused: this read's text would be about \d{2,3},\d{3} tokens, over the 20,000 token limit \(default 20,000, max 60,000\), so none of it is shown and it gives no cursor\.$/u,
  );
  expect(lines.slice(1)).toEqual([
    "It held 3 entities: 2 matched and 1 reached by links.",
    "Narrow it (or raise maxTokens), then repeat it from the same cursor if it had one, so no match is skipped:",
    expect.stringMatching(
      /^- raise maxTokens \(up to 60,000; this result needs about \d{2,3},\d{3}\)$/u,
    ),
    "- a smaller limit, then read the rest page by page",
    "- traversalDepth: 0, to leave out the entities reached by links",
    "- filters by entityTypes, webIds, entityIds or propertyEquals",
    "- properties, to show only those you need of each entity",
    "- in fullValuesFor, { entityId, path, offset?, limit? } for the part or slice of a large value you need, rather than the entity's id",
  ]);
  expect(seen).not.toContain(cursor);
  expect(seen).not.toContain(supplier.entityId);
});

test("an entity read by a property value, showing chosen properties, is issued as asked, and the model sees only those properties", async () => {
  const nameUrl = "https://hash.ai/@alice/types/property-type/name/";
  const cityUrl = "https://hash.ai/@alice/types/property-type/city/";
  const input = {
    entityTypes: ["Supplier"],
    propertyEquals: [{ property: `${nameUrl}v/1`, value: "Acme Parts" }],
    properties: [nameUrl],
    traversalDepth: 0,
  };
  const { claim, seen } = await readOnce(brunchTools.hashQueryEntities, input, {
    ...supplierRead,
    entities: [
      {
        ...supplier,
        properties: { ...supplier.properties, [cityUrl]: "Leeds" },
      },
    ],
  });
  // The page gets the whole input; it builds the filter, the agent the selection.
  expect(claim.input).toEqual(input);
  expect(seen).toBe(supplierText);
});

test("an entity count by a property value is issued as asked, and the model sees the condition it counted under", async () => {
  const nameUrl = "https://hash.ai/@alice/types/property-type/name/";
  const input = {
    entityTypes: ["Supplier"],
    propertyEquals: [{ property: nameUrl, value: "Acme Parts" }],
  };
  const supplierTypeId =
    "https://hash.ai/@alice/types/entity-type/supplier/v/1";
  const { claim, seen } = await readOnce(brunchTools.hashCountEntities, input, {
    count: 1,
    webScope: "default",
    entityTypes: [
      { entityTypeId: supplierTypeId, title: "Supplier", count: 1 },
    ],
    webs: [{ webId: "alice-web", kind: "user", count: 1 }],
  });
  expect(claim.input).toEqual(input);
  expect(seen).toBe(
    [
      "entities: 1",
      "webs counted: the user's own web and their organizations' webs (the default; name webIds to count in others)",
      "filters: drafts excluded (pass includeDrafts: true), archived excluded (pass includeArchived: true)",
      `counted where: ${nameUrl} = "Acme Parts"`,
      "by entity type:",
      `- 1 Supplier: ${supplierTypeId}`,
      "by web:",
      "- 1 user webId: alice-web",
    ].join("\n"),
  );
});

const salesOrdersUndeliveredByCustomer = {
  entityTypes: ["Sales Order"],
  where: {
    path: [
      { linkType: "Has Line Item", direction: "outgoing" },
      { linkType: "Fulfills", direction: "incoming" },
    ],
    exists: false,
  },
  groupBy: { linkType: "Has Customer", direction: "outgoing" },
} satisfies HashEntityCountInput;
const salesOrderJoinReads = [
  { role: "counted", entityTypes: ["Sales Order"], entities: 3 },
  { role: "link", entityTypes: ["Has Line Item"], entities: 4 },
  { role: "link", entityTypes: ["Fulfills"], entities: 2 },
  { role: "link", entityTypes: ["Has Customer"], entities: 3 },
] satisfies HashEntityCountJoinResult["reads"];

test("an entity count across links is issued to the page as asked, and the model sees how many qualified, by group, with examples", async () => {
  const { claim, seen } = await readOnce(
    brunchTools.hashCountEntities,
    salesOrdersUndeliveredByCustomer,
    {
      outcome: "counted",
      webScope: "default",
      ofType: 3,
      count: 1,
      groups: [
        { entity: { entityId: "acme-web~c1", label: "Acme" }, count: 1 },
      ],
      examples: [{ entityId: "acme-web~o1", label: "SO-1" }],
      reads: [
        ...salesOrderJoinReads,
        { role: "grouped", entityTypes: [], entities: 1 },
      ],
      requests: 12,
    },
  );
  expect(claim.input).toEqual(salesOrdersUndeliveredByCustomer);
  expect(seen?.split("\n")).toEqual([
    'entities: 1 (of 3 "Sales Order" read)',
    "webs counted: the user's own web and their organizations' webs (the default; name webIds to count in others)",
    "filters: drafts excluded (pass includeDrafts: true), archived excluded (pass includeArchived: true)",
    'where: following "Has Line Item" (outgoing), then Fulfills (incoming) reaches no entity',
    'groups, by the entity one "Has Customer" (outgoing) link away (an entity linked to several is counted under each, so these may sum to more than the total):',
    '- 1 "Acme" entityId: acme-web~c1',
    "examples (1 of 1; pass maxExamples up to 100, or 0 for none):",
    '- "SO-1" entityId: acme-web~o1',
    'read: 3 "Sales Order", 4 "Has Line Item" links, 2 Fulfills links, 3 "Has Customer" links, 1 grouped entity, in 12 graph requests',
  ]);
});

test("an entity count across links that stopped part-way reaches the model as incomplete, with no count", async () => {
  const { seen } = await readOnce(
    brunchTools.hashCountEntities,
    salesOrdersUndeliveredByCustomer,
    {
      outcome: "incomplete",
      reason:
        "Reading the Fulfills links failed on page 2: HASH didn't respond in time.",
      reads: salesOrderJoinReads,
      requests: 9,
    },
  );
  expect(seen?.split("\n")).toEqual([
    "Incomplete: no count. Reading the Fulfills links failed on page 2: HASH didn't respond in time.",
    "What was read is not all there is, so it is not an answer: report no count, group or example from it.",
    'Read before it stopped: 3 "Sales Order", 4 "Has Line Item" links, 2 Fulfills links, 3 "Has Customer" links, in 9 graph requests.',
    "Repeat the count; if it stops again, narrow it by webIds or propertyEquals, raise maxJoinEntities (up to 100,000), or tell the user the count couldn't be completed.",
  ]);
});

test("an entity count with an invalid where path never reaches the browser", async () => {
  const chat = conversation();
  let rejected: Extract<Message, { role: "toolResult" }> | undefined;
  steps.push(
    () =>
      fauxAssistantMessage(
        [
          fauxToolCall(
            brunchTools.hashCountEntities,
            { where: { path: [], exists: true } },
            { id: "c1" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
    (context) => {
      rejected = toolResult(context, "c1");
      return fauxAssistantMessage([fauxText("Need a path.")]);
    },
  );
  const receipt = await chat.send("Count by customer.");
  await chat.wait(receipt, { signal: AbortSignal.timeout(10_000) });

  expect(rejected?.isError).toBe(true);
  expect(
    claimBrowserCall({
      agentName: hashAgent.agentName,
      instanceId: chat.instanceId,
      toolCallId: "c1",
      binding: canonicalContent(chat.binding),
    }),
  ).toBeUndefined();
});

test.each([
  [brunchTools.hashQueryEntities, readInput],
  [brunchTools.hashQueryEntityTypes, {}],
  [brunchTools.hashQueryWebs, {}],
  [brunchTools.hashCountEntities, {}],
])(
  "%s settled with the page's error reaches the model as a failed read it can read",
  async (toolName, input) => {
    const { seen } = await readOnce(toolName, input, {
      error: "Response not successful: GraphQL error",
    });
    expect(JSON.parse(seen ?? "null")).toEqual({
      error: "Response not successful: GraphQL error",
      note: "The read failed; the document is unchanged.",
    });
  },
);

test("an entity type read whose text exceeds maxTokens reaches the model as a refusal with narrowing and maxTokens advice", async () => {
  const manyTypes = Array.from({ length: 120 }, (_, index) => ({
    entityTypeId: `https://hash.ai/@acme/types/entity-type/type-${index}/v/1`,
    title: `Type ${index}`,
    description: "Detailed catalog record schema description. ".repeat(15),
    properties: Array.from({ length: 5 }, (_, propIndex) => ({
      baseUrl: `https://hash.ai/@acme/types/property-type/prop-${index}-${propIndex}/`,
      title: `Property ${propIndex}`,
    })),
    links: [],
  }));
  const { seen } = await readOnce(
    brunchTools.hashQueryEntityTypes,
    { limit: 120 },
    {
      entityTypes: manyTypes,
      cursor: "https://hash.ai/@acme/types/entity-type/type-119/v/1",
    },
  );
  expect(seen).toContain("Refused: this type read's text would be about");
  expect(seen).toContain(
    "over the 20,000 token limit (default 20,000, max 60,000)",
  );
  expect(seen).toContain("pass a smaller limit");
  expect(seen).not.toContain("type-119/v/1");
});

test("an empty final cursor page reaches the model as end-of-pagination rather than nothing matched", async () => {
  const input = {
    ...readInput,
    cursor: "WyJwcmV2aW91cyJd",
  } satisfies HashEntityReadInput;
  const { seen } = await readOnce(brunchTools.hashQueryEntities, input, {
    propertyTypes: [],
    entityTypes: [],
    entities: [],
  });
  expect(seen).toBe("No more entities matched; all pages have been read.");
});

test.each([-1, 1.5, 4])(
  "a traversal depth of %s never reaches the browser",
  async (traversalDepth) => {
    const chat = conversation();
    let rejected: Extract<Message, { role: "toolResult" }> | undefined;
    steps.push(
      () =>
        fauxAssistantMessage(
          [
            fauxToolCall(
              brunchTools.hashQueryEntities,
              { traversalDepth },
              { id: "r4" },
            ),
          ],
          { stopReason: "toolUse" },
        ),
      (context) => {
        rejected = toolResult(context, "r4");
        return fauxAssistantMessage([fauxText("Not a depth.")]);
      },
    );
    const receipt = await chat.send("Read everything.");
    await chat.wait(receipt, { signal: AbortSignal.timeout(10_000) });

    expect(rejected?.isError).toBe(true);
    expect(
      claimBrowserCall({
        agentName: hashAgent.agentName,
        instanceId: chat.instanceId,
        toolCallId: "r4",
        binding: canonicalContent(chat.binding),
      }),
    ).toBeUndefined();
  },
);
