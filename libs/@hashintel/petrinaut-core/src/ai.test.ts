// @ts-expect-error -- this browser-safe package excludes Node ambient types.
import { createHash as nodeCreateHash } from "node:crypto";

import { rolldown } from "rolldown";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  aiCommandActionInputSchemas,
  createPetrinautAiWritableCallbacks,
  getLatestNetDefinitionToolName,
  normalizePetrinautAiToolInput,
  petrinautAiCapabilityGuidance,
  petrinautAiPrompt,
  petrinautAiStockBehavioralFrame,
  petrinautAiToolInputSchemas,
  petrinautAiTools,
  petrinautDocNames,
  petrinautDocSummaries,
} from "./ai";
import { createJsonDocHandle } from "./handle";
import { createPetrinaut } from "./instance";

const createHash = nodeCreateHash as unknown as (algorithm: "sha256") => {
  update: (value: string) => { digest: (encoding: "hex") => string };
};

const createInstance = () =>
  createPetrinaut({
    document: createJsonDocHandle({
      initial: {
        places: [],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
      },
    }),
  });

describe("Petrinaut AI core exports", () => {
  test("keeps execution runtimes out of the AI entry before tree shaking", async () => {
    const build = await rolldown({
      input: "src/ai.ts",
      external: /^[^./]/u,
      treeshake: false,
      logLevel: "silent",
    });
    try {
      const { output } = await build.generate({ format: "esm" });
      const modules = output.flatMap((chunk) =>
        chunk.type === "chunk" ? Object.keys(chunk.modules) : [],
      );
      expect(modules.length).toBeGreaterThan(0);
      expect(
        modules.filter((moduleId) =>
          /\/(?:hir|simulation\/monte-carlo\/runtime)\//u.test(moduleId),
        ),
      ).toEqual([]);
    } finally {
      await build.close();
    }
  });

  test("preserves the exact Stock-control prompt contract", () => {
    expect(createHash("sha256").update(petrinautAiPrompt).digest("hex")).toBe(
      "a8b863c020b628a01bfe944ec0daaf51ae7e08adb2020c00048c6cd5012451fb",
    );
  });

  test("keeps Stock behavior around the canonical capability content", () => {
    expect(petrinautAiStockBehavioralFrame.interviewAndEscape).toMatch(
      /Interview first, build second/u,
    );
    expect(petrinautAiStockBehavioralFrame.interviewAndEscape).toMatch(
      /make it up.*use sensible defaults/su,
    );
    expect(petrinautAiStockBehavioralFrame.finalResponse).toMatch(
      /important modelling choices/u,
    );
    expect(petrinautAiCapabilityGuidance).toMatch(
      /compact example Petrinaut document/u,
    );
  });

  test("capability guidance and catalogue cover the canonical capability classes", () => {
    const capabilityReference = [
      petrinautAiCapabilityGuidance,
      ...Object.entries(petrinautAiTools).map(
        ([name, tool]) => `${name}: ${tool.description}`,
      ),
    ].join("\n");
    const capabilityClasses = [
      {
        name: "document reads and extension gating",
        pattern: /getLatestNetDefinition.*extensions.*extension is disabled/su,
      },
      { name: "title", pattern: /setNetTitle.*human-readable title/su },
      {
        name: "documentation",
        pattern: /readPetrinautDoc.*Petrinaut user guide/su,
      },
      {
        name: "code surfaces",
        pattern:
          /Transition lambda.*Transition kernel.*Differential equation.*Place visualizer/su,
      },
      {
        name: "scenarios",
        pattern: /Scenario per_place initial state/u,
      },
      { name: "metrics", pattern: /Metric \(`metric\.code`\)/u },
      {
        name: "hierarchy",
        pattern: /addSubnet.*subnet.*addComponentInstance/su,
      },
      { name: "layout", pattern: /Auto-layout policy.*applyAutoLayout/su },
      {
        name: "diagnostics",
        pattern:
          /getNetCompilationErrors.*Validate every code-writing change/su,
      },
      { name: "experiments", pattern: /createExperiment.*experiment/su },
    ] as const;

    for (const capabilityClass of capabilityClasses) {
      expect(capabilityReference, capabilityClass.name).toMatch(
        capabilityClass.pattern,
      );
    }
  });

  test("capability guidance includes the canonical Petrinaut document index", () => {
    for (const docName of petrinautDocNames) {
      expect(petrinautAiCapabilityGuidance).toContain(
        `- \`${docName}\` — ${petrinautDocSummaries[docName]}`,
      );
    }
  });

  test("tool metadata stays aligned with input schemas and has no execute", () => {
    expect(Object.keys(petrinautAiTools).sort()).toEqual(
      Object.keys(petrinautAiToolInputSchemas).sort(),
    );

    for (const tool of Object.values(petrinautAiTools)) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.description).toBe(tool.inputSchema.description);
      expect("execute" in tool).toBe(false);
    }
  });

  test("AI command schemas are exposed as tools", () => {
    for (const name of Object.keys(aiCommandActionInputSchemas)) {
      expect(petrinautAiTools).toHaveProperty(name);
    }
    expect(petrinautAiTools).toHaveProperty("applyAutoLayout");
  });

  test("normalizes an addArc weight serialized as text", () => {
    expect(
      normalizePetrinautAiToolInput("addArc", {
        transitionId: "transition",
        arcDirection: "input",
        weight: "1",
        type: "standard",
      }),
    ).toMatchObject({ weight: 1 });
  });

  test("latest net definition tool documents extension settings", () => {
    expect(
      petrinautAiTools[getLatestNetDefinitionToolName].description,
    ).toMatch(/extensions/u);
    expect(petrinautAiPrompt).toMatch(/extensions/u);
  });

  test("addArc exposes an AI-friendly object input schema", () => {
    const schema = z.toJSONSchema(petrinautAiTools.addArc.inputSchema) as {
      properties?: Record<string, unknown>;
      type?: unknown;
    } & Record<string, unknown>;

    expect(schema.type).toBe("object");
    expect(schema).not.toHaveProperty("oneOf");
    expect(schema).not.toHaveProperty("anyOf");
    expect(schema.properties).toMatchObject({
      arcDirection: { enum: ["input", "output"] },
      type: { enum: ["standard", "inhibitor", "read"] },
    });
  });

  test("callback map applies tool inputs to a Petrinaut instance", () => {
    const instance = createInstance();
    const callbacks = createPetrinautAiWritableCallbacks(instance);

    callbacks.addPlace({
      id: "place-1",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    });
    callbacks.updatePlace({
      placeId: "place-1",
      update: { name: "UpdatedQueue" },
    });

    expect(instance.definition.get().places[0]!.name).toBe("UpdatedQueue");
  });

  test("callback map validates tool inputs before applying them", () => {
    const instance = createInstance();
    const callbacks = createPetrinautAiWritableCallbacks(instance);

    expect(() =>
      callbacks.addPlace({
        id: "",
        name: "Queue",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
      }),
    ).toThrow();

    expect(instance.definition.get().places).toEqual([]);
  });

  test("AI writable callbacks include applyAutoLayout from commands", async () => {
    const instance = createInstance();
    const callbacks = createPetrinautAiWritableCallbacks(instance);

    expect(typeof callbacks.applyAutoLayout).toBe("function");
    const result = await callbacks.applyAutoLayout();
    expect(result.commitCount).toBe(0);
  });
});
