import { describe, expect, test } from "vitest";

import { createStepShapeResolver } from "./step-shapes.js";
import { allPayloadKinds } from "./types.js";
import { validateFlowDefinition } from "./validate-flow-definition.js";

import type { ActionDefinitions } from "./step-shapes.js";
import type {
  ActionDefinition,
  FlowActionDefinitionId,
  FlowDefinition,
  StepDefinition,
  StepInputSource,
} from "./types.js";
import type { FlowDefinitionDiagnostic } from "./validate-flow-definition.js";

type TestActionDefinition = Pick<
  ActionDefinition<FlowActionDefinitionId>,
  "inputs" | "outputs"
> & { actionDefinitionId: string };

const testActionDefinitionList: TestActionDefinition[] = [
  {
    actionDefinitionId: "research",
    inputs: [],
    outputs: [
      {
        name: "entities",
        payloadKind: "PersistedEntityMetadata",
        array: true,
        required: true,
      },
    ],
  },
  {
    actionDefinitionId: "filter",
    inputs: [
      {
        name: "items",
        oneOfPayloadKinds: allPayloadKinds,
        array: true,
        required: true,
      },
    ],
    outputs: [
      { name: "matches", kindFrom: "items", array: true, required: true },
    ],
  },
  {
    actionDefinitionId: "findOne",
    inputs: [
      {
        name: "items",
        oneOfPayloadKinds: allPayloadKinds,
        array: true,
        required: true,
      },
      {
        name: "fallback",
        kindFrom: "items",
        array: false,
        required: false,
      },
    ],
    outputs: [
      { name: "match", kindFrom: "items", array: false, required: false },
    ],
  },
  {
    actionDefinitionId: "pick",
    inputs: [
      {
        name: "items",
        oneOfPayloadKinds: allPayloadKinds,
        array: true,
        required: true,
      },
    ],
    outputs: [
      { name: "first", kindFrom: "items", array: false, required: true },
    ],
  },
  {
    actionDefinitionId: "pickIfGiven",
    inputs: [
      {
        name: "items",
        oneOfPayloadKinds: allPayloadKinds,
        array: true,
        required: false,
      },
    ],
    outputs: [
      { name: "first", kindFrom: "items", array: false, required: false },
    ],
  },
  {
    actionDefinitionId: "summarize",
    inputs: [
      {
        name: "entities",
        oneOfPayloadKinds: ["PersistedEntityMetadata"],
        array: true,
        required: true,
      },
    ],
    outputs: [],
  },
  {
    actionDefinitionId: "echo",
    inputs: [
      {
        name: "text",
        oneOfPayloadKinds: ["Text"],
        array: false,
        required: true,
      },
    ],
    outputs: [],
  },
];

const toActionDefinition = (
  definition: TestActionDefinition,
): ActionDefinition<FlowActionDefinitionId> => ({
  ...definition,
  // SAFETY: the tests use action ids of their own, which the resolver and validator treat as opaque strings.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test actions' ids are not members of `FlowActionDefinitionId`
  actionDefinitionId: definition.actionDefinitionId as FlowActionDefinitionId,
  kind: "action",
  name: definition.actionDefinitionId,
  description: "",
});

/**
 * The actions these tests' flows use, given to the resolver and validator in place of the codebase's.
 */
const testActionDefinitions = Object.fromEntries(
  testActionDefinitionList.map(
    (definition): [string, ActionDefinition<FlowActionDefinitionId>] => [
      definition.actionDefinitionId,
      toActionDefinition(definition),
    ],
  ),
) satisfies ActionDefinitions;

const step = (
  stepId: string,
  actionDefinitionId: string,
  inputs: Record<string, StepInputSource> = {},
): StepDefinition<string> => ({
  kind: "action",
  stepId,
  actionDefinitionId,
  description: "",
  inputs,
});

const outputOf = (
  stepId: string,
  outputName: string,
): Extract<StepInputSource, { kind: "step-output" }> => ({
  kind: "step-output",
  stepId,
  outputName,
});

const flowWith = (steps: StepDefinition<string>[]): FlowDefinition<string> => ({
  name: "Test",
  description: "A flow for testing derived kinds",
  inputs: [],
  steps,
  outputs: [],
});

const diagnosticsOf = (
  flowDefinition: FlowDefinition<string>,
): Omit<FlowDefinitionDiagnostic, "message">[] =>
  validateFlowDefinition(flowDefinition, {
    actionDefinitions: testActionDefinitions,
  }).diagnostics.map(
    ({ severity, code, path }): Omit<FlowDefinitionDiagnostic, "message"> => ({
      severity,
      code,
      path,
    }),
  );

describe("outputs that take their kind from an input", () => {
  test("take the kind connected to the input, with their own array-ness", () => {
    expect.hasAssertions();

    const flow = flowWith([
      step("research", "research"),
      step("filter", "filter", { items: outputOf("research", "entities") }),
      step("find", "findOne", { items: outputOf("filter", "matches") }),
    ]);

    const shapes = createStepShapeResolver(flow, testActionDefinitions);

    expect(shapes.getStepOutputShape("filter", "matches")).toStrictEqual({
      payloadKind: "PersistedEntityMetadata",
      array: true,
      required: true,
    });
    expect(shapes.getStepOutputShape("find", "match")).toStrictEqual({
      payloadKind: "PersistedEntityMetadata",
      array: false,
      required: false,
    });
  });

  test("resolve through a for-each step's items and collected output", () => {
    expect.hasAssertions();

    const flow = flowWith([
      step("research", "research"),
      {
        kind: "for-each",
        stepId: "each",
        description: "",
        over: outputOf("research", "entities"),
        steps: [
          step("filter", "filter", { items: { kind: "item", wrap: true } }),
        ],
        collect: { stepId: "filter", outputName: "matches", as: "allMatches" },
      },
    ]);

    const shapes = createStepShapeResolver(flow, testActionDefinitions);

    expect(shapes.getStepOutputShape("each", "allMatches")).toStrictEqual({
      payloadKind: "PersistedEntityMetadata",
      array: true,
      required: true,
    });
    expect(diagnosticsOf(flow)).toStrictEqual([]);
  });

  test("are checked against the steps they feed", () => {
    expect.hasAssertions();

    const compatibleFlow = flowWith([
      step("research", "research"),
      step("filter", "filter", { items: outputOf("research", "entities") }),
      step("summarize", "summarize", {
        entities: outputOf("filter", "matches"),
      }),
    ]);

    expect(diagnosticsOf(compatibleFlow)).toStrictEqual([]);

    const incompatibleFlow = flowWith([
      step("research", "research"),
      step("find", "findOne", { items: outputOf("research", "entities") }),
      step("echo", "echo", {
        text: { ...outputOf("find", "match"), whenMissing: "skip" },
      }),
    ]);

    expect(diagnosticsOf(incompatibleFlow)).toStrictEqual([
      {
        severity: "error",
        code: "incompatibleConnection",
        path: ["steps", 2, "inputs", "text"],
      },
    ]);
  });

  test("are reported as unresolved once, only when the input they take their kind from is optional and not connected", () => {
    expect.hasAssertions();

    /* Nothing downstream of the unresolved output is reported again. */
    const unresolvedFlow = flowWith([
      step("pick", "pickIfGiven"),
      step("echo", "echo", {
        text: { ...outputOf("pick", "first"), whenMissing: "skip" },
      }),
    ]);

    expect(diagnosticsOf(unresolvedFlow)).toStrictEqual([
      {
        severity: "error",
        code: "unresolvedKind",
        path: ["steps", 0, "inputs"],
      },
    ]);

    /* An unconnected required input is reported as missing instead. */
    const unconnectedFlow = flowWith([step("filter", "filter")]);

    expect(diagnosticsOf(unconnectedFlow)).toStrictEqual([
      { severity: "error", code: "missingInput", path: ["steps", 0, "inputs"] },
    ]);
  });

  test("don't resolve when their kind leads back to themselves", () => {
    expect.hasAssertions();

    const flow = flowWith([
      step("first", "filter", { items: outputOf("second", "matches") }),
      step("second", "filter", { items: outputOf("first", "matches") }),
    ]);

    const shapes = createStepShapeResolver(flow, testActionDefinitions);

    expect(shapes.getStepOutputShape("first", "matches")).toBeNull();
    expect(diagnosticsOf(flow)).toContainEqual(
      expect.objectContaining({ code: "cycle" }),
    );
  });
});

describe("inputs that take their kind from another input", () => {
  test("must be given a value of the connected kind", () => {
    expect.hasAssertions();

    const matchingFlow = flowWith([
      step("research", "research"),
      step("first", "pick", { items: outputOf("research", "entities") }),
      step("find", "findOne", {
        items: outputOf("research", "entities"),
        fallback: outputOf("first", "first"),
      }),
    ]);

    expect(diagnosticsOf(matchingFlow)).toStrictEqual([]);

    const mismatchedFlow = flowWith([
      step("research", "research"),
      step("find", "findOne", {
        items: outputOf("research", "entities"),
        fallback: {
          kind: "constant",
          payload: { kind: "Text", value: "none" },
        },
      }),
    ]);

    expect(diagnosticsOf(mismatchedFlow)).toStrictEqual([
      {
        severity: "error",
        code: "kindMismatch",
        path: ["steps", 1, "inputs", "fallback"],
      },
    ]);
  });
});
