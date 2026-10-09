import { rolldown } from "rolldown";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  aiCommandActionInputSchemas,
  createExperimentToolName,
  getLatestNetDefinitionToolName,
  normalizePetrinautAiToolInput,
  petrinautAiCapabilityGuidance,
  petrinautAiToolInputSchemas,
  petrinautAiTools,
  petrinautDocNames,
  petrinautDocSummaries,
} from "./ai";
import { generateArcId } from "./arc-id";
import { createJsonDocHandle } from "./handle";
import { createPetrinaut } from "./instance";
import { toPetrinautId } from "./petrinaut-id";

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

  test("id inputs export as plain string schemas", () => {
    type JsonSchemaNode = {
      type?: unknown;
      const?: unknown;
      properties?: Record<string, JsonSchemaNode>;
      items?: JsonSchemaNode;
      oneOf?: JsonSchemaNode[];
      propertyNames?: JsonSchemaNode;
    };
    const propertiesOf = (schema: z.ZodType) =>
      (z.toJSONSchema(schema, { io: "output" }) as JsonSchemaNode).properties ??
      {};

    expect(
      propertiesOf(petrinautAiTools.removeSubnet.inputSchema).subnetId,
    ).toMatchObject({ type: "string" });
    expect(
      propertiesOf(petrinautAiTools.addPlace.inputSchema).id,
    ).toMatchObject({ type: "string" });
    expect(
      propertiesOf(petrinautAiTools.addScenario.inputSchema).parameterOverrides,
    ).toMatchObject({ type: "object", propertyNames: { type: "string" } });
    const deleteItems = propertiesOf(
      petrinautAiTools.deleteItemsByIds.inputSchema,
    ).items?.items?.oneOf;
    expect(
      deleteItems?.find((item) => item.properties?.type?.const === "arc")
        ?.properties?.id,
    ).toMatchObject({ type: "string" });
    expect(
      propertiesOf(petrinautAiTools[createExperimentToolName].inputSchema)
        .scenarioId,
    ).toMatchObject({ type: "string" });
  });

  test("converts invented entity ids so references and arc ids resolve", () => {
    const instance = createInstance();

    instance.mutations.addPlace({
      id: "place__queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    });
    instance.mutations.addTransition({
      id: "transition__serve",
      name: "Serve",
      inputArcs: [],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    });
    instance.mutations.addArc({
      transitionId: "transition__serve",
      arcDirection: "input",
      placeId: "place__queue",
      weight: 1,
    });

    const [transition] = instance.definition.get().transitions;
    expect(transition?.id).toBe(toPetrinautId("transition__serve"));
    expect(transition?.inputArcs[0]?.placeId).toBe(
      toPetrinautId("place__queue"),
    );

    instance.mutations.deleteItemsByIds({
      items: [
        {
          type: "arc",
          id: generateArcId({
            inputId: "place:place__queue",
            outputId: "transition__serve",
          }),
        },
      ],
    });

    expect(instance.definition.get().transitions[0]?.inputArcs).toEqual([]);
  });
});
