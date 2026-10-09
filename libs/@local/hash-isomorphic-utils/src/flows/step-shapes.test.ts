import { describe, expect, it } from "vitest";

import {
  type ActionDefinitions,
  createStepShapeResolver,
} from "./step-shapes.js";
import { allPayloadKinds } from "./types.js";
import {
  type FlowDefinitionDiagnostic,
  validateFlowDefinition,
} from "./validate-flow-definition.js";

import type {
  ActionDefinition,
  FlowActionDefinitionId,
  FlowDefinition,
  StepDefinition,
  StepInputSource,
} from "./types.js";

/**
 * The actions these tests' flows use, given to the resolver and validator in place of the codebase's.
 */
const testActionDefinitions = Object.fromEntries(
  (
    [
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
        actionDefinitionId: "find",
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
    ] satisfies (Pick<
      ActionDefinition<FlowActionDefinitionId>,
      "inputs" | "outputs"
    > & { actionDefinitionId: string })[]
  ).map((definition) => [
    definition.actionDefinitionId,
    {
      ...definition,
      kind: "action",
      name: definition.actionDefinitionId,
      description: "",
    } as unknown as ActionDefinition<FlowActionDefinitionId>,
  ]),
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

const diagnosticsOf = (flowDefinition: FlowDefinition<string>) =>
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
  it("take the kind connected to the input, with their own array-ness", () => {
    const flow = flowWith([
      step("research", "research"),
      step("filter", "filter", { items: outputOf("research", "entities") }),
      step("find", "find", { items: outputOf("filter", "matches") }),
    ]);

    const shapes = createStepShapeResolver(flow, testActionDefinitions);

    expect(shapes.getStepOutputShape("filter", "matches")).toEqual({
      payloadKind: "PersistedEntityMetadata",
      array: true,
      required: true,
    });
    expect(shapes.getStepOutputShape("find", "match")).toEqual({
      payloadKind: "PersistedEntityMetadata",
      array: false,
      required: false,
    });
  });

  it("resolve through a for-each step's items and collected output", () => {
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

    expect(
      createStepShapeResolver(flow, testActionDefinitions).getStepOutputShape(
        "each",
        "allMatches",
      ),
    ).toEqual({
      payloadKind: "PersistedEntityMetadata",
      array: true,
      required: true,
    });
    expect(diagnosticsOf(flow)).toEqual([]);
  });

  it("are checked against the steps they feed", () => {
    expect(
      diagnosticsOf(
        flowWith([
          step("research", "research"),
          step("filter", "filter", { items: outputOf("research", "entities") }),
          step("summarize", "summarize", {
            entities: outputOf("filter", "matches"),
          }),
        ]),
      ),
    ).toEqual([]);

    expect(
      diagnosticsOf(
        flowWith([
          step("research", "research"),
          step("find", "find", { items: outputOf("research", "entities") }),
          step("echo", "echo", {
            text: { ...outputOf("find", "match"), whenMissing: "skip" },
          }),
        ]),
      ),
    ).toEqual([
      {
        severity: "error",
        code: "incompatibleConnection",
        path: ["steps", 2, "inputs", "text"],
      },
    ]);
  });

  it("are reported as unresolved once, only when the input they take their kind from is optional and not connected", () => {
    /* Nothing downstream of the unresolved output is reported again. */
    expect(
      diagnosticsOf(
        flowWith([
          step("pick", "pickIfGiven"),
          step("echo", "echo", {
            text: { ...outputOf("pick", "first"), whenMissing: "skip" },
          }),
        ]),
      ),
    ).toEqual([
      {
        severity: "error",
        code: "unresolvedKind",
        path: ["steps", 0, "inputs"],
      },
    ]);

    /* An unconnected required input is reported as missing instead. */
    expect(diagnosticsOf(flowWith([step("filter", "filter")]))).toEqual([
      { severity: "error", code: "missingInput", path: ["steps", 0, "inputs"] },
    ]);
  });

  it("don't resolve when their kind leads back to themselves", () => {
    const flow = flowWith([
      step("first", "filter", { items: outputOf("second", "matches") }),
      step("second", "filter", { items: outputOf("first", "matches") }),
    ]);

    expect(
      createStepShapeResolver(flow, testActionDefinitions).getStepOutputShape(
        "first",
        "matches",
      ),
    ).toBeNull();
    expect(diagnosticsOf(flow)).toContainEqual(
      expect.objectContaining({ code: "cycle" }),
    );
  });
});

describe("inputs that take their kind from another input", () => {
  it("must be given a value of the connected kind", () => {
    expect(
      diagnosticsOf(
        flowWith([
          step("research", "research"),
          step("first", "pick", { items: outputOf("research", "entities") }),
          step("find", "find", {
            items: outputOf("research", "entities"),
            fallback: outputOf("first", "first"),
          }),
        ]),
      ),
    ).toEqual([]);

    expect(
      diagnosticsOf(
        flowWith([
          step("research", "research"),
          step("find", "find", {
            items: outputOf("research", "entities"),
            fallback: {
              kind: "constant",
              payload: { kind: "Text", value: "none" },
            },
          }),
        ]),
      ),
    ).toEqual([
      {
        severity: "error",
        code: "kindMismatch",
        path: ["steps", 1, "inputs", "fallback"],
      },
    ]);
  });
});
