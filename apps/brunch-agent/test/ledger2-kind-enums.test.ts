// Live probes need BRUNCH_LIVE_MODEL_TESTS=1 and the chat model's API key.
import { createModels, type Context } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { type FlueLogger, type ToolStep } from "@flue/runtime";
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { describe, expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";
import { netElementKinds } from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  entityKindStages,
  foldCommits,
  prepareAppend,
  vClaim,
  vEntity,
  vEntityKind,
  vLedgerAppend,
  vOrigin,
  vReflection,
  vStatus,
  type LedgerAppend,
  type LedgerHistory,
  type LedgerHistoryMessage,
} from "@hashintel/brunch-agent-plugin-sdcpn/ledger2";

import {
  commitToolDescription,
  createLedgerCommitTool,
  createLedgerCompileTool,
} from "../src/agents/chat-agent/guidance/manual/tools/ledger.ts";
import {
  selectChatModelSpecifier,
  selectChatThinking,
} from "../src/chat-model.ts";
import { openaiProviderWithAddedModels } from "../src/openai-provider.ts";

type Batch = LedgerAppend["entries"];

/** Parses plain entry literals into the branded batch the schemas produce. */
const toBatch = (entries: unknown): Batch =>
  v.parse(vLedgerAppend, { entries }).entries;

interface MutableToolPart {
  type: "dynamic-tool";
  toolName: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
}

const commitPart = (toolCallId: string, entries: Batch): MutableToolPart => ({
  type: "dynamic-tool",
  toolName: brunchTools.ledgerCommit,
  toolCallId,
  state: "input-available",
  input: { entries },
});

/**
 * A history where each batch sits in its own turn as a settled `ledger_commit`
 * whose recorded output is exactly what `prepareAppend` issued, so the fold
 * discipline itself is what the assertions exercise.
 */
const settledHistory = (batches: readonly Batch[]): LedgerHistory => {
  const messages: LedgerHistoryMessage[] = [];
  batches.forEach((entries, index) => {
    const toolCallId = `commit-${index + 1}`;
    const part = commitPart(toolCallId, entries);
    messages.push(
      { id: `turn-${index + 1}`, role: "user", parts: [] },
      { id: `response-${index + 1}`, role: "assistant", parts: [part] },
    );
    part.output = prepareAppend({ history: { messages }, toolCallId, entries });
    part.state = "output-available";
  });
  return { messages };
};

const log = () => ({
  info: vi.fn<FlueLogger["info"]>(),
  warn: vi.fn<FlueLogger["warn"]>(),
  error: vi.fn<FlueLogger["error"]>(),
});

/** A pass-through durable-step surface; nothing is recorded in tests. */
const step: ToolStep = {
  do: async (_name, fn) => await fn(),
};

/** Runs the real commit tool as the next call after the settled batches. */
const runCommit = async (prior: readonly Batch[], entries: Batch) => {
  const settled = settledHistory(prior);
  const toolCallId = `commit-${prior.length + 1}`;
  const history: LedgerHistory = {
    messages: [
      ...settled.messages,
      { id: `turn-${prior.length + 1}`, role: "user", parts: [] },
      {
        id: `response-${prior.length + 1}`,
        role: "assistant",
        parts: [commitPart(toolCallId, entries)],
      },
    ],
  };
  const tool = createLedgerCommitTool(async () => history);
  const result = await tool.run({
    data: v.parse(tool.input, { entries }),
    toolCallId,
    log: log(),
    step,
  });
  return v.parse(tool.output, result.output);
};

test("one mixed append batch yields queue-aligned IDs and resolved references", async () => {
  const batch = toBatch([
    [
      "entity/create",
      {
        name: "Dryer",
        kind: "resource",
        origin: "stated",
        status: "confirmed",
      },
    ],
    [
      "claim/create",
      {
        text: "There is one dryer, held by each batch while drying.",
        entities: ["$0"],
        origin: "stated",
        status: "confirmed",
      },
    ],
    [
      "reflection/create",
      {
        text: "Represented dryer capacity as one available token; batches do not yet hold or release it.",
        claims: ["$1"],
      },
    ],
    [
      "reflection/create",
      {
        text: "The place represents available dryer capacity.",
        netElements: [{ kind: "place", id: "p-dryer" }],
        entities: ["$0"],
        claims: ["$1"],
      },
    ],
  ]);
  const receipt = await runCommit([], batch);
  expect(receipt).toEqual({
    status: "recorded",
    commitId: "commit-1",
    revision: 1,
    ids: ["e1", "c1", "r1", "r2"],
  });
  const { state, revision } = foldCommits(settledHistory([batch]));
  expect(revision).toBe(1);
  expect(state.turns.map(({ id }) => id)).toEqual(["turn-1"]);
  expect(state.entities).toEqual([
    {
      address: "e1",
      name: "Dryer",
      kind: "resource",
      origin: "stated",
      status: "confirmed",
      turn: "turn-1",
    },
  ]);
  expect(
    state.claims.map(({ address, entities }) => ({ address, entities })),
  ).toEqual([{ address: "c1", entities: ["e1"] }]);
  expect(
    state.reflections.map(({ address, claims, entities }) => ({
      address,
      claims,
      entities,
    })),
  ).toEqual([
    { address: "r1", claims: ["c1"], entities: undefined },
    { address: "r2", claims: ["c1"], entities: ["e1"] },
  ]);
});

test("entity routes split creation from full update of an addressed entity", async () => {
  const update = {
    name: "Staffing horizon",
    kind: "horizon",
    origin: "stated",
    status: "confirmed",
  } as const;
  const creations = toBatch([
    [
      "entity/create",
      {
        name: "staffing-horizon",
        kind: "horizon",
        origin: "assumed",
        status: "tentative",
      },
    ],
    [
      "entity/create",
      {
        name: "investment-horizon",
        kind: "horizon",
        origin: "stated",
        status: "confirmed",
      },
    ],
  ]);
  const updateBatch = toBatch([["entity/update/e1", update]]);
  const receipt = await runCommit([creations], updateBatch);
  expect(receipt).toEqual({
    status: "recorded",
    commitId: "commit-2",
    revision: 2,
    ids: ["e1"],
  });
  const { state } = foldCommits(settledHistory([creations, updateBatch]));
  expect(
    state.entities.map(({ address, name, origin }) => ({
      address,
      name,
      origin,
    })),
  ).toEqual([
    { address: "e1", name: "Staffing horizon", origin: "stated" },
    { address: "e2", name: "investment-horizon", origin: "stated" },
  ]);
  expect(v.safeParse(vEntity, { ...update, id: "e1" }).success).toBe(false);
  expect(
    v.safeParse(vLedgerAppend, {
      entries: [
        ["entity/update/e1", { name: update.name, status: update.status }],
      ],
    }).success,
  ).toBe(false);
  for (const route of ["entity/update", "entity/update/c1", "entity/update/$0"])
    expect(
      v.safeParse(vLedgerAppend, { entries: [[route, update]] }).success,
    ).toBe(false);
});

test("updates and references to absent records are refused as unknown addresses", async () => {
  const entity = {
    name: "Dryer",
    kind: "resource",
    origin: "stated",
    status: "confirmed",
  } as const;
  const updateUnknown = await runCommit(
    [],
    toBatch([["entity/update/e9", entity]]),
  );
  expect(updateUnknown).toEqual({
    status: "refused",
    applied: false,
    code: "unknown-address",
    message: "Unknown entity e9; entity/update addresses an existing record.",
    revision: 0,
  });
  const referenceUnknown = await runCommit(
    [],
    toBatch([
      [
        "reflection/create",
        {
          text: "Used a 20-minute mean drying time for the stated drying duration.",
          claims: ["c99"],
        },
      ],
    ]),
  );
  expect(referenceUnknown).toMatchObject({
    status: "refused",
    code: "unknown-address",
    message: "Unknown claim c99.",
  });
});

test("committed records accept references from later turns", async () => {
  const prior = toBatch([
    [
      "entity/create",
      {
        name: "Dryer",
        kind: "resource",
        origin: "stated",
        status: "confirmed",
      },
    ],
    [
      "claim/create",
      {
        text: "Drying always takes 20 minutes.",
        entities: ["$0"],
        origin: "stated",
        status: "confirmed",
      },
    ],
  ]);
  const receipt = await runCommit(
    [prior],
    toBatch([
      [
        "reflection/create",
        {
          text: "Approximated the fixed drying duration with a 20-minute mean.",
          claims: ["c1"],
          entities: ["e1"],
        },
      ],
    ]),
  );
  expect(receipt).toEqual({
    status: "recorded",
    commitId: "commit-2",
    revision: 2,
    ids: ["r1"],
  });
  const empty = await runCommit([prior], []);
  expect(empty).toEqual({
    status: "recorded",
    commitId: "commit-2",
    revision: 2,
    ids: [],
  });
});

test("a commit after an unsettled sibling in the same response is refused", () => {
  const entries = toBatch([
    [
      "entity/create",
      {
        name: "Dryer",
        kind: "resource",
        origin: "stated",
        status: "confirmed",
      },
    ],
  ]);
  const history: LedgerHistory = {
    messages: [
      { id: "turn-1", role: "user", parts: [] },
      {
        id: "response-1",
        role: "assistant",
        parts: [
          commitPart("commit-1", entries),
          commitPart("commit-2", entries),
        ],
      },
    ],
  };
  expect(prepareAppend({ history, toolCallId: "commit-2", entries })).toEqual({
    status: "refused",
    applied: false,
    code: "concurrent-commit",
    message:
      "An earlier ledger_commit in this response has not settled; wait for its result.",
    revision: 0,
  });
});

test("the fold rejects a commit whose recorded receipt disagrees with its input", () => {
  const batch = toBatch([
    [
      "entity/create",
      {
        name: "Dryer",
        kind: "resource",
        origin: "stated",
        status: "confirmed",
      },
    ],
  ]);
  const history = settledHistory([batch]);
  const intact = foldCommits(history);
  expect(intact.revision).toBe(1);
  const assistant = history.messages[1];
  const part = assistant?.parts[0] as MutableToolPart | undefined;
  if (part === undefined) throw new Error("Missing fabricated commit part");
  part.output = { ...(part.output as object), ids: ["e9"] };
  const tampered = foldCommits(history);
  expect(tampered.revision).toBe(0);
  expect(tampered.state.entities).toEqual([]);
});

test("ledger_compile renders the committed state as the agent-skin map", async () => {
  const history = settledHistory([
    toBatch([
      [
        "entity/create",
        {
          name: "Dryer",
          kind: "resource",
          origin: "stated",
          status: "confirmed",
        },
      ],
    ]),
  ]);
  const tool = createLedgerCompileTool(async () => history);
  const result = await tool.run({
    data: v.parse(tool.input, {}),
    toolCallId: "compile-1",
    log: log(),
  });
  const output = v.parse(tool.output, result.output);
  expect(output.revision).toBe(1);
  expect(output.map).toContain("# Ledger");
  expect(output.map).toContain("Dryer");
  expect(output.map).toContain("`e1`");
});

test("claims retain prior assertions when a later claim supersedes them", () => {
  const claims = [
    {
      text: "The staffing horizon is 13 weeks.",
      entities: ["e1"],
      origin: "stated",
      status: "confirmed",
    },
    {
      text: "Use 26 weeks for the staffing horizon instead.",
      entities: ["e1"],
      origin: "stated",
      status: "confirmed",
      supersedes: ["$0"],
    },
  ];
  const batch = {
    entries: claims.map((claim) => ["claim/create", claim]),
  };
  expect(v.parse(vLedgerAppend, batch)).toEqual(batch);
});

test("a claim's source does not imply the person's agreement", () => {
  const claim = {
    text: "The shared rota lists six nurses per shift.",
    entities: ["e2"],
    origin: "evidenced",
    status: "tentative",
  };
  expect(v.parse(vClaim, claim)).toEqual(claim);
});

test("claim and reflection requests exclude system-owned metadata", () => {
  const claim = {
    text: "Drying always takes 20 minutes.",
    entities: ["e23"],
    origin: "stated",
    status: "confirmed",
  };
  const reflection = {
    text: "Approximated the fixed drying duration with a 20-minute mean; variability absent from the account is introduced.",
    claims: ["c45"],
  };
  expect(v.parse(vClaim, claim)).toEqual(claim);
  expect(v.parse(vReflection, reflection)).toEqual(reflection);
  expect(v.safeParse(vClaim, { ...claim, id: "c46", turn: 2 }).success).toBe(
    false,
  );
  expect(
    v.safeParse(vReflection, { ...reflection, revision: "revision-2", turn: 2 })
      .success,
  ).toBe(false);
  expect(v.safeParse(vReflection, { text: reflection.text }).success).toBe(
    false,
  );
  expect(v.safeParse(vClaim, { ...claim, entities: ["c45"] }).success).toBe(
    false,
  );
});

test("local references check target kind, bounds and supersession order", () => {
  const entity = {
    name: "Dryer",
    kind: "resource",
    origin: "stated",
    status: "confirmed",
  };
  const claim = {
    text: "One dryer is available.",
    entities: ["$0"],
    origin: "stated",
    status: "confirmed",
  };
  expect(
    v.safeParse(vLedgerAppend, {
      entries: [
        ["entity/create", entity],
        ["claim/create", { ...claim, entities: ["$1"] }],
      ],
    }).success,
  ).toBe(false);
  expect(
    v.safeParse(vLedgerAppend, {
      entries: [["claim/create", { ...claim, entities: ["$9"] }]],
    }).success,
  ).toBe(false);
  expect(
    v.safeParse(vLedgerAppend, {
      entries: [
        ["entity/create", entity],
        ["claim/create", { ...claim, supersedes: ["$1"] }],
      ],
    }).success,
  ).toBe(false);
  const forwardReference = {
    entries: [
      ["claim/create", { ...claim, entities: ["$1"] }],
      ["entity/create", entity],
    ],
  };
  expect(v.parse(vLedgerAppend, forwardReference)).toEqual(forwardReference);
  const updateTarget = {
    entries: [
      ["entity/update/e45", entity],
      ["claim/create", claim],
    ],
  };
  expect(v.parse(vLedgerAppend, updateTarget)).toEqual(updateTarget);
});

test("a misdirected local reference names the entry, field and target", () => {
  const entity = {
    name: "Booster PLC",
    kind: "actor",
    origin: "stated",
    status: "confirmed",
  };
  const claim = {
    text: "The PLC acts on the last reading it received.",
    entities: ["$0"],
    origin: "stated",
    status: "confirmed",
  };
  // Run p7ZTaN: `$2` meant the third entity but named the claim between them.
  const issue = v.safeParse(vLedgerAppend, {
    entries: [
      ["entity/create", entity],
      ["entity/create", { ...entity, name: "Level reading", kind: "signal" }],
      ["claim/create", claim],
      ["entity/create", { ...entity, name: "Radio failure", kind: "event" }],
      ["claim/create", { ...claim, entities: ["$2", "$3"] }],
    ],
  }).issues?.[0]?.message;
  expect(issue).toBe(
    "entries[4] (claim/create) entities references $2, which is entries[2] (claim/create); expected an entity. $index counts every entry in this queue, whatever its route.",
  );
  expect(
    v.safeParse(vLedgerAppend, {
      entries: [["claim/create", { ...claim, entities: ["$9"] }]],
    }).issues?.[0]?.message,
  ).toBe(
    "entries[0] (claim/create) entities references $9, but the queue has 1 entries ($0 to $0); expected an entity.",
  );
});

/** What Flue sends as a tool's parameters (`toolInputToJsonSchema`). */
const flueParameters = (schema: v.GenericSchema) => {
  const { $schema: _schema, ...parameters } = toJsonSchema(schema, {
    errorMode: "ignore",
  });
  return parameters;
};

type DescribedEnums = typeof vEntityKind | typeof vOrigin | typeof vStatus;

const literalsOf = (schema: DescribedEnums) =>
  schema.options.map((option) => ({
    literal: option.literal,
    description: v.getDescription(option),
  }));

test("each entity kind's description opens with its stage", () => {
  for (const option of vEntityKind.options)
    expect(v.getDescription(option)?.toLowerCase()).toMatch(
      new RegExp(`^${entityKindStages[option.literal]}: `),
    );
});

test("Flue's tool schema carries entity kind, origin and status descriptions", () => {
  const parameters = flueParameters(vLedgerAppend);
  const anyOf = (schema: DescribedEnums) => ({
    description: v.getDescription(schema),
    anyOf: literalsOf(schema).map(({ literal, description }) => ({
      const: literal,
      description,
    })),
  });
  expect(parameters).toMatchObject({
    properties: {
      entries: {
        type: "array",
        items: {
          anyOf: [
            {
              items: [
                { const: "entity/create" },
                {
                  properties: {
                    kind: anyOf(vEntityKind),
                    origin: anyOf(vOrigin),
                    status: anyOf(vStatus),
                  },
                  required: ["name", "kind", "origin", "status"],
                },
              ],
            },
            {
              items: [
                {
                  type: "string",
                  pattern: "^entity\\/update\\/e(?:0|[1-9]\\d*)$",
                },
                {
                  required: ["name", "kind", "origin", "status"],
                },
              ],
            },
            {
              items: [
                { const: "claim/create" },
                {
                  properties: {
                    entities: {
                      type: "array",
                      items: {
                        anyOf: [
                          { pattern: "^e(?:0|[1-9]\\d*)$" },
                          { pattern: "^\\$(?:0|[1-9]\\d*)$" },
                        ],
                      },
                    },
                    origin: anyOf(vOrigin),
                    status: anyOf(vStatus),
                  },
                  required: ["text", "entities", "origin", "status"],
                },
              ],
            },
            {
              items: [
                { const: "reflection/create" },
                {
                  properties: {
                    text: { type: "string" },
                    netElements: {
                      type: "array",
                      items: {
                        properties: { kind: { enum: netElementKinds } },
                      },
                    },
                    claims: { type: "array" },
                    entities: { type: "array" },
                  },
                  required: ["text"],
                },
              ],
            },
          ],
        },
      },
    },
  });
});

const live = process.env.BRUNCH_LIVE_MODEL_TESTS === "1";

describe.skipIf(!live).concurrent("kind enums with a live model", () => {
  /** Sends one message with the commit tool; fails unless the call parses. */
  const append = async (message: string, constructionObservation = "") => {
    const models = createModels();
    models.setProvider(anthropicProvider());
    models.setProvider(openaiProviderWithAddedModels());
    const specifier = selectChatModelSpecifier();
    const slash = specifier.indexOf("/");
    const model = models.getModel(
      specifier.slice(0, slash),
      specifier.slice(slash + 1),
    );
    if (!model) throw new Error(`Unknown model ${specifier}`);
    const thinking = selectChatThinking();
    const context: Context = {
      systemPrompt: `You keep the record of a modelling conversation. USER means the interviewee whose account is being elicited. There are no existing entities or claims, so use only create routes. Record the USER's latest message by calling ${brunchTools.ledgerCommit} exactly once. Each entry is exactly [route, payload]. Do not assign IDs or submit turns; relationships use $index references to positions in this call's entire entries queue. Do not reply in text. ${constructionObservation}`,
      messages: [{ role: "user", content: message, timestamp: Date.now() }],
      tools: [
        {
          name: brunchTools.ledgerCommit,
          description: commitToolDescription,
          parameters: flueParameters(vLedgerAppend),
        },
      ],
    };
    const response = await models.completeSimple(model, context, {
      reasoning: thinking === "off" ? undefined : thinking,
    });
    if (response.stopReason === "error")
      throw new Error(response.errorMessage ?? "Model request failed");
    const calls = response.content.filter((block) => block.type === "toolCall");
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (call?.type !== "toolCall")
      throw new Error(
        `No ${brunchTools.ledgerCommit} call: ${response.stopReason}`,
      );
    expect(call.name).toBe(brunchTools.ledgerCommit);
    const recorded = v.parse(vLedgerAppend, call.arguments);
    for (const [route] of recorded.entries)
      expect(route).not.toMatch(/\/update\//);
    const entities = recorded.entries.flatMap(([route, payload]) =>
      route === "entity/create" ? [payload] : [],
    );
    const claims = recorded.entries.flatMap(([route, payload]) =>
      route === "claim/create" ? [payload] : [],
    );
    const reflections = recorded.entries.flatMap(([route, payload]) =>
      route === "reflection/create" ? [payload] : [],
    );
    expect(entities.length).toBeGreaterThan(0);
    expect(claims.length).toBeGreaterThan(0);
    for (const entity of entities) {
      expect(entity).not.toHaveProperty("id");
    }
    for (const claim of claims) {
      expect(claim).not.toHaveProperty("id");
      expect(claim).not.toHaveProperty("turn");
      for (const reference of claim.entities)
        expect(reference).toMatch(/^\$\d+$/);
    }
    for (const reflection of reflections) {
      expect(reflection).not.toHaveProperty("revision");
      expect(reflection).not.toHaveProperty("turn");
      for (const reference of [
        ...(reflection.claims ?? []),
        ...(reflection.entities ?? []),
      ])
        expect(reference).toMatch(/^\$\d+$/);
    }
    const receipt = await runCommit([], recorded.entries);
    expect(receipt.status).toBe("recorded");
    if (receipt.status !== "recorded")
      throw new Error("Receipt expected to be recorded");
    expect(receipt.ids).toHaveLength(recorded.entries.length);
    recorded.entries.forEach(([route], index) => {
      const prefix = route.startsWith("entity/")
        ? "e"
        : route === "claim/create"
          ? "c"
          : "r";
      expect(receipt.ids[index]).toMatch(new RegExp(`^${prefix}\\d+$`));
    });
    return { entries: recorded.entries, entities, claims, reflections };
  };

  test("names objectives and constraints as entities from their descriptions", async () => {
    const recorded = await append(
      "What I care about is how long patients wait in A&E. We need to bring that down: an average under 4 hours would count as a success, and no patient should ever wait more than 12 hours.",
    );
    expect(recorded.entities.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(["metric", "direction", "target", "threshold"]),
    );
    for (const claim of recorded.claims) {
      expect(claim.origin).toBe("stated");
      expect(claim.status).toBe("confirmed");
    }
  }, 120_000);

  test("pencils in an undecided resource without treating it as confirmed", async () => {
    const recorded = await append(
      "We might use agency nurses, but I haven't decided yet. If we do, only how many are free matters, not who they are.",
    );
    const nurses = recorded.entities.filter(
      ({ kind, name }) => kind === "resource" && /nurs/i.test(name),
    );
    expect(nurses).not.toHaveLength(0);
    for (const nurse of nurses) {
      expect(nurse.origin).toBe("stated");
      expect(nurse.status).toBe("tentative");
    }
  }, 120_000);

  test("records two independently named horizons", async () => {
    const recorded = await append(
      "We need two horizons: 13 weeks for staffing decisions and 104 weeks for investment decisions.",
    );
    const horizons = recorded.entities.filter(({ kind }) => kind === "horizon");
    expect(horizons).toHaveLength(2);
    const horizonReferences = recorded.entries.flatMap(
      ([route, payload], index) =>
        route === "entity/create" && payload.kind === "horizon"
          ? [`$${index}`]
          : [],
    );
    expect(recorded.claims.flatMap((claim) => claim.entities)).toEqual(
      expect.arrayContaining(horizonReferences),
    );
  }, 120_000);

  test("records a reading as a signal and its controller as an actor", async () => {
    const recorded = await append(
      "The pump controller switches the pump on the tank level reading it gets over the radio every five minutes, and sometimes those readings drop.",
    );
    expect(
      recorded.entities.filter(
        ({ kind, name }) => kind === "signal" && /reading/i.test(name),
      ),
    ).not.toHaveLength(0);
    expect(
      recorded.entities.filter(
        ({ kind, name }) => kind === "actor" && /controller/i.test(name),
      ),
    ).not.toHaveLength(0);
  }, 120_000);

  test("records the session's time as an appetite, not a horizon", async () => {
    const recorded = await append(
      "I've only got about half an hour for this today.",
    );
    expect(recorded.entities.map(({ kind }) => kind)).toContain("appetite");
    expect(recorded.entities.map(({ kind }) => kind)).not.toContain("horizon");
  }, 120_000);

  test("one tuple queue connects elicitation to an explained construction choice", async () => {
    const placeId = "73bb8e88-a8d7-4a81-99e1-8398b928d6d3";
    const recorded = await append(
      "We have one dryer. Each batch holds it for the whole drying operation.",
      `For this isolated demo, the construction observation is a fixture: ` +
        `a net tool successfully created a place with ID ${placeId}, ` +
        `name Available dryer, and one capacity token. ` +
        `This change addresses the USER's dryer-capacity assertion. ` +
        `In the same ledger_commit call, record at least one reflection that ` +
        `references the created place in netElements by kind and ID, ` +
        `links the addressed claims and the dryer entity with $index references, ` +
        `and explains the representation. ` +
        `Batch hold/release wiring has not been added; note that consequential omission in reflection text.`,
    );

    const dryerReference = recorded.entries.findIndex(
      ([route, payload]) =>
        route === "entity/create" &&
        payload.kind === "resource" &&
        /dryer/i.test(payload.name),
    );
    expect(dryerReference).toBeGreaterThanOrEqual(0);
    const dryer = recorded.entities.find(
      ({ kind, name }) => kind === "resource" && /dryer/i.test(name),
    );
    expect(dryer).toBeDefined();
    const placeReflections = recorded.reflections.filter((reflection) =>
      (reflection.netElements ?? []).some(
        ({ kind, id }) => kind === "place" && id === placeId,
      ),
    );
    expect(placeReflections).not.toHaveLength(0);
    expect(
      placeReflections.flatMap((reflection) => reflection.entities ?? []),
    ).toContain(`$${dryerReference}`);
    expect(
      placeReflections.flatMap((reflection) => reflection.claims ?? []),
    ).not.toHaveLength(0);
    expect(
      recorded.reflections.some(({ text }) => /hold|release/i.test(text)),
    ).toBe(true);
  }, 120_000);
});
