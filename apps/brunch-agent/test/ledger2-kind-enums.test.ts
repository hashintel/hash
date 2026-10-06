// Live probes need BRUNCH_LIVE_MODEL_TESTS=1 and the chat model's API key.
import { createModels, type Context } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { type FlueLogger } from "@flue/runtime";
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { describe, expect, test, vi } from "vitest";

import { netElementKinds } from "@hashintel/brunch-agent-plugin-sdcpn";

import { vReflection } from "../src/agents/chat-agent/guidance/manual/tools/ledger2/construction/reflections.ts";
import {
  appendToolDescription,
  appendToolName,
  demoAppendTool,
} from "../src/agents/chat-agent/guidance/manual/tools/ledger2/demo-tool.ts";
import { vClaim } from "../src/agents/chat-agent/guidance/manual/tools/ledger2/elicitation/claims.ts";
import {
  vEntity,
  vEntityKind,
} from "../src/agents/chat-agent/guidance/manual/tools/ledger2/elicitation/entities.ts";
import {
  vOrigin,
  vStatus,
} from "../src/agents/chat-agent/guidance/manual/tools/ledger2/shared/epistemics.ts";
import {
  selectChatModelSpecifier,
  selectChatThinking,
} from "../src/chat-model.ts";
import { openaiProviderWithAddedModels } from "../src/openai-provider.ts";

import type { LedgerAppend } from "../src/agents/chat-agent/guidance/manual/tools/ledger2/append.ts";

const runDemo = async (data: LedgerAppend) => {
  const result = await demoAppendTool.run({
    data,
    toolCallId: "ledger2-demo-call",
    log: {
      info: vi.fn<FlueLogger["info"]>(),
      warn: vi.fn<FlueLogger["warn"]>(),
      error: vi.fn<FlueLogger["error"]>(),
    },
  });
  return v.parse(demoAppendTool.output, result.output);
};

test("one mixed append batch carries all three record types", async () => {
  const batch = {
    entries: [
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
    ],
  };
  const parsed = v.parse(demoAppendTool.input, batch);
  expect(parsed).toEqual(batch);
  expect(await runDemo(parsed)).toEqual({
    claims: 1,
    entities: 1,
    reflections: 2,
  });
});

test("entity routes split creation from full update of an addressed entity", async () => {
  const update = {
    name: "Staffing horizon",
    kind: "horizon",
    origin: "stated",
    status: "confirmed",
  };
  const batch = {
    entries: [
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
      ["entity/update/e1", update],
    ],
  };
  const parsed = v.parse(demoAppendTool.input, batch);
  expect(parsed).toEqual(batch);
  expect(await runDemo(parsed)).toEqual({
    claims: 0,
    entities: 3,
    reflections: 0,
  });
  expect(v.safeParse(vEntity, { ...update, id: "e1" }).success).toBe(false);
  expect(
    v.safeParse(demoAppendTool.input, {
      entries: [
        ["entity/update/e1", { name: update.name, status: update.status }],
      ],
    }).success,
  ).toBe(false);
  for (const route of ["entity/update", "entity/update/c1", "entity/update/$0"])
    expect(
      v.safeParse(demoAppendTool.input, { entries: [[route, update]] }).success,
    ).toBe(false);
});

test("construction-only queues may reference existing claims", async () => {
  const batch = {
    entries: [
      [
        "reflection/create",
        {
          text: "Used a 20-minute mean drying time for the stated drying duration; the stated fixed duration becomes a distribution.",
          claims: ["c99"],
        },
      ],
    ],
  };
  const parsed = v.parse(demoAppendTool.input, batch);
  expect(parsed).toEqual(batch);
  expect(await runDemo(parsed)).toEqual({
    claims: 0,
    entities: 0,
    reflections: 1,
  });
  expect(await runDemo(v.parse(demoAppendTool.input, { entries: [] }))).toEqual(
    {
      claims: 0,
      entities: 0,
      reflections: 0,
    },
  );
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
  expect(v.parse(demoAppendTool.input, batch)).toEqual(batch);
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
    v.safeParse(demoAppendTool.input, {
      entries: [
        ["entity/create", entity],
        ["claim/create", { ...claim, entities: ["$1"] }],
      ],
    }).success,
  ).toBe(false);
  expect(
    v.safeParse(demoAppendTool.input, {
      entries: [["claim/create", { ...claim, entities: ["$9"] }]],
    }).success,
  ).toBe(false);
  expect(
    v.safeParse(demoAppendTool.input, {
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
  expect(v.parse(demoAppendTool.input, forwardReference)).toEqual(
    forwardReference,
  );
  const updateTarget = {
    entries: [
      ["entity/update/e45", entity],
      ["claim/create", claim],
    ],
  };
  expect(v.parse(demoAppendTool.input, updateTarget)).toEqual(updateTarget);
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

test("Flue's tool schema carries entity kind, origin and status descriptions", () => {
  const parameters = flueParameters(demoAppendTool.input);
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
  /** Sends one message with the demo tool; fails unless the call parses. */
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
      systemPrompt: `You keep the record of a modelling conversation. USER means the interviewee whose account is being elicited. There are no existing entities or claims, so use only create routes. Record the USER's latest message by calling ${appendToolName} exactly once. Each entry is exactly [route, payload]. Do not assign IDs or submit turns; relationships use $index references to positions in this call's entire entries queue. Do not reply in text. ${constructionObservation}`,
      messages: [{ role: "user", content: message, timestamp: Date.now() }],
      tools: [
        {
          name: appendToolName,
          description: appendToolDescription,
          parameters: flueParameters(demoAppendTool.input),
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
      throw new Error(`No ${appendToolName} call: ${response.stopReason}`);
    expect(call.name).toBe(appendToolName);
    const recorded = v.parse(demoAppendTool.input, call.arguments);
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
    expect(await runDemo(recorded)).toEqual({
      claims: claims.length,
      entities: entities.length,
      reflections: reflections.length,
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
