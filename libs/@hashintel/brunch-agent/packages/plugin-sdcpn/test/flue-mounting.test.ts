import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, test, vi } from "vitest";

const mounting = vi.hoisted(() => ({
  initialData: undefined as unknown,
  instructions: [] as string[],
  skills: [] as unknown[],
  tools: [] as unknown[],
}));

vi.mock("@flue/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/runtime")>()),
  useInitialData: () => mounting.initialData,
  useInstruction: (instruction: string) =>
    mounting.instructions.push(instruction),
  useSkill: (skill: unknown) => mounting.skills.push(skill),
  useTool: (tool: unknown) => mounting.tools.push(tool),
}));

import {
  CANONICAL_PETRINAUT_TOOLS_MODE,
  batchedConstructionMode,
  canonicalPetrinautTools,
  readPetrinautDocs,
  useSdcpnPlugin,
} from "../src/flue";
import { sdcpnModellingSkill } from "../src/skills/sdcpn-modelling/skill";

const legacyAppend = readFileSync(
  new URL("../src/prompts/APPEND_SYSTEM.md", import.meta.url),
  "utf8",
).trim();
const surpriseMeRequest =
  "Pick an interesting domain and build a small but complete SDCPN end-to-end — use all available features (including place visualizers).";

beforeEach(() => {
  mounting.initialData = undefined;
  mounting.instructions.length = 0;
  mounting.skills.length = 0;
  mounting.tools.length = 0;
});

describe("SDCPN prompt and tool mounting", () => {
  test("canonical parity mode scopes Surprise me authorization without duplicating the agent prompt", () => {
    mounting.initialData = { mode: CANONICAL_PETRINAUT_TOOLS_MODE };

    useSdcpnPlugin();

    expect(mounting.instructions).toHaveLength(1);
    expect(mounting.instructions).not.toContain(legacyAppend);
    expect(mounting.skills).not.toContain(sdcpnModellingSkill);
    expect(mounting.tools).toEqual(canonicalPetrinautTools);

    const authorization = mounting.instructions[0];
    expect(authorization).toContain("`Surprise me`");
    expect(authorization).toContain(`\`${surpriseMeRequest}\``);
    expect(authorization).toMatch(/equivalent request/u);
    expect(authorization).toMatch(/choose a novel domain/u);
    expect(authorization).toMatch(
      /assistant-selected assumptions and defaults/u,
    );
    expect(authorization).toMatch(/build the preview immediately/u);
    expect(authorization).toMatch(
      /Do not interview, wait for answers, or seek assent/u,
    );
    expect(authorization).toMatch(
      /visualizers, scenarios and metrics, hierarchy/u,
    );
    expect(authorization).toMatch(
      /supported by the document's active extensions/u,
    );
    expect(authorization).toMatch(
      /Never claim that an unsupported or disabled capability was used/u,
    );
  });

  test("the older batched mode retains its plugin append, skill, and construction choreography", () => {
    mounting.initialData = {
      mode: batchedConstructionMode,
      construction: {
        binding: {
          conversationId: "conversation",
          documentId: "document",
          incarnationId: "incarnation",
        },
      },
    };

    useSdcpnPlugin({
      currentRevision: null,
      retainedRevisionFor: async () => undefined,
      observationFor: async () => undefined as never,
    });

    expect(mounting.instructions[0]).toBe(legacyAppend);
    expect(mounting.skills).toContain(sdcpnModellingSkill);
    expect(mounting.tools).toContain(readPetrinautDocs);
    const legacyInstructions = mounting.instructions.join("\n");
    expect(legacyInstructions).toContain(
      "Construction uses strictly separate proposals.",
    );
    expect(legacyInstructions).not.toContain(surpriseMeRequest);
  });
});
