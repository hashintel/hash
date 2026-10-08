import { readdir, readFile } from "node:fs/promises";
import { basename } from "node:path";

import * as v from "valibot";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";
import { sdcpnInitialDataSchema } from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  petrinautAiCapabilityGuidance,
  petrinautAiTools,
} from "@hashintel/petrinaut-core/ai";

import { selfContainedGuidanceVariants } from "../src/agents/chat-agent/guidance-variant.ts";
import {
  commitToolDescription as ledger2CommitDescription,
  compileToolDescription as ledger2CompileDescription,
} from "../src/agents/chat-agent/guidance/manual/tools/ledger.ts";
import { queryBasisToolDescription as manualQueryBasisDescription } from "../src/agents/chat-agent/guidance/manual/tools/query-basis.ts";
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
vi.mock("@hashintel/brunch-agent/skills/elicitation/SKILL.md", () => ({
  default: { name: "elicitation" },
}));
vi.mock(
  "@hashintel/brunch-agent-plugin-sdcpn/skills/sdcpn-modelling/SKILL.md",
  () => ({ default: { name: "sdcpn-modelling" } }),
);
vi.mock("../src/agents/chat-agent/guidance/skills/eliciting/SKILL.md", () => ({
  default: { name: "eliciting" },
}));
vi.mock(
  "../src/agents/chat-agent/guidance/skills/constructing/SKILL.md",
  () => ({
    default: { name: "constructing" },
  }),
);
vi.mock(
  "../src/agents/chat-agent/guidance/manual/skills/eliciting/SKILL.md",
  () => ({ default: { name: "manual eliciting" } }),
);
vi.mock(
  "../src/agents/chat-agent/guidance/manual/skills/constructing/SKILL.md",
  () => ({ default: { name: "manual constructing" } }),
);
vi.mock(
  "../src/agents/chat-agent/guidance/receipt/skills/eliciting/SKILL.md",
  () => ({ default: { name: "receipt eliciting" } }),
);
vi.mock(
  "../src/agents/chat-agent/guidance/receipt/skills/constructing/SKILL.md",
  () => ({ default: { name: "receipt constructing" } }),
);
const bound = {
  binding: {
    conversationId: "conversation",
    documentId: "document",
  },
};
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("BRUNCH_CHAT_MODEL", "claude-sonnet-4-6");
  vi.stubEnv("BRUNCH_GUIDANCE_VARIANT", "baseline");
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

test("a document binding mounts the complete canonical catalogue plus the Brunch Ledger and draft", async () => {
  mounted.initialData = bound;
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  expect(renderChatAgent({ id: "bound" })).toContain("Ledger");
  expect(mounted.contextProjections).toBe(1);
  expect(mounted.tools).toEqual(
    expect.arrayContaining([
      brunchTools.ledgerCommit,
      brunchTools.ledgerCompile,
      brunchTools.queryBasis,
      "readNetOutline",
      "readNetStructure",
      brunchTools.draftPetrinautExperiment,
      ...Object.keys(petrinautAiTools),
    ]),
  );
  expect(mounted.skills).toEqual(
    expect.arrayContaining(["elicitation", "sdcpn-modelling"]),
  );
  expect(mounted.instructions).toContain(petrinautAiCapabilityGuidance);
});

test("a conversation without initial data mounts the SDCPN skill without browser tools", async () => {
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  renderChatAgent({ id: "unbound" });
  expect(mounted.skills).toContain("sdcpn-modelling");
  expect(mounted.tools).not.toContain(brunchTools.draftPetrinautExperiment);
  expect(mounted.tools).not.toContain("readPetrinautDoc");
  expect(mounted.instructions).toEqual(
    expect.arrayContaining([
      expect.stringContaining("This conversation has no browser tools"),
    ]),
  );
});

test("the agent admits a document binding or no initial data", () => {
  expect(v.parse(sdcpnInitialDataSchema, bound)).toEqual(bound);
  expect(v.parse(sdcpnInitialDataSchema, undefined)).toBeUndefined();
});

test.each(["replacement", "feedback", "identity"])(
  "%s mounts only app-owned skills and the same tools",
  async (variant) => {
    mounted.initialData = bound;
    const { ChatAgent: baseline } =
      await import("../src/agents/chat-agent/agent.ts");
    baseline({ id: "baseline" });
    const tools = [...mounted.tools];
    mounted.tools.length = 0;
    mounted.skills.length = 0;
    mounted.instructions.length = 0;
    vi.stubEnv("BRUNCH_GUIDANCE_VARIANT", variant);
    vi.resetModules();
    const { ChatAgent: candidate } =
      await import("../src/agents/chat-agent/agent.ts");
    expect(candidate({ id: "candidate" })).toContain("Establish early");
    expect(mounted.skills).toEqual(["eliciting", "constructing"]);
    expect(mounted.tools.sort()).toEqual(tools.sort());
    expect(
      mounted.instructions.some((text) =>
        text.includes("# Account–draft feedback"),
      ),
    ).toBe(variant !== "replacement");
    expect(
      mounted.instructions.some((text) =>
        text.includes("# Low-resolution modelling"),
      ),
    ).toBe(variant === "identity");
  },
);

test.each(selfContainedGuidanceVariants)(
  "%s mounts only its own guidance copies and the same tools",
  async (arm) => {
    mounted.initialData = bound;
    const { ChatAgent: baseline } =
      await import("../src/agents/chat-agent/agent.ts");
    baseline({ id: "baseline" });
    const tools = [...mounted.tools];
    mounted.tools.length = 0;
    mounted.skills.length = 0;
    mounted.instructions.length = 0;
    vi.stubEnv("BRUNCH_GUIDANCE_VARIANT", arm);
    vi.resetModules();
    const sources = new URL(
      `../src/agents/chat-agent/guidance/${arm}/`,
      import.meta.url,
    );
    const files = (await readdir(sources, { recursive: true })).filter((path) =>
      path.endsWith(".md"),
    );
    const pathOf = (name: string) =>
      files.find((path) => basename(path) === name) ?? name;
    // The manual arm's tools carry their descriptions inline, and it mounts
    // only the Petrinaut capability instruction beside its system prompt.
    const manual = arm === "manual";
    const toolDescriptions = manual
      ? []
      : ["query-basis-tool.md", "ledger-commit.md", "ledger-compile.md"];
    for (const name of toolDescriptions)
      vi.doMock(
        `../src/agents/chat-agent/guidance/${arm}/${pathOf(name)}?raw`,
        () => ({ default: `${arm} ${name}` }),
      );
    const textsByPath = new Map(
      await Promise.all(
        files.map(
          async (path) =>
            [
              path,
              String(await readFile(new URL(path, sources))).trim(),
            ] as const,
        ),
      ),
    );
    const texts = {
      get: (name: string) => textsByPath.get(pathOf(name)),
      values: () => textsByPath.values(),
    };
    const { ChatAgent: candidate } =
      await import("../src/agents/chat-agent/agent.ts");
    expect(candidate({ id: arm })).toBe(texts.get("system.md"));
    expect(mounted.skills).toEqual([`${arm} eliciting`, `${arm} constructing`]);
    expect(mounted.tools.sort()).toEqual(tools.sort());
    const own = new Set(texts.values());
    expect(mounted.instructions.filter((text) => !own.has(text))).toEqual([]);
    expect(mounted.instructions).toEqual(
      expect.arrayContaining(
        (manual
          ? ["petrinaut-capability.md"]
          : [
              "feedback.md",
              "identity-ledger.md",
              "petrinaut-capability.md",
              "experiment-drafting.md",
              "runtime-bound.md",
              "query-basis.md",
            ]
        ).map((name) => texts.get(name)),
      ),
    );
    expect(mounted.descriptions.get(brunchTools.queryBasis)).toBe(
      manual ? manualQueryBasisDescription : `${arm} query-basis-tool.md`,
    );
    expect(mounted.descriptions.get(brunchTools.ledgerCompile)).toBe(
      manual ? ledger2CompileDescription : `${arm} ledger-compile.md`,
    );
    // The receipt arm appends its vocabulary after the mounted description.
    const [commitHead, ...commitRest] = (
      mounted.descriptions.get(brunchTools.ledgerCommit) ?? ""
    ).split("\n");
    expect(commitHead).toBe(
      manual ? ledger2CommitDescription : `${arm} ledger-commit.md`,
    );
    expect(commitRest.length > 0).toBe(!manual);

    mounted.initialData = undefined;
    mounted.instructions.length = 0;
    candidate({ id: `${arm}-unbound` });
    expect(mounted.instructions.filter((text) => !own.has(text))).toEqual([]);
    expect(mounted.instructions.length === 0).toBe(manual);
    expect(
      mounted.instructions.includes(texts.get("runtime-unbound.md") ?? ""),
    ).toBe(!manual);
  },
);

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
