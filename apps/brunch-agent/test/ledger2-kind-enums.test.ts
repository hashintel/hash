// Live probes need BRUNCH_LIVE_MODEL_TESTS=1 and the chat model's API key.
import { createModels, type Context } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { type FlueLogger } from "@flue/runtime";
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { describe, expect, test, vi } from "vitest";

import { netElementKinds } from "@hashintel/brunch-agent-plugin-sdcpn";

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

test("one mixed append batch carries all four record types", async () => {
  const batch = {
    elicitation: {
      entities: [
        {
          id: "dryer",
          name: "Dryer",
          kind: "resource",
          origin: "stated",
          status: "confirmed",
        },
      ],
      claims: [
        {
          id: "c1",
          turn: 1,
          text: "There is one dryer, held by each batch while drying.",
          entities: ["dryer"],
          origin: "stated",
          status: "confirmed",
        },
      ],
    },
    construction: {
      mutations: [{ revision: "revision-2", turn: 1, claims: ["c1"] }],
      elements: [
        {
          address: { kind: "place", id: "p-dryer" },
          text: "The place represents available dryer capacity.",
          status: "tentative",
          entities: ["dryer"],
          claims: ["c1"],
        },
      ],
    },
  };
  const parsed = v.parse(demoAppendTool.input, batch);
  expect(parsed).toEqual(batch);
  expect(await runDemo(parsed)).toEqual({
    claims: 1,
    entities: 1,
    mutations: 1,
    elements: 1,
  });
});

test("entities can be pencilled in and updated in full under the same ID", async () => {
  const entities = [
    {
      id: "e1",
      name: "staffing-horizon",
      kind: "horizon",
      origin: "assumed",
      status: "tentative",
    },
    {
      id: "e2",
      name: "investment-horizon",
      kind: "horizon",
      origin: "stated",
      status: "confirmed",
    },
    {
      id: "e1",
      name: "Staffing horizon",
      kind: "horizon",
      origin: "stated",
      status: "confirmed",
    },
  ];
  const parsed = v.parse(demoAppendTool.input, { elicitation: { entities } });
  expect(parsed).toEqual({ elicitation: { entities } });
  expect(await runDemo(parsed)).toEqual({
    claims: 0,
    entities: 3,
    mutations: 0,
    elements: 0,
  });
  expect(v.safeParse(vEntity, { id: "e1", status: "confirmed" }).success).toBe(
    false,
  );
});

test("construction-only batches may reference earlier claims and omit elicitation", async () => {
  const batch = {
    construction: {
      mutations: [
        { revision: "revision-3", turn: 2, claims: ["earlier-claim"] },
      ],
      elements: [],
    },
  };
  const parsed = v.parse(demoAppendTool.input, batch);
  expect(parsed).toEqual(batch);
  expect(await runDemo(parsed)).toEqual({
    claims: 0,
    entities: 0,
    mutations: 1,
    elements: 0,
  });
});

test("claims retain prior assertions when a later claim supersedes them", () => {
  const claims = [
    {
      id: "c1",
      turn: 1,
      text: "The staffing horizon is 13 weeks.",
      entities: ["e1"],
      origin: "stated",
      status: "confirmed",
    },
    {
      id: "c2",
      turn: 2,
      text: "Use 26 weeks for the staffing horizon instead.",
      entities: ["e1"],
      origin: "stated",
      status: "confirmed",
      supersedes: ["c1"],
    },
  ];
  expect(v.parse(demoAppendTool.input, { elicitation: { claims } })).toEqual({
    elicitation: { claims },
  });
});

test("a claim's source does not imply the person's agreement", () => {
  const claim = {
    id: "c3",
    turn: 3,
    text: "The shared rota lists six nurses per shift.",
    entities: ["e2"],
    origin: "evidenced",
    status: "tentative",
  };
  expect(v.parse(vClaim, claim)).toEqual(claim);
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
      elicitation: {
        properties: {
          entities: {
            items: {
              properties: {
                kind: anyOf(vEntityKind),
                origin: anyOf(vOrigin),
                status: anyOf(vStatus),
              },
            },
          },
          claims: {
            items: {
              properties: {
                entities: { type: "array", items: { type: "string" } },
                origin: anyOf(vOrigin),
                status: anyOf(vStatus),
              },
            },
          },
        },
      },
      construction: {
        properties: {
          mutations: {
            items: { properties: { revision: { type: "string" } } },
          },
          elements: {
            items: {
              properties: {
                status: anyOf(vStatus),
                address: {
                  properties: { kind: { enum: netElementKinds } },
                },
              },
            },
          },
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
      systemPrompt: `You keep the record of a modelling conversation. USER means the interviewee whose account is being elicited. The current turn is 1, and no entities or claims have been recorded yet. Record the USER's latest message by calling ${appendToolName} exactly once. Do not reply in text. ${constructionObservation}`,
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
    const entities = recorded.elicitation?.entities ?? [];
    const claims = recorded.elicitation?.claims ?? [];
    const entityIds = entities.map(({ id }) => id);
    const claimIds = claims.map(({ id }) => id);
    expect(entities.length).toBeGreaterThan(0);
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) {
      expect(claim.turn).toBe(1);
      expect(entityIds).toEqual(expect.arrayContaining(claim.entities));
    }
    for (const mutation of recorded.construction?.mutations ?? []) {
      expect(mutation.turn).toBe(1);
      expect(claimIds).toEqual(expect.arrayContaining(mutation.claims));
    }
    for (const element of recorded.construction?.elements ?? []) {
      expect(entityIds).toEqual(expect.arrayContaining(element.entities));
      expect(claimIds).toEqual(expect.arrayContaining(element.claims));
    }
    expect(await runDemo(recorded)).toEqual({
      claims: claims.length,
      entities: entities.length,
      mutations: recorded.construction?.mutations?.length ?? 0,
      elements: recorded.construction?.elements?.length ?? 0,
    });
    return recorded;
  };

  test("names objectives and constraints as entities from their descriptions", async () => {
    const recorded = await append(
      "What I care about is how long patients wait in A&E. We need to bring that down: an average under 4 hours would count as a success, and no patient should ever wait more than 12 hours.",
    );
    expect(recorded.elicitation?.entities?.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(["metric", "direction", "target", "threshold"]),
    );
    for (const claim of recorded.elicitation?.claims ?? []) {
      expect(claim.origin).toBe("stated");
      expect(claim.status).toBe("confirmed");
    }
  }, 120_000);

  test("pencils in an undecided resource without treating it as confirmed", async () => {
    const recorded = await append(
      "We might use agency nurses, but I haven't decided yet. If we do, only how many are free matters, not who they are.",
    );
    const nurses =
      recorded.elicitation?.entities?.filter(({ name }) =>
        /nurs/i.test(name),
      ) ?? [];
    expect(nurses).not.toHaveLength(0);
    expect(nurses.map(({ kind }) => kind)).toEqual(
      nurses.map(() => "resource"),
    );
    for (const nurse of nurses) {
      expect(nurse.origin).toBe("stated");
      expect(nurse.status).toBe("tentative");
    }
  }, 120_000);

  test("records two independently named horizons", async () => {
    const recorded = await append(
      "We need two horizons: 13 weeks for staffing decisions and 104 weeks for investment decisions.",
    );
    const horizons =
      recorded.elicitation?.entities?.filter(
        ({ kind }) => kind === "horizon",
      ) ?? [];
    expect(horizons).toHaveLength(2);
    expect(new Set(horizons.map(({ id }) => id)).size).toBe(2);
    expect(
      recorded.elicitation?.claims?.flatMap(({ entities }) => entities),
    ).toEqual(expect.arrayContaining(horizons.map(({ id }) => id)));
  }, 120_000);

  test("one append call connects elicitation to observed construction", async () => {
    const revision = "8abbe990-0c5b-4f41-8c0c-9481a8f15a8b";
    const placeId = "73bb8e88-a8d7-4a81-99e1-8398b928d6d3";
    const recorded = await append(
      "We have one dryer. Each batch holds it for the whole drying operation.",
      `For this isolated demo, the construction observation is a fixture: ` +
        `a net tool successfully created a place with ID ${placeId}, ` +
        `name Available dryer, and one capacity token, at net revision ${revision}. ` +
        `This change addresses the USER's dryer-capacity assertion. ` +
        `In the same ledger_append call, include a mutation recording that revision and its addressed claim IDs, ` +
        `and an element interpreting that place with nonempty entity and claim references. ` +
        `The USER has not agreed to the place interpretation; mark it tentative.`,
    );

    const dryer = recorded.elicitation?.entities?.find(
      ({ kind, name }) => kind === "resource" && /dryer/i.test(name),
    );
    expect(dryer).toBeDefined();
    const mutations = recorded.construction?.mutations ?? [];
    expect(mutations).toHaveLength(1);
    expect(mutations[0]?.revision).toBe(revision);

    const elements = recorded.construction?.elements ?? [];
    expect(elements).toHaveLength(1);
    const element = elements[0];
    expect(element?.address).toEqual({ kind: "place", id: placeId });
    expect(element?.status).toBe("tentative");
    expect(element?.entities).toContain(dryer?.id);
    expect(element?.claims.length).toBeGreaterThan(0);
    for (const claimId of element?.claims ?? []) {
      expect(mutations[0]?.claims).toContain(claimId);
    }
  }, 120_000);
});
