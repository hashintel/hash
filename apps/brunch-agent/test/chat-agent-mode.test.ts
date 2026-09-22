import { createHash } from "node:crypto";

import * as v from "valibot";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { readPetrinautNetToolName } from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  BRUNCH_DECLARED_PROJECTION_MODE,
  BRUNCH_DEEP_CONSTRUCTION_MODE,
  INTEGRATED_BRUNCH_MODE,
  STOCK_OVER_FLUE_MODE,
  applyPetrinautConstructionToolName,
  declarePetrinautProjectionToolName,
  sdcpnInitialDataSchema,
} from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { clientToolResultSignal } from "@hashintel/brunch-agent-transport-aisdk";
import {
  petrinautAiCapabilityGuidance,
  petrinautAiPrompt,
  petrinautAiTools,
} from "@hashintel/petrinaut-core/ai";

import {
  assertPetrinautToolCatalogueConformance,
  canonicalPetrinautToolCatalogue,
  toolCatalogueByMode,
} from "../src/agents/chat-agent/tool-catalogue.ts";
import { AWAITING_CLIENT } from "../src/conversation/client-tools.ts";
import {
  queryWorkpieceDescription,
  recordedQueryObservation,
  uniqueVerifiedObservationCallId,
} from "../src/conversation/why.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";

const mounted = vi.hoisted(() => ({
  delivery: { kind: "user", body: "test" } as unknown,
  initialData: undefined as unknown,
  contextProjections: 0,
  instructions: [] as string[],
  models: [] as string[],
  skills: [] as string[],
  tools: [] as string[],
}));

vi.mock("@flue/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/runtime")>()),
  useAgentStart: () => undefined,
  useContextProjection: () => {
    mounted.contextProjections += 1;
  },
  useDelivery: () => mounted.delivery,
  useInitialData: () => mounted.initialData,
  useInstruction: (instruction: string) =>
    mounted.instructions.push(instruction),
  useModel: (model: string) => mounted.models.push(model),
  usePersistentState: (_key: string, initialValue: unknown) => [
    initialValue,
    vi.fn<(value: unknown) => void>(),
  ],
  useSkill: (skill: { name: string }) => mounted.skills.push(skill.name),
  useTool: (tool: { name: string }) => mounted.tools.push(tool.name),
}));

const construction = {
  binding: {
    conversationId: "conversation",
    documentId: "document",
    incarnationId: "incarnation",
  },
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("BRUNCH_CHAT_MODEL", "claude-sonnet-4-6");
  vi.stubEnv("BRUNCH_TEST_KEEP_RECENT_TOKENS", undefined);
  vi.stubEnv("NODE_ENV", "test");
  mounted.delivery = { kind: "user", body: "test" };
  mounted.initialData = undefined;
  mounted.contextProjections = 0;
  mounted.instructions.length = 0;
  mounted.models.length = 0;
  mounted.skills.length = 0;
  mounted.tools.length = 0;
});

afterEach(() => vi.unstubAllEnvs());

test("Stock-over-Flue returns the exact Stock prompt and canonical catalogue only", async () => {
  mounted.initialData = { mode: STOCK_OVER_FLUE_MODE, construction };
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");

  expect(renderChatAgent({ id: "stock-control" })).toBe(petrinautAiPrompt);
  expect(mounted.models).toEqual(["anthropic/claude-sonnet-4-6"]);
  expect(mounted.contextProjections).toBe(0);
  expect(mounted.tools).toEqual(Object.keys(petrinautAiTools));
  expect(mounted.skills).toEqual([]);
  expect(mounted.instructions).toEqual([]);
});

test.each([
  INTEGRATED_BRUNCH_MODE,
  BRUNCH_DECLARED_PROJECTION_MODE,
  BRUNCH_DEEP_CONSTRUCTION_MODE,
])("%s inherits the complete integrated Brunch baseline", async (mode) => {
  mounted.initialData = { mode, construction };
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");

  const prompt = renderChatAgent({ id: `instance-${mode}` });
  expect(prompt).not.toBe(petrinautAiPrompt);
  expect(prompt).toContain("Ledger");
  expect(mounted.models).toEqual(["anthropic/claude-sonnet-4-6"]);
  expect(mounted.contextProjections).toBe(1);
  expect(mounted.skills).toEqual(
    expect.arrayContaining(["elicitation", "sdcpn-modelling"]),
  );
  expect(mounted.tools).toEqual(
    expect.arrayContaining([
      "mutate_workpiece",
      "read_workpiece",
      "query_workpiece",
      "ping",
      ...Object.keys(petrinautAiTools),
    ]),
  );
  expect(mounted.instructions).toContain(petrinautAiCapabilityGuidance);
  const integratedInstructions = mounted.instructions.join("\n");
  expect(integratedInstructions).not.toContain(
    "Pick an interesting domain and build a small but complete SDCPN end-to-end",
  );
  expect(integratedInstructions).toContain(
    "the host attaches the verified read's correlation",
  );
  expect(integratedInstructions).not.toContain(
    "blocked by that host-schema dependency",
  );
  expect(integratedInstructions).not.toContain(
    "model-required observationToolCallId",
  );
  expect(integratedInstructions).not.toContain("any correlation field");

  const declarationIndex = mounted.tools.indexOf(
    declarePetrinautProjectionToolName,
  );
  const expectedDeclarationIndex =
    mode === BRUNCH_DECLARED_PROJECTION_MODE
      ? mounted.tools.indexOf("addPlace") - 1
      : -1;
  expect(declarationIndex).toBe(expectedDeclarationIndex);
  expect(mounted.tools.includes(applyPetrinautConstructionToolName)).toBe(
    mode === BRUNCH_DEEP_CONSTRUCTION_MODE,
  );
});

test("query workpiece description is mode-neutral and host-correlated", () => {
  expect(queryWorkpieceDescription).toContain(
    "current mounted Petrinaut definition read",
  );
  expect(queryWorkpieceDescription).not.toContain("read_petrinaut_net");
  expect(queryWorkpieceDescription).not.toMatch(
    /observationToolCallId|baseHash|sha256/u,
  );
});

test("contextual client-result diagnostics stay distinct from canonical results", async () => {
  mounted.initialData = { mode: INTEGRATED_BRUNCH_MODE, construction };
  const diagnosticsContext = "Host diagnostics for this continuation only.";
  mounted.delivery = clientToolResultSignal(
    [
      {
        toolCallId: "browser-read",
        toolName: "getLatestNetDefinition",
        output: { title: "Canonical title", definition: {} },
        metadata: { retained: "canonical sidecar" },
      },
    ],
    diagnosticsContext,
  );
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");

  renderChatAgent({ id: "contextual-result" });
  expect(mounted.instructions).toContain(
    `Host diagnostics for this client-result continuation (context only, never user testimony or semantic evidence):\n${diagnosticsContext}`,
  );
  expect(mounted.instructions.join("\n")).not.toContain("Canonical title");
  expect(mounted.instructions.join("\n")).not.toContain("canonical sidecar");
});

test.each(["getLatestNetDefinition", readPetrinautNetToolName])(
  "retains verified %s result metadata as a canonical observation",
  async (toolName) => {
    const definition = {
      places: [],
      transitions: [],
      types: [],
      parameters: [],
      differentialEquations: [],
    };
    const toolCallId = `read-${toolName}`;
    const result = clientToolResultSignal([
      {
        toolCallId,
        toolName,
        output: { title: "Canonical title", definition },
        metadata: {
          observation: {
            toolCallId,
            binding: construction.binding,
            observed: {
              definition,
              sha256: createHash("sha256")
                .update(JSON.stringify(definition))
                .digest("hex"),
            },
          },
        },
      },
    ]);
    const snapshot: FlueConversationSnapshot = {
      v: 1,
      conversationId: construction.binding.conversationId,
      offset: "1",
      settlements: [],
      messages: [
        {
          id: `assistant-${toolCallId}`,
          role: "assistant",
          purpose: "assistant",
          display: "visible",
          parts: [
            {
              type: "dynamic-tool",
              toolCallId,
              toolName,
              state: "output-available",
              input: {},
              output: { awaiting: AWAITING_CLIENT },
            },
          ],
        },
        {
          id: `dispatch-${toolCallId}`,
          role: "system",
          purpose: "dispatch",
          display: "hidden",
          signal: { tagName: result.tagName },
          parts: [{ type: "text", text: result.body, state: "done" }],
        },
      ],
    };

    await expect(
      recordedQueryObservation(snapshot, construction, toolCallId),
    ).resolves.toMatchObject({ definition });
  },
);

test("host correlation selects exactly one verified current read", async () => {
  const verify = async (callId: string) => {
    if (callId === "invalid-read") throw new Error("Unverified read");
  };

  await expect(
    uniqueVerifiedObservationCallId([], verify),
  ).resolves.toBeUndefined();
  await expect(
    uniqueVerifiedObservationCallId(["current-read"], verify),
  ).resolves.toBe("current-read");
  await expect(
    uniqueVerifiedObservationCallId(["invalid-read"], verify),
  ).resolves.toBeUndefined();
  await expect(
    uniqueVerifiedObservationCallId(["read-b", "read-a"], verify),
  ).resolves.toBeUndefined();
});

test("canonical mode schema requires immutable bindings and rejects unrelated combinations", () => {
  for (const mode of [
    STOCK_OVER_FLUE_MODE,
    INTEGRATED_BRUNCH_MODE,
    BRUNCH_DECLARED_PROJECTION_MODE,
    BRUNCH_DEEP_CONSTRUCTION_MODE,
  ]) {
    expect(v.parse(sdcpnInitialDataSchema, { mode, construction })).toEqual({
      mode,
      construction,
    });
    expect(() => v.parse(sdcpnInitialDataSchema, { mode })).toThrow(
      /distinct immutable binding/u,
    );
  }

  expect(() =>
    v.parse(sdcpnInitialDataSchema, {
      mode: "validated-construction",
      construction,
    }),
  ).toThrow(/distinct immutable binding/u);
  expect(() =>
    v.parse(sdcpnInitialDataSchema, {
      mode: "not-a-mode",
      construction,
    }),
  ).toThrow(/Invalid type/u);
});

test("catalogues classify every canonical tool per mode and reject an unclassified addition", () => {
  const canonicalNames = Object.keys(petrinautAiTools);
  expect(canonicalPetrinautToolCatalogue.map(({ name }) => name)).toEqual(
    canonicalNames,
  );
  expect(toolCatalogueByMode[STOCK_OVER_FLUE_MODE]).toEqual(
    canonicalPetrinautToolCatalogue,
  );
  for (const mode of [
    INTEGRATED_BRUNCH_MODE,
    BRUNCH_DECLARED_PROJECTION_MODE,
    BRUNCH_DEEP_CONSTRUCTION_MODE,
  ] as const) {
    expect(toolCatalogueByMode[mode].map(({ name }) => name)).toEqual(
      expect.arrayContaining(canonicalNames),
    );
  }
  const declaration = toolCatalogueByMode[BRUNCH_DECLARED_PROJECTION_MODE].find(
    ({ name }) => name === declarePetrinautProjectionToolName,
  );
  expect(declaration).toEqual({
    name: declarePetrinautProjectionToolName,
    definitionOwner: "sdcpn-plugin",
    executionOwner: "brunch-app",
    capability: "petrinaut-declaration",
  });
  expect(
    toolCatalogueByMode[BRUNCH_DECLARED_PROJECTION_MODE].map(
      ({ name }) => name,
    ),
  ).toEqual([
    ...toolCatalogueByMode[INTEGRATED_BRUNCH_MODE]
      .map(({ name }) => name)
      .slice(0, -canonicalNames.length),
    declarePetrinautProjectionToolName,
    ...canonicalNames,
  ]);
  for (const mode of [
    STOCK_OVER_FLUE_MODE,
    INTEGRATED_BRUNCH_MODE,
    BRUNCH_DEEP_CONSTRUCTION_MODE,
  ] as const) {
    expect(toolCatalogueByMode[mode].map(({ name }) => name)).not.toContain(
      declarePetrinautProjectionToolName,
    );
  }
  const deepConstruction = toolCatalogueByMode[
    BRUNCH_DEEP_CONSTRUCTION_MODE
  ].find(({ name }) => name === applyPetrinautConstructionToolName);
  expect(deepConstruction).toEqual({
    name: applyPetrinautConstructionToolName,
    definitionOwner: "sdcpn-plugin",
    executionOwner: "petrinaut-website",
    capability: "petrinaut-mutation",
  });
  expect(
    toolCatalogueByMode[BRUNCH_DEEP_CONSTRUCTION_MODE].map(({ name }) => name),
  ).toEqual([
    ...toolCatalogueByMode[INTEGRATED_BRUNCH_MODE].map(({ name }) => name),
    applyPetrinautConstructionToolName,
  ]);
  for (const mode of [
    STOCK_OVER_FLUE_MODE,
    INTEGRATED_BRUNCH_MODE,
    BRUNCH_DECLARED_PROJECTION_MODE,
  ] as const) {
    expect(toolCatalogueByMode[mode].map(({ name }) => name)).not.toContain(
      applyPetrinautConstructionToolName,
    );
  }
  expect(() =>
    assertPetrinautToolCatalogueConformance([
      ...canonicalNames,
      "newCanonicalStockTool",
    ]),
  ).toThrow(/unclassified: newCanonicalStockTool/u);
});
