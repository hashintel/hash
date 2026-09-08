import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { afterAll, describe, expect, test } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  normalizePetrinautAiToolInput,
  petrinautAiTools,
  type PetrinautAiToolName,
} from "@hashintel/petrinaut-core/ai";

import { canonicalSchemaCarrier } from "../src/tools/canonical-schema-carrier";
import {
  deriveArcEffects,
  verifyArcTransitionAttempt,
  type ArcMutationRequest,
  type ArcTransitionAttempt,
} from "../src/transition-record";

// Mission envelope, NOT a production admission list. Parameters remain conditional.
const operations = [
  "addArc",
  "removeArc",
  "updateArcWeight",
  "updateArcType",
  "updateArcPlace",
  "addPlace",
  "updatePlace",
  "removePlace",
  "addTransition",
  "updateTransition",
  "removeTransition",
  "addType",
  "updateType",
  "removeType",
  "addTypeElement",
  "updateTypeElement",
  "removeTypeElement",
  "addScenario",
  "updateScenario",
  "removeScenario",
  "addParameter",
  "updateParameter",
  "removeParameter",
  "getLatestNetDefinition",
  "getNetCompilationErrors",
  "applyAutoLayout",
  "setNetTitle",
] as const satisfies readonly PetrinautAiToolName[];
type Operation = (typeof operations)[number];
type Schema = Parameters<typeof canonicalSchemaCarrier>[0];
const artifacts: Record<string, unknown> = {};
const observations: unknown[] = [];

const exported = (schema: v.GenericSchema) => {
  const { $schema: _dialect, ...result } = toJsonSchema(schema, {
    errorMode: "ignore",
  });
  return result;
};

const arc = {
  transitionId: "transition",
  arcDirection: "input",
  placeId: "place",
  weight: 1,
  type: "standard",
};
const place = {
  id: "place",
  name: "Place",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};
const transition = {
  id: "transition",
  name: "Transition",
  inputArcs: [],
  outputArcs: [],
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
};
const element = { elementId: "attribute", name: "attribute", type: "string" };
const tokenType = {
  id: "type",
  name: "Type",
  iconSlug: "circle",
  displayColor: "#808080",
  elements: [element],
};
const parameter = {
  id: "parameter",
  name: "Parameter",
  variableName: "parameter",
  type: "integer",
  defaultValue: "1",
};
const scenario = {
  id: "scenario",
  name: "Scenario",
  scenarioParameters: [],
  initialState: { type: "per_place", content: { place: "1" } },
};
const fixtures = {
  addArc: arc,
  removeArc: {
    transitionId: "transition",
    arcDirection: "input",
    placeId: "place",
  },
  updateArcWeight: {
    transitionId: "transition",
    arcDirection: "input",
    placeId: "place",
    weight: 2,
  },
  updateArcType: { transitionId: "transition", placeId: "place", type: "read" },
  updateArcPlace: {
    transitionId: "transition",
    arcDirection: "input",
    oldPlaceId: "place",
    newPlaceId: "replacement",
  },
  addPlace: place,
  updatePlace: { placeId: "place", update: {} },
  removePlace: { placeId: "place" },
  addTransition: transition,
  updateTransition: { transitionId: "transition", update: {} },
  removeTransition: { transitionId: "transition" },
  addType: tokenType,
  updateType: { typeId: "type", update: {} },
  removeType: { typeId: "type" },
  addTypeElement: { typeId: "type", element },
  updateTypeElement: { typeId: "type", elementId: "attribute", update: {} },
  removeTypeElement: { typeId: "type", elementId: "attribute" },
  addScenario: scenario,
  updateScenario: { scenarioId: "scenario", update: {} },
  removeScenario: { scenarioId: "scenario" },
  addParameter: parameter,
  updateParameter: { parameterId: "parameter", update: {} },
  removeParameter: { parameterId: "parameter" },
  getLatestNetDefinition: {},
  getNetCompilationErrors: {},
  applyAutoLayout: { askUserFirst: true },
  setNetTitle: { title: "Synthetic test" },
} satisfies Record<Operation, Record<string, unknown>>;

const unsupported = new Set<Operation>([
  "addTransition",
  "updateTransition",
  "addScenario",
  "updateScenario",
]);
const emptyRequiredDifference = new Set<Operation>([
  "updatePlace",
  "updateType",
  "updateTypeElement",
  "updateParameter",
  "getLatestNetDefinition",
  "getNetCompilationErrors",
]);

// Diagnostic only: do not promote this representational equivalence into the
// mission's acceptance rule. Only visit schema nodes, never default/const data.
const explicitEmptyRequired = (schema: Schema): Schema => ({
  ...schema,
  ...(schema.type === "object" &&
  schema.properties !== undefined &&
  schema.required === undefined
    ? { required: [] }
    : {}),
  ...(schema.properties
    ? {
        properties: Object.fromEntries(
          Object.entries(schema.properties).map(([name, property]) => [
            name,
            typeof property === "boolean"
              ? property
              : explicitEmptyRequired(property),
          ]),
        ),
      }
    : {}),
});

const vocabulary = (root: Schema) => {
  const found: Record<string, string[]> = {};
  const visit = (schema: Schema, path: string) => {
    for (const keyword of Object.keys(schema))
      (found[keyword] ??= []).push(path);
    for (const keyword of ["properties", "$defs"] as const) {
      for (const [key, child] of Object.entries(schema[keyword] ?? {})) {
        if (typeof child !== "boolean")
          visit(child, `${path}/${keyword}/${key}`);
      }
    }
    for (const keyword of ["anyOf", "oneOf"] as const) {
      schema[keyword]?.forEach((child, index) => {
        if (typeof child !== "boolean")
          visit(child, `${path}/${keyword}/${index}`);
      });
    }
    for (const keyword of [
      "items",
      "additionalProperties",
      "propertyNames",
    ] as const) {
      const child = schema[keyword];
      if (child && typeof child !== "boolean" && !Array.isArray(child))
        visit(child, `${path}/${keyword}`);
    }
  };
  visit(root, "$");
  return found;
};

const observe = (name: Operation, label: string, input: unknown) => {
  const canonical = petrinautAiTools[name].inputSchema;
  const normalized = normalizePetrinautAiToolInput(name, input);
  const parsed = canonical.safeParse(normalized);
  let carried: ReturnType<typeof v.safeParse> | undefined;
  if (!unsupported.has(name))
    carried = v.safeParse(
      canonicalSchemaCarrier(canonical.toJSONSchema()),
      normalized,
    );
  observations.push({
    name,
    label,
    input,
    normalized,
    canonical: parsed.success
      ? { success: true, output: parsed.data }
      : { success: false, issues: parsed.error.issues },
    carrier: carried?.success
      ? { success: true, output: carried.output }
      : carried
        ? {
            success: false,
            issues: carried.issues.map((issue) => ({
              message: issue.message,
              path: issue.path?.map((part) => part.key),
            })),
          }
        : { unsupported: true },
  });
  return { parsed, carried };
};

describe("remaining carrier feasibility (synthetic, unmounted)", () => {
  test.each(operations)(
    "inventories and discriminates %s without changing its mount",
    (name) => {
      const canonical = petrinautAiTools[name].inputSchema.toJSONSchema();
      const { $schema: _dialect, ...contract } = canonical;
      let generated: ReturnType<typeof exported> | undefined;
      let failure: string | undefined;
      try {
        generated = exported(canonicalSchemaCarrier(canonical));
      } catch (error) {
        failure = String(error);
      }
      artifacts[name] = {
        canonical,
        vocabulary: vocabulary(canonical),
        generated,
        failure,
        exact:
          generated !== undefined && isDeepStrictEqual(generated, contract),
        equalAfterExplicitEmptyRequired:
          generated !== undefined &&
          isDeepStrictEqual(generated, explicitEmptyRequired(contract)),
      };
      expect(failure !== undefined).toBe(unsupported.has(name));
      expect(isDeepStrictEqual(generated, contract)).toBe(
        !unsupported.has(name) && !emptyRequiredDifference.has(name),
      );
      expect(generated).toEqual(
        unsupported.has(name)
          ? undefined
          : emptyRequiredDifference.has(name)
            ? explicitEmptyRequired(contract)
            : contract,
      );
      const valid = observe(name, "minimal valid input", fixtures[name]);
      expect(valid.parsed.success).toBe(true);
      expect(valid.carried?.success).toBe(
        unsupported.has(name) ? undefined : true,
      );
      const extra = observe(name, "strict root rejects extra field", {
        ...fixtures[name],
        invented: true,
      });
      expect(extra.parsed.success).toBe(false);
      expect(extra.carried?.success).toBe(
        unsupported.has(name) ? undefined : false,
      );
      for (const required of canonical.required ?? []) {
        // Scenario parameterOverrides is required only in the output JSON Schema.
        if (name === "addScenario" && required === "parameterOverrides")
          continue;
        const input: Record<string, unknown> = { ...fixtures[name] };
        delete input[required];
        const missing = observe(name, `missing ${required}`, input);
        expect(missing.parsed.success).toBe(false);
        expect(missing.carried?.success).toBe(
          unsupported.has(name) ? undefined : false,
        );
      }
    },
  );

  test("does not erase meaningful requiredness in the empty-list diagnostic", () => {
    expect(
      explicitEmptyRequired({ type: "object", properties: {}, required: ["x"] })
        .required,
    ).toEqual(["x"]);
    expect(
      explicitEmptyRequired({
        type: "object",
        properties: { x: { type: "string" } },
      }),
    ).not.toEqual({
      type: "object",
      properties: { x: { type: "string" } },
      required: ["x"],
    });
  });

  test("keeps endpoint alternatives disjoint and leaves non-exported refinements with canonical validation", () => {
    const { placeId: _place, ...withoutPlace } = arc;
    for (const endpoint of [
      { kind: "place", placeId: "place" },
      {
        kind: "componentPort",
        componentInstanceId: "component",
        portPlaceId: "port",
      },
    ]) {
      const result = observe(
        "addArc",
        "valid endpoint alternative (component ports are not admitted)",
        { ...withoutPlace, endpoint },
      );
      expect(result.parsed.success).toBe(true);
      expect(result.carried?.success).toBe(true);
    }
    for (const endpoint of [
      { kind: 1, placeId: "place" },
      { kind: true, placeId: "place" },
      { kind: "place" },
      { kind: "componentPort", placeId: "place" },
      { kind: "place", placeId: "place", portPlaceId: "port" },
    ]) {
      const result = observe("addArc", "invalid endpoint", {
        ...withoutPlace,
        endpoint,
      });
      expect(result.parsed.success).toBe(false);
      expect(result.carried?.success).toBe(false);
    }
    for (const input of [
      withoutPlace,
      { ...arc, endpoint: { kind: "place", placeId: "place" } },
      { ...arc, arcDirection: "output" },
    ]) {
      const result = observe(
        "addArc",
        "canonical-only endpoint/direction refinement",
        input,
      );
      expect(result.carried?.success).toBe(true);
      expect(result.parsed.success).toBe(false);
    }
    const { type: _type, ...output } = { ...arc, arcDirection: "output" };
    expect(observe("addArc", "valid output arc", output).parsed.success).toBe(
      true,
    );
    for (const type of ["standard", "read", "inhibitor"])
      expect(
        observe("addArc", "valid input arc type", { ...arc, type }).parsed
          .success,
      ).toBe(true);
  });

  test("normalizes numeric strings before candidate validation, never by widening the exported number", () => {
    const carrier = canonicalSchemaCarrier(
      petrinautAiTools.addArc.inputSchema.toJSONSchema(),
    );
    for (const weight of [
      "1",
      " 1.5 ",
      "1e2",
      "0x10",
      "0",
      "",
      " ",
      "-1",
      "Infinity",
      "NaN",
      "1x",
    ]) {
      const input = { ...arc, weight };
      expect(v.safeParse(carrier, input).success).toBe(false);
      expect(petrinautAiTools.addArc.inputSchema.safeParse(input).success).toBe(
        false,
      );
      const expected = Number.isFinite(Number(weight)) && Number(weight) > 0;
      const result = observe("addArc", "numeric string", input);
      expect(result.parsed.success).toBe(expected);
      expect(result.carried?.success).toBe(expected);
      expect(result.parsed.success ? result.parsed.data : undefined).toEqual(
        expected ? { ...arc, weight: Number(weight) } : undefined,
      );
    }
    // Normalization is deliberately addArc-only in the canonical API.
    expect(
      observe("updateArcWeight", "numeric string not normalized", {
        ...fixtures.updateArcWeight,
        weight: "2",
      }).parsed.success,
    ).toBe(false);
  });

  test("native pre-normalization composition exports the canonical arc schema and feeds A3 a normalized root request", async () => {
    const canonical = petrinautAiTools.addArc.inputSchema;
    // Candidate composition only: production canonicalInputFor is unchanged.
    const candidate = v.pipe(
      v.looseObject({}),
      v.transform((input) => normalizePetrinautAiToolInput("addArc", input)),
      canonicalSchemaCarrier(canonical.toJSONSchema()),
      v.rawTransform((context) => {
        const parsed = canonical.safeParse(context.dataset.value);
        if (parsed.success) return parsed.data;
        for (const issue of parsed.error.issues)
          context.addIssue({ message: issue.message });
        return context.NEVER;
      }),
    );
    const { $schema: _dialect, ...contract } = canonical.toJSONSchema();
    expect(exported(candidate)).toEqual(contract);
    expect(v.parse(candidate, { ...arc, weight: "1" })).toEqual(arc);
    expect(
      v.safeParse(candidate, { ...arc, arcDirection: "output" }).success,
    ).toBe(false);
    expect(v.safeParse(candidate, { ...arc, weight: "0" }).success).toBe(false);
    expect(v.safeParse(candidate, { ...arc, extra: true }).success).toBe(false);
    const pre: SDCPN = {
      places: [petrinautAiTools.addPlace.inputSchema.parse(place)],
      transitions: [
        petrinautAiTools.addTransition.inputSchema.parse(transition),
      ],
      types: [],
      parameters: [],
      differentialEquations: [],
    };
    const observation = (definition: SDCPN) => ({
      definition: structuredClone(definition),
      sha256: createHash("sha256")
        .update(JSON.stringify(definition))
        .digest("hex"),
    });
    await Promise.all(
      [
        arc,
        { ...arc, type: "read" },
        { ...arc, type: "inhibitor" },
        {
          transitionId: "transition",
          arcDirection: "output",
          placeId: "place",
          weight: 1,
          targetSubnetId: null,
        },
      ].map(async (input) => {
        const instance = createPetrinaut({
          document: createJsonDocHandle({ initial: structuredClone(pre) }),
        });
        try {
          const request: ArcMutationRequest = {
            toolCallId: `a1-synthetic-${input.arcDirection}-${"type" in input ? input.type : "output"}`,
            toolName: "addArc",
            input: v.parse(candidate, { ...input, weight: "1" }),
            binding: {
              conversationId: "a1-synthetic",
              documentId: "a1-synthetic",
              incarnationId: "a1-synthetic",
            },
            requestedBaseHash: observation(pre).sha256,
          };
          instance.mutations.addArc(request.input);
          const post = observation(instance.definition.get());
          const attempt: ArcTransitionAttempt = {
            request,
            binding: request.binding,
            pre: observation(pre),
            post,
            outcome: "applied",
            effects: deriveArcEffects(request, pre, post.definition),
          };
          await expect(
            verifyArcTransitionAttempt(attempt),
          ).resolves.toBeDefined();
          expect(attempt.effects.created).toHaveLength(1);
          expect(attempt.effects.derived).toEqual([]);
          observations.push({
            name: "addArc",
            label:
              "synthetic canonical handle and A3 compatibility, NOT browser",
            attempt,
          });
        } finally {
          instance.dispose();
        }
      }),
    );
    artifacts.normalizationComposition = {
      generated: exported(candidate),
      canonical: contract,
      scope:
        "Native Valibot composition only; not installed on built ChatAgent",
    };
  });

  test("records non-exported name and parameter refinements without copying them", () => {
    for (const [name, input] of [
      ["addPlace", { ...place, name: "not a PascalCase name" }],
      [
        "addTypeElement",
        { typeId: "type", element: { ...element, name: "constructor" } },
      ],
      ["addParameter", { ...parameter, defaultValue: "1.5" }],
      ["addParameter", { ...parameter, variableName: "NotSnakeCase" }],
      ["addParameter", { ...parameter, type: "boolean", defaultValue: "1" }],
    ] as const) {
      const result = observe(name, "canonical-only refinement", input);
      expect(result.carried?.success).toBe(true);
      expect(result.parsed.success).toBe(false);
    }
    for (const [name, input] of [
      ["addPlace", { ...place, name: " Place " }],
      ["addType", { ...tokenType, name: " Type " }],
      ["addParameter", { ...parameter, variableName: " parameter " }],
    ] as const) {
      const result = observe(
        name,
        "canonical trim not expressed by JSON Schema",
        input,
      );
      expect(result.parsed.success).toBe(true);
      expect(result.carried?.success).toBe(true);
      if (!result.parsed.success || !result.carried?.success)
        throw new Error("Expected both parsers to succeed");
      expect(result.parsed.data).not.toEqual(result.carried.output);
    }
    for (const [type, defaultValue] of [
      ["real", "1.5"],
      ["integer", "2"],
      ["boolean", "false"],
    ]) {
      expect(
        observe("addParameter", "valid typed string default", {
          ...parameter,
          type,
          defaultValue,
        }).parsed.success,
      ).toBe(true);
    }
  });

  test("bounds recursive metadata at native lazy reference naming, without truncation", () => {
    const canonical = petrinautAiTools.addTransition.inputSchema.toJSONSchema();
    // Small native-library reproducer of z.json(), NOT a replacement tool schema.
    const reference: v.GenericSchema = v.lazy(() => json);
    const json: v.GenericSchema = v.union([
      v.string(),
      v.pipe(v.number(), v.finite()),
      v.boolean(),
      v.null(),
      v.array(reference),
      v.record(v.string(), reference),
    ]);
    const canonicalMetadata = canonical.properties?.metadata;
    if (!canonicalMetadata || typeof canonicalMetadata === "boolean")
      throw new Error("Expected metadata schema");
    const metadata = v.pipe(
      v.record(v.string(), reference),
      v.description(canonicalMetadata.description!),
    );
    const generated = exported(
      v.strictObject({ metadata: v.optional(metadata) }),
    );
    // The exporter CAN preserve names with per-conversion definitions. Flue's
    // converter does not expose this config; process-global registration would
    // contaminate other tools and still not survive the Anthropic root filter.
    const definitionName = Object.keys(canonical.$defs ?? {})[0]!;
    const {
      $schema: _dialect,
      $defs,
      ...namedMetadata
    } = toJsonSchema(metadata, {
      errorMode: "ignore",
      definitions: { [definitionName]: json },
    });
    expect(namedMetadata).toEqual(canonicalMetadata);
    expect($defs).toEqual(canonical.$defs);
    artifacts.recursiveReproducer = {
      canonicalMetadata: canonical.properties?.metadata,
      canonicalDefinitions: canonical.$defs,
      generated,
      withPerConversionDefinitions: { metadata: namedMetadata, $defs },
    };
    expect(generated.$defs).toBeDefined();
    expect(Object.keys(generated.$defs ?? {})).not.toContain("__schema0");
    expect(() => canonicalSchemaCarrier(canonical)).toThrow(
      /closed canonical objects/u,
    );
    for (const value of [
      { nested: [null, true, 1, "text", { deep: { deeper: [false] } }] },
      { nested: { bad: undefined } },
      { nested: { bad: Infinity } },
    ]) {
      const result = observe("addTransition", "recursive metadata", {
        ...transition,
        metadata: value,
      });
      expect(v.safeParse(metadata, value).success).toBe(result.parsed.success);
    }
  });

  test("exposes scenario default input/output divergence before implementing records or patterns", () => {
    const canonical = petrinautAiTools.addScenario.inputSchema;
    const outputSchema = canonical.toJSONSchema();
    const inputSchema = canonical.toJSONSchema({ io: "input" });
    artifacts.scenarioDefaults = { outputSchema, inputSchema };
    expect(outputSchema.required).toContain("parameterOverrides");
    expect(inputSchema.required).not.toContain("parameterOverrides");
    expect(canonical.parse(scenario)).toEqual({
      ...scenario,
      parameterOverrides: {},
    });
    const emptyUpdate = observe(
      "updateScenario",
      "empty update supplies canonical default",
      fixtures.updateScenario,
    );
    expect(emptyUpdate.parsed).toMatchObject({
      success: true,
      data: { scenarioId: "scenario", update: { parameterOverrides: {} } },
    });
    for (const initialState of [
      { type: "per_place", content: { place: [[1, true, "family"]] } },
      { type: "code", content: "return { Place: 1 };" },
    ]) {
      expect(
        observe("addScenario", "initial state alternative", {
          ...scenario,
          initialState,
        }).parsed.success,
      ).toBe(true);
    }
    for (const input of [
      {
        ...scenario,
        initialState: { type: "per_place", content: { place: 1 } },
      },
      { ...scenario, parameterOverrides: null },
      {
        ...scenario,
        scenarioParameters: [
          { type: "real", identifier: "bad-name", default: 1 },
        ],
      },
    ]) {
      expect(
        observe("addScenario", "invalid scenario", input).parsed.success,
      ).toBe(false);
    }
    const duplicate = { type: "real", identifier: "same", default: 1 };
    expect(
      observe("addScenario", "duplicate parameter refinement", {
        ...scenario,
        scenarioParameters: [duplicate, duplicate],
      }).parsed.success,
    ).toBe(false);
  });
});

afterAll(() => {
  const directory = process.env.A1_CARRIER_EVIDENCE_DIRECTORY;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "schema-survey.json"),
    `${JSON.stringify(artifacts, null, 2)}\n`,
  );
  // Non-JSON negative fixtures must not silently turn Infinity into null or lose
  // undefined fields. These tagged values describe test inputs, not wire values.
  writeFileSync(
    join(directory, "canonical-fixtures.json"),
    `${JSON.stringify(observations, (_key, value: unknown) => (value === undefined ? { $nonJson: "undefined" } : typeof value === "number" && !Number.isFinite(value) ? { $nonJson: String(value) } : value), 2)}\n`,
  );
});
