import { readFile } from "node:fs/promises";

import * as v from "valibot";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";
import { sdcpnInitialDataSchema } from "@hashintel/brunch-agent-plugin-sdcpn";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import {
  commitToolDescription,
  compileToolDescription,
} from "../src/agents/chat-agent/guidance/manual/tools/ledger.ts";
import { queryBasisToolDescription } from "../src/agents/chat-agent/guidance/manual/tools/query-basis.ts";
import {
  assertPetrinautToolCatalogueConformance,
  canonicalPetrinautToolCatalogue,
  brunchToolCatalogue,
} from "../src/agents/chat-agent/tool-catalogue.ts";

const mounted = vi.hoisted(() => ({
  initialData: undefined as unknown,
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
  useInitialData: () => mounted.initialData,
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
vi.mock(
  "../src/agents/chat-agent/guidance/manual/skills/eliciting/SKILL.md",
  () => ({ default: { name: "eliciting" } }),
);
vi.mock(
  "../src/agents/chat-agent/guidance/manual/skills/modelling/SKILL.md",
  () => ({ default: { name: "modelling" } }),
);
vi.mock(
  "../src/agents/chat-agent/guidance/manual/skills/petrinaut/SKILL.md",
  () => ({ default: { name: "petrinaut" } }),
);

const bound = {
  binding: {
    conversationId: "conversation",
    documentId: "document",
  },
};
const systemPrompt = async () =>
  (
    await readFile(
      new URL(
        "../src/agents/chat-agent/guidance/manual/prompts/system.md",
        import.meta.url,
      ),
      "utf8",
    )
  ).trim();
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("BRUNCH_CHAT_MODEL", "claude-sonnet-4-6");
  vi.stubEnv("NODE_ENV", "test");
  mounted.initialData = undefined;
  mounted.contextProjections = 0;
  mounted.descriptions.clear();
  mounted.instructions.length = 0;
  mounted.models.length = 0;
  mounted.skills.length = 0;
  mounted.tools.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

test("a document binding mounts the guidance, the complete canonical catalogue, the Ledger and the draft", async () => {
  mounted.initialData = bound;
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  expect(renderChatAgent({ id: "bound" })).toBe(await systemPrompt());
  expect(mounted.contextProjections).toBe(1);
  expect(mounted.skills).toEqual(["eliciting", "modelling", "petrinaut"]);
  expect(mounted.tools).toEqual(
    expect.arrayContaining([
      brunchTools.ledgerCommit,
      brunchTools.ledgerCompile,
      brunchTools.queryBasis,
      brunchTools.ping,
      "readNetOutline",
      "readNetStructure",
      brunchTools.draftPetrinautExperiment,
      ...Object.keys(petrinautAiTools),
    ]),
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
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  renderChatAgent({ id: "unbound" });
  expect(mounted.skills).toEqual(["eliciting", "modelling", "petrinaut"]);
  expect(mounted.tools.sort()).toEqual(
    [
      brunchTools.ledgerCommit,
      brunchTools.ledgerCompile,
      brunchTools.ping,
    ].sort(),
  );
  expect(mounted.instructions).toEqual([]);
});

test("the agent admits a document binding or no initial data", () => {
  expect(v.parse(sdcpnInitialDataSchema, bound)).toEqual(bound);
  expect(v.parse(sdcpnInitialDataSchema, undefined)).toBeUndefined();
});

test("the Brunch catalogue classifies every canonical tool", () => {
  const canonicalNames = Object.keys(petrinautAiTools);
  expect(canonicalPetrinautToolCatalogue.map(({ name }) => name)).toEqual(
    canonicalNames,
  );
  expect(brunchToolCatalogue.map(({ name }) => name)).toEqual(
    expect.arrayContaining(canonicalNames),
  );
  expect(brunchToolCatalogue.map(({ name }) => name)).toContain(
    brunchTools.draftPetrinautExperiment,
  );
  expect(() =>
    assertPetrinautToolCatalogueConformance([
      ...canonicalNames,
      "newCanonicalStockTool",
    ]),
  ).toThrow(/unclassified/u);
});
