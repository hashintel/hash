import { readFile } from "node:fs/promises";

import * as v from "valibot";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  agentOwnershipHeaders,
  brunchRoutes,
  brunchTools,
  petrinautContextualUserMessageBody,
  sdcpnInitialDataSchema,
} from "@hashintel/brunch-agent";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { flueConversationId } from "../../shared/conversation/identity.ts";
import {
  commitToolDescription,
  compileToolDescription,
} from "../petrinaut/tools/ledger.ts";
import { queryBasisToolDescription } from "../petrinaut/tools/query-basis.ts";
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
  useTool: (tool: { name: string; description: string }) => {
    mounted.descriptions.set(tool.name, tool.description);
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
  mounted.instructions.length = 0;
  mounted.models.length = 0;
  mounted.skills.length = 0;
  mounted.tools.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

test("a document binding mounts the guidance, the complete canonical catalogue, the Ledger, the draft and HASH's graph reads", async () => {
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
  expect(mounted.tools).toEqual(
    expect.arrayContaining([
      brunchTools.ledgerCommit,
      brunchTools.ledgerCompile,
      brunchTools.queryBasis,
      brunchTools.ping,
      "readNetOutline",
      "readNetStructure",
      brunchTools.draftPetrinautExperiment,
      brunchTools.queryHashEntities,
      brunchTools.queryHashEntityTypes,
      brunchTools.queryHashWebs,
      brunchTools.saveHashNet,
      ...Object.keys(petrinautAiTools),
    ]),
  );
  // The save names the bound net, the one the editor that sent the turn has open.
  expect(mounted.descriptions.get(brunchTools.saveHashNet)).toBe(
    hashSaveDescription("document"),
  );
  expect(hashSaveDescription("document")).toContain(
    'The net open in the editor is documentId "document".',
  );
  // A save keeps the net in HASH, not the conversation or its Ledger.
  expect(hashSaveDescription("document")).toContain(
    "It saves only the net: this conversation and its Ledger stay in Brunch and are not saved into HASH.",
  );
  expect(mounted.descriptions.get(brunchTools.queryHashEntities)).toBe(
    hashEntityReadDescription,
  );
  expect(mounted.descriptions.get(brunchTools.queryHashEntityTypes)).toBe(
    hashEntityTypeReadDescription,
  );
  expect(mounted.descriptions.get(brunchTools.queryHashWebs)).toBe(
    hashWebReadDescription,
  );
  // Petrinaut, runtime, experiment and query_basis guidance live in the
  // skills and tool descriptions, so no instruction is mounted.
  expect(mounted.instructions).toEqual([]);
  expect(mounted.descriptions.get(brunchTools.ledgerCommit)).toBe(
    commitToolDescription,
  );
  expect(mounted.descriptions.get(brunchTools.ledgerCompile)).toBe(
    compileToolDescription,
  );
  expect(mounted.descriptions.get(brunchTools.queryBasis)).toBe(
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
  expect(mounted.tools.sort()).toEqual(
    [
      brunchTools.ledgerCommit,
      brunchTools.ledgerCompile,
      brunchTools.ping,
    ].sort(),
  );
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
  expect(mounted.descriptions.get(brunchTools.queryHashWebs)).toContain(
    "Read it first, before query_hash_entities and query_hash_entity_types.",
  );
  expect(mounted.descriptions.get(brunchTools.queryHashEntityTypes)).toContain(
    "Read it after query_hash_webs and query_hash_entities, for the entityTypeIds the entities found carry. Pass the entityTypeIds of entities you read; webIds rarely help, since most types live in HASH's shared webs. Without filters every entity type the user can see is listed, which is very large.",
  );
  expect(mounted.descriptions.get(brunchTools.queryHashEntities)).toContain(
    "Read webs with query_hash_webs first, for the web ids to filter by; then read the types of the entities found with query_hash_entity_types, by their entityTypeIds",
  );

  mounted.skills.length = 0;
  mounted.descriptions.clear();
  const petrinautPrompt = renderPetrinautAgent({ id: "petrinaut" });
  expect(petrinautPrompt).not.toContain(hashGraphParagraph);
  expect(petrinautPrompt).not.toContain("hash-graph");
  expect(mounted.skills).toEqual(["eliciting", "modelling", "petrinaut"]);
  expect(mounted.descriptions.has(brunchTools.queryHashWebs)).toBe(false);
  expect(mounted.descriptions.has(brunchTools.saveHashNet)).toBe(false);
});

test("the agent admits a document binding or no initial data", () => {
  expect(v.parse(sdcpnInitialDataSchema, bound)).toEqual(bound);
  expect(v.parse(sdcpnInitialDataSchema, undefined)).toBeUndefined();
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

const identity = { ownerKey: "owner", conversationId: "conversation" };
/** The status and body the app gives an owned instance under one agent route segment. */
const served = async (segment: string) => {
  const { default: app } = await import("../../app.ts");
  const response = await app.fetch(
    new Request(
      `http://brunch.test${brunchRoutes.agents}/${segment}/${flueConversationId(identity)}`,
      { headers: agentOwnershipHeaders(identity) },
    ),
  );
  return { status: response.status, body: await response.text() };
};

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
