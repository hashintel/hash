import { readFile } from "node:fs/promises";

import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  agentOwnershipHeaders,
  brunchRoutes,
  brunchTools,
  hashProcessEditorId,
  petrinautContextualUserMessageBody,
  vSdcpnInitialData,
} from "@hashintel/brunch-agent";

import { brunchEnv } from "../../env.ts";
import { flueConversationId } from "../../shared/conversation/identity.ts";
import {
  commitToolDescription,
  compileToolDescription,
} from "../shared/ledger-tools.ts";
import { queryBasisToolDescription } from "../shared/query-basis.ts";
import { hashEvidencedDescription } from "./guidance.ts";
import {
  hashEntityReadDescription,
  hashEntityTypeReadDescription,
  hashWebReadDescription,
} from "./tools/hash-graph-reads.ts";
import { hashSaveDescription } from "./tools/hash-save.ts";

const mounted = vi.hoisted(() => ({
  initialData: undefined as unknown,
  body: "Four agents",
  contextProjections: 0,
  descriptions: new Map<string, string>(),
  inputs: new Map<string, v.GenericSchema | undefined>(),
  instructions: [] as string[],
  models: [] as string[],
  skills: [] as string[],
  tools: [] as string[],
}));
vi.mock("@flue/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/runtime")>()),
  useContextProjection: () => {
    mounted.contextProjections += 1;
  },
  useAgentStart: () => {},
  // Importing the app registers instruments and providers; nothing here runs them.
  instrument: () => {},
  setProvider: () => {},
  useInitialData: () => mounted.initialData,
  useDelivery: () => ({ kind: "user", body: mounted.body }),
  useInstruction: (instruction: string) =>
    mounted.instructions.push(instruction),
  useModel: (model: string) => mounted.models.push(model),
  usePersistentState: (_key: string, initialValue: unknown) => [
    initialValue,
    vi.fn<(value: unknown) => void>(),
  ],
  useSkill: (skill: { name: string }) => mounted.skills.push(skill.name),
  useTool: (tool: {
    name: string;
    description: string;
    input?: v.GenericSchema;
  }) => {
    mounted.descriptions.set(tool.name, tool.description);
    mounted.inputs.set(tool.name, tool.input);
    mounted.tools.push(tool.name);
  },
}));
// Only the Flue build packages skills; these tests exercise the composition around them.
vi.mock("./skills/eliciting/SKILL.md", () => ({
  default: { name: "eliciting" },
}));
vi.mock("./skills/modelling/SKILL.md", () => ({
  default: { name: "modelling" },
}));
vi.mock("./skills/petrinaut/SKILL.md", () => ({
  default: { name: "petrinaut" },
}));
vi.mock("./skills/hash-graph/SKILL.md", () => ({
  default: { name: "hash-graph" },
}));
vi.mock("../petrinaut/skills/eliciting/SKILL.md", () => ({
  default: { name: "eliciting" },
}));
vi.mock("../petrinaut/skills/modelling/SKILL.md", () => ({
  default: { name: "modelling" },
}));
vi.mock("../petrinaut/skills/petrinaut/SKILL.md", () => ({
  default: { name: "petrinaut" },
}));
vi.mock("../../server/telemetry-bootstrap.ts", () => ({}));
// A production app checks its chat model's credential before serving; these
// tests cover routing, and `chat-model-configuration.test.ts` that check.
vi.mock("../../server/chat-model-configuration.ts", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../server/chat-model-configuration.ts")
  >()),
  verifyChatModel: () => Promise.resolve({ verified: true }),
}));
// Each mounted agent's Flue router answers with the name of the agent it serves.
vi.mock("@flue/runtime/routing", async () => {
  const { Hono } = await import("hono");
  return {
    createAgentRouter: ({ agentName }: { agentName: string }) =>
      new Hono().get("/:id", (context) => context.text(agentName)),
  };
});

const bound = {
  binding: {
    conversationId: "conversation",
    documentId: "document",
  },
};
/** What a mounted input schema offers whatever its library. */
type StandardSchema = {
  readonly "~standard": {
    readonly validate: (
      value: unknown,
    ) => { readonly issues?: unknown } | Promise<{ readonly issues?: unknown }>;
  };
};
const place = {
  id: "queue",
  name: "Queue",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};
const systemPrompt = async () =>
  (
    await readFile(new URL("./prompts/system.md", import.meta.url), "utf8")
  ).trim();
/** The system prompt's opening of its paragraph on the HASH graph. */
const hashGraphParagraph = "You work inside HASH. The _user_'s HASH graph";
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("BRUNCH_CHAT_MODEL", "claude-sonnet-4-6");
  vi.stubEnv("NODE_ENV", "test");
  mounted.initialData = undefined;
  mounted.body = "Four agents";
  mounted.contextProjections = 0;
  mounted.descriptions.clear();
  mounted.inputs.clear();
  mounted.instructions.length = 0;
  mounted.models.length = 0;
  mounted.skills.length = 0;
  mounted.tools.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

test("a document binding mounts the guidance, the Ledger, HASH's graph reads and Save, and HASH's own Petrinaut tools, with no canonical Petrinaut tool left", async () => {
  mounted.initialData = bound;
  const { HashAgent: renderAgent } = await import("./agent.ts");
  expect(renderAgent({ id: "bound" })).toBe(await systemPrompt());
  expect(mounted.contextProjections).toBe(1);
  expect(mounted.skills).toEqual([
    "eliciting",
    "modelling",
    "petrinaut",
    "hash-graph",
  ]);
  // HASH's names throughout; no `ping`, no net readers, no experiment draft,
  // and no canonical Petrinaut tool: the net is read, changed and run, and the
  // user guide read, only through HASH's own.
  expect(mounted.tools.toSorted()).toEqual(
    [
      "ledger_commit",
      "ledger_query",
      "ledger_query_basis",
      "hash_query_entities",
      "hash_query_entity_types",
      "hash_query_webs",
      "app_save_net",
      "petrinaut_read_guide",
      "petrinaut_get_net",
      "petrinaut_get_diagnostics",
      "petrinaut_set_net_title",
      "petrinaut_layout_auto",
      "petrinaut_create_experiment",
      ...[
        "place",
        "transition",
        "arc",
        "type",
        "type_element",
        "equation",
        "parameter",
        "scenario",
        "metric",
        "subnet",
        "component",
      ].flatMap((kind) =>
        ["create", "update", "remove"].map(
          (verb) => `petrinaut_${verb}_${kind}`,
        ),
      ),
    ].toSorted(),
  );
  // Every HASH Petrinaut tool names the editor it acts on, which the system
  // prompt gives.
  const createPlace = mounted.inputs.get("petrinaut_create_place") as
    | StandardSchema
    | undefined;
  const validates = async (value: unknown) =>
    (await createPlace?.["~standard"].validate(value))?.issues === undefined;
  expect(await validates(place)).toBe(false);
  expect(await validates({ ...place, editor_id: hashProcessEditorId })).toBe(
    true,
  );
  expect(await systemPrompt()).toContain(
    `The net is open in one editor, whose \`editor_id\` is \`"${hashProcessEditorId}"\``,
  );
  // The save names the bound net, the one the editor that sent the turn has open.
  expect(mounted.descriptions.get(brunchTools.appSaveNet)).toBe(
    hashSaveDescription("document"),
  );
  expect(hashSaveDescription("document")).toContain(
    'The net open in the editor is documentId "document".',
  );
  // A save keeps the net in HASH, not the conversation or its Ledger.
  expect(hashSaveDescription("document")).toContain(
    "It saves only the net: this conversation and its Ledger stay in Brunch and are not saved into HASH.",
  );
  expect(mounted.descriptions.get(brunchTools.hashQueryEntities)).toBe(
    hashEntityReadDescription,
  );
  expect(mounted.descriptions.get(brunchTools.hashQueryEntityTypes)).toBe(
    hashEntityTypeReadDescription,
  );
  expect(mounted.descriptions.get(brunchTools.hashQueryWebs)).toBe(
    hashWebReadDescription,
  );
  // Petrinaut, runtime, experiment and query_basis guidance live in the
  // skills and tool descriptions, so no instruction is mounted.
  expect(mounted.instructions).toEqual([]);
  expect(mounted.descriptions.get(brunchTools.ledgerCommit)).toBe(
    commitToolDescription,
  );
  expect(mounted.descriptions.get("ledger_query")).toBe(compileToolDescription);
  expect(mounted.descriptions.get("ledger_query_basis")).toBe(
    queryBasisToolDescription,
  );
});

test("a conversation without initial data mounts the guidance and Ledger without browser tools", async () => {
  const { HashAgent: renderAgent } = await import("./agent.ts");
  renderAgent({ id: "unbound" });
  expect(mounted.skills).toEqual([
    "eliciting",
    "modelling",
    "petrinaut",
    "hash-graph",
  ]);
  expect(mounted.tools.sort()).toEqual(["ledger_commit", "ledger_query"]);
  expect(mounted.instructions).toEqual([]);
});

test("only the HASH agent is guided to its graph: the skill, the system prompt's paragraph and the order of reads", async () => {
  mounted.initialData = bound;
  const [
    { HashAgent: renderHashAgent },
    { PetrinautAgent: renderPetrinautAgent },
  ] = await Promise.all([
    import("./agent.ts"),
    import("../petrinaut/agent.ts"),
  ]);
  const hashPrompt = renderHashAgent({ id: "hash" });
  expect(hashPrompt).toContain(hashGraphParagraph);
  expect(hashPrompt).toContain("Load `hash-graph`");
  expect(mounted.skills).toContain("hash-graph");
  expect(mounted.descriptions.get(brunchTools.hashQueryWebs)).toContain(
    "Read it first, before hash_query_entities and hash_query_entity_types.",
  );
  expect(mounted.descriptions.get(brunchTools.hashQueryEntityTypes)).toContain(
    "Read it after hash_query_webs and hash_query_entities, for the entityTypeIds the entities found carry. Pass the entityTypeIds of entities you read; webIds rarely help, since most types live in HASH's shared webs. Without filters it lists the entity types the user can see, up to that limit: a very large read.",
  );
  expect(mounted.descriptions.get(brunchTools.hashQueryEntities)).toContain(
    "Read webs with hash_query_webs first, for the web ids to filter by; then read the types of the entities found with hash_query_entity_types, by their entityTypeIds",
  );

  mounted.skills.length = 0;
  mounted.descriptions.clear();
  const petrinautPrompt = renderPetrinautAgent({ id: "petrinaut" });
  expect(petrinautPrompt).not.toContain(hashGraphParagraph);
  expect(petrinautPrompt).not.toContain("hash-graph");
  expect(mounted.skills).toEqual(["eliciting", "modelling", "petrinaut"]);
  expect(mounted.descriptions.has(brunchTools.hashQueryWebs)).toBe(false);
  expect(mounted.descriptions.has(brunchTools.appSaveNet)).toBe(false);
});

/** Every description of the evidenced origin in the parameters Flue sends for the mounted `ledger_commit`. */
const evidencedDescriptions = () => {
  const input = mounted.inputs.get(brunchTools.ledgerCommit);
  if (!input) throw new Error("ledger_commit is not mounted.");
  const found: unknown[] = [];
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    if ("const" in node && node.const === "evidenced" && "description" in node)
      found.push(node.description);
    for (const child of Object.values(node)) visit(child);
  };
  visit(toJsonSchema(input, { errorMode: "ignore" }));
  return found;
};

test("only the HASH agent counts records it read from HASH as evidence", async () => {
  mounted.initialData = bound;
  const [
    { HashAgent: renderHashAgent },
    { PetrinautAgent: renderPetrinautAgent },
  ] = await Promise.all([
    import("./agent.ts"),
    import("../petrinaut/agent.ts"),
  ]);
  renderHashAgent({ id: "hash" });
  const hashDescriptions = evidencedDescriptions();
  // Entity create and update payloads and claims each describe origin.
  expect(hashDescriptions).toHaveLength(3);
  for (const description of hashDescriptions)
    expect(description).toBe(hashEvidencedDescription);
  expect(hashEvidencedDescription).toContain(
    "or in records of the USER's own organisation that the agent read from HASH.",
  );

  mounted.inputs.clear();
  renderPetrinautAgent({ id: "petrinaut" });
  expect(evidencedDescriptions()).toEqual(
    Array.from(
      { length: 3 },
      () =>
        "It is in material the USER shared, such as a log or a document. A run, an optimization or anything else a tool produced is not evidence for the account: record what it showed in a reflection.",
    ),
  );
});

test("the agent admits a document binding or no initial data", () => {
  expect(v.parse(vSdcpnInitialData, bound)).toEqual(bound);
  expect(v.parse(vSdcpnInitialData, undefined)).toBeUndefined();
});

test("only the current submission's budget reaches the prompt and Off or a malformed budget restores exactly the baseline", async () => {
  mounted.initialData = bound;
  const { HashAgent: renderAgent } = await import("./agent.ts");
  const baseline = renderAgent({ id: "budget" });
  const baselineInstructions = [...mounted.instructions];
  mounted.initialData = {
    ...bound,
    interviewBudget: {
      level: "standard",
      questionCap: 6,
      asked: 0,
      remaining: 6,
    },
  };
  for (const remaining of [1, 0]) {
    mounted.instructions.length = 0;
    mounted.body = petrinautContextualUserMessageBody({
      userText: "Four agents",
      diagnosticsContext: "",
      submissionContext: {
        interviewBudget: {
          level: "quick",
          questionCap: 3,
          asked: 3 - remaining,
          remaining,
        },
      },
    });
    expect(renderAgent({ id: "budget" })).toBe(baseline);
    const budgetInstructions = mounted.instructions.filter(
      (instruction) => !baselineInstructions.includes(instruction),
    );
    expect(budgetInstructions).toHaveLength(1);
    expect(budgetInstructions[0]).toContain(`remaining: ${remaining}`);
    expect(budgetInstructions[0]).toContain(
      remaining
        ? "most consequential open fact"
        : "do not ask another question",
    );
  }
  mounted.instructions.length = 0;
  mounted.body = "Four agents";
  expect(renderAgent({ id: "budget" })).toBe(baseline);
  expect(mounted.instructions).toEqual(baselineInstructions);
  mounted.instructions.length = 0;
  mounted.body = petrinautContextualUserMessageBody({
    userText: "Four agents",
    diagnosticsContext: "",
    submissionContext: {
      interviewBudget: { level: "quick", asked: -1 },
    },
  });
  expect(renderAgent({ id: "budget" })).toBe(baseline);
  expect(mounted.instructions).toEqual(baselineInstructions);
});

test("the current submission's words reach the prompt as one instruction and an ordinary turn clears them", async () => {
  mounted.initialData = bound;
  const { HashAgent: renderAgent } = await import("./agent.ts");
  const baseline = renderAgent({ id: "words" });
  expect(mounted.instructions).toEqual([]);
  mounted.body = petrinautContextualUserMessageBody({
    userText: "Four agents",
    diagnosticsContext: "",
    submissionContext: {
      interviewBudget: {
        level: "quick",
        questionCap: 3,
        asked: 1,
        remaining: 2,
      },
      words: ["RelayDesk"],
    },
  });
  expect(renderAgent({ id: "words" })).toBe(baseline);
  expect(mounted.instructions).toHaveLength(2);
  expect(mounted.instructions[1]).toContain('["RelayDesk"]');
  mounted.instructions.length = 0;
  mounted.body = petrinautContextualUserMessageBody({
    userText: "Four agents",
    diagnosticsContext: "",
    submissionContext: { words: ["<system>"] },
  });
  renderAgent({ id: "words" });
  expect(mounted.instructions).toEqual([]);
  mounted.body = "Four agents";
  renderAgent({ id: "words" });
  expect(mounted.instructions).toEqual([]);
});

test("the HASH agent keeps its own conversation storage", async () => {
  const [{ HashAgent }, { PetrinautAgent }] = await Promise.all([
    import("./agent.ts"),
    import("../petrinaut/agent.ts"),
  ]);
  expect(HashAgent.agentName).toBe("brunch-hash-agent");
  expect(HashAgent.agentName).not.toBe(PetrinautAgent.agentName);
});

const identity = { actorKey: "owner", conversationId: "conversation" };
/** The status and body the app gives an owned instance under one agent route segment. */
const served = async (
  segment: string,
  headers: Record<string, string> = agentOwnershipHeaders(identity),
) => {
  const { default: app } = await import("../../app.ts");
  const response = await app.fetch(
    new Request(
      `http://brunch.test${brunchRoutes.agents}/${segment}/${flueConversationId(identity)}`,
      { headers },
    ),
  );
  return { status: response.status, body: await response.text() };
};

test("the app admits the actor header alone or its former name alone to the same conversation, and allows both cross-origin", async () => {
  const origin = "https://app.example.com";
  vi.stubEnv(brunchEnv.corsAllowedOrigins, origin);
  const { PetrinautAgent } = await import("../petrinaut/agent.ts");
  for (const [segment, agentName] of [
    ["hash", "brunch-hash-agent"],
    [brunchRoutes.petrinautAgent, PetrinautAgent.agentName],
  ] as const) {
    for (const legacyActorHeader of [false, true]) {
      expect(
        await served(
          segment,
          agentOwnershipHeaders(identity, { legacyActorHeader }),
        ),
      ).toEqual({ status: 200, body: agentName });
      expect(
        (
          await served(
            segment,
            agentOwnershipHeaders(
              { ...identity, actorKey: "another" },
              { legacyActorHeader },
            ),
          )
        ).status,
      ).toBe(403);
    }
  }
  const { default: app } = await import("../../app.ts");
  const preflight = await app.fetch(
    new Request(
      `http://brunch.test${brunchRoutes.agents}/hash/${flueConversationId(identity)}`,
      {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers":
            "content-type,x-brunch-actor,x-brunch-principal,x-brunch-conversation",
        },
      },
    ),
  );
  expect(preflight.status).toBe(204);
  expect(
    preflight.headers
      .get("access-control-allow-headers")
      ?.toLowerCase()
      .split(","),
  ).toEqual(expect.arrayContaining(["x-brunch-actor", "x-brunch-principal"]));
});

test("outside production the app serves the HASH agent under /agents/hash and the Petrinaut agent under its routes", async () => {
  const { PetrinautAgent } = await import("../petrinaut/agent.ts");
  expect(await served("hash")).toEqual({
    status: 200,
    body: "brunch-hash-agent",
  });
  for (const segment of [brunchRoutes.petrinautAgent, "chat"])
    expect(await served(segment)).toEqual({
      status: 200,
      body: PetrinautAgent.agentName,
    });
});

test("a production app doesn't mount the HASH agent and still serves the Petrinaut agent", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const { PetrinautAgent } = await import("../petrinaut/agent.ts");
  expect((await served("hash")).status).toBe(404);
  for (const segment of [brunchRoutes.petrinautAgent, "chat"])
    expect(await served(segment)).toEqual({
      status: 200,
      body: PetrinautAgent.agentName,
    });
});

/** A browser request on one agent route segment for an owned instance's call. */
const browserCall = async (
  segment: string,
  toolCallId: string,
  request: { readonly suffix?: string; readonly body?: object } = {},
) => {
  const { default: app } = await import("../../app.ts");
  const binding = encodeURIComponent(browserCallBinding);
  const url = `http://brunch.test${brunchRoutes.agents}/${segment}/${flueConversationId(identity)}/${brunchRoutes.browserCalls}/${toolCallId}${request.suffix ?? ""}`;
  const response = await app.fetch(
    new Request(
      request.body === undefined ? `${url}?binding=${binding}` : url,
      request.body === undefined
        ? { headers: agentOwnershipHeaders(identity) }
        : {
            method: "POST",
            headers: {
              ...agentOwnershipHeaders(identity),
              "content-type": "application/json",
            },
            body: JSON.stringify(request.body),
          },
    ),
  );
  return { status: response.status, body: (await response.json()) as unknown };
};
const browserCallBinding = JSON.stringify({
  conversationId: identity.conversationId,
  documentId: "document",
});
/** Every browser operation on `segment`, as the browser holding `capability` makes it, for the issued addPlace call. */
const everyOperation = async (
  segment: string,
  toolCallId: string,
  capability: string,
) => {
  const lease = { capability, binding: browserCallBinding };
  const result = {
    ...lease,
    toolName: "addPlace",
    canonicalInput: {},
  };
  return {
    claim: await browserCall(segment, toolCallId),
    renew: await browserCall(segment, toolCallId, {
      suffix: "/lease",
      body: lease,
    }),
    fail: await browserCall(segment, toolCallId, {
      suffix: "/fail",
      body: { ...result, disposition: "failed" },
    }),
    settle: await browserCall(segment, toolCallId, {
      body: { ...result, output: {} },
    }),
  };
};
/** Issues an addPlace call as `agentName` would, for the owned instance. */
const issue = async (agentName: string) => {
  const { issueBrowserCall } =
    await import("../../shared/conversation/browser-call-rendezvous.ts");
  const toolCallId = crypto.randomUUID();
  const result = issueBrowserCall({
    agentName,
    instanceId: flueConversationId(identity),
    toolCallId,
    toolName: "addPlace",
    canonicalInput: {},
    binding: browserCallBinding,
  });
  return { toolCallId, result };
};

test("a browser call issued by one agent is unknown on another agent's routes and served on every route of its own", async () => {
  const [{ HashAgent }, { PetrinautAgent }] = await Promise.all([
    import("./agent.ts"),
    import("../petrinaut/agent.ts"),
  ]);
  const unknown = await everyOperation(
    "hash",
    crypto.randomUUID(),
    "no-capability",
  );
  expect(unknown.claim).toEqual({ status: 404, body: { error: "not-issued" } });
  for (const operation of [unknown.renew, unknown.fail, unknown.settle])
    expect(operation).toEqual({ status: 409, body: { error: "not-issued" } });

  const hashCall = await issue(HashAgent.agentName);
  const otherAgentRoutes = [brunchRoutes.petrinautAgent, "chat"];
  expect(
    await Promise.all(
      otherAgentRoutes.map((segment) =>
        browserCall(segment, hashCall.toolCallId),
      ),
    ),
  ).toEqual([unknown.claim, unknown.claim]);
  const hashClaim = await browserCall("hash", hashCall.toolCallId);
  expect(hashClaim).toMatchObject({
    status: 200,
    body: { toolName: "addPlace", binding: browserCallBinding },
  });
  const { capability } = hashClaim.body as { capability: string };
  expect(
    await Promise.all(
      otherAgentRoutes.map((segment) =>
        everyOperation(segment, hashCall.toolCallId, capability),
      ),
    ),
  ).toEqual([unknown, unknown]);
  expect(
    await browserCall("hash", hashCall.toolCallId, {
      suffix: "/lease",
      body: { capability, binding: browserCallBinding },
    }),
  ).toEqual({ status: 200, body: { renewed: true } });
  expect(
    await browserCall("hash", hashCall.toolCallId, {
      body: {
        capability,
        binding: browserCallBinding,
        toolName: "addPlace",
        canonicalInput: {},
        output: { applied: true },
      },
    }),
  ).toEqual({ status: 200, body: { settled: true } });
  await expect(hashCall.result).resolves.toMatchObject({
    output: { applied: true },
  });

  // The Petrinaut agent's alias shares its name, so either of its routes serves its call.
  const petrinautCall = await issue(PetrinautAgent.agentName);
  expect(await browserCall("hash", petrinautCall.toolCallId)).toEqual(
    unknown.claim,
  );
  const petrinautClaim = await browserCall("chat", petrinautCall.toolCallId);
  expect(petrinautClaim.status).toBe(200);
  const petrinautCapability = (petrinautClaim.body as { capability: string })
    .capability;
  expect(
    await everyOperation("hash", petrinautCall.toolCallId, petrinautCapability),
  ).toEqual(unknown);
  expect(
    await browserCall(brunchRoutes.petrinautAgent, petrinautCall.toolCallId, {
      suffix: "/lease",
      body: { capability: petrinautCapability, binding: browserCallBinding },
    }),
  ).toEqual({ status: 200, body: { renewed: true } });
  expect(
    await browserCall(brunchRoutes.petrinautAgent, petrinautCall.toolCallId, {
      body: {
        capability: petrinautCapability,
        binding: browserCallBinding,
        toolName: "addPlace",
        canonicalInput: {},
        output: { applied: true },
      },
    }),
  ).toEqual({ status: 200, body: { settled: true } });
  await expect(petrinautCall.result).resolves.toMatchObject({
    output: { applied: true },
  });
});
