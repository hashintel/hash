import { describe, expect, it } from "vitest";

import { getStepReadiness } from "./process-flow-workflow.js";
import { getStepsInFlowById } from "./process-flow-workflow/get-all-steps-in-flow.js";
import {
  initializeActionStep,
  initializeFlow,
} from "./process-flow-workflow/initialize-flow.js";
import { passOutputsToUnprocessedSteps } from "./process-flow-workflow/pass-outputs-to-unprocessed-steps.js";

import type { EntityId } from "@blockprotocol/type-system";
import type {
  ActionStep,
  ActionStepDefinition,
  FlowDefinition,
  FlowInputValues,
  LocalFlowRun,
  StepInputSource,
} from "@local/hash-isomorphic-utils/flows/types";

describe("getStepReadiness", () => {
  describe("steps that run after other steps", () => {
    const getFileStep = (
      stepId: string,
      runAfter?: ActionStepDefinition["runAfter"],
    ): ActionStepDefinition => ({
      kind: "action",
      stepId,
      actionDefinitionId: "getFileFromUrl",
      description: "",
      inputs: { url: { kind: "flow-input", inputName: "url" } },
      runAfter,
    });

    const flowDefinition: FlowDefinition = {
      name: "",
      description: "",
      inputs: [
        { name: "url", payloadKind: "Text", array: false, required: true },
        { name: "urls", payloadKind: "Text", array: true, required: true },
      ],
      steps: [
        getFileStep("first"),
        getFileStep("second", [{ stepId: "first" }]),
        {
          kind: "for-each",
          stepId: "each",
          description: "",
          over: { kind: "flow-input", inputName: "urls" },
          steps: [
            getFileStep("inner"),
            getFileStep("afterInner", [{ stepId: "inner" }]),
          ],
          collect: { stepId: "inner", outputName: "fileEntity", as: "files" },
          runAfter: [{ stepId: "first" }],
        },
        getFileStep("afterEach", [{ stepId: "each" }]),
      ],
      outputs: [],
    };

    /* Each step has its input, so only the steps it runs after can keep it waiting. */
    const runStep = (stepId: string): ActionStep => ({
      kind: "action",
      stepId,
      actionDefinitionId: "getFileFromUrl",
      inputs: [
        {
          inputName: "url",
          payload: { kind: "Text", value: "https://example.com" },
        },
      ],
    });

    const readiness = (
      stepId: string,
      {
        processed = [],
        skipped = [],
        failed = [],
        collected = false,
      }: {
        processed?: string[];
        skipped?: string[];
        failed?: string[];
        collected?: boolean;
      } = {},
    ) => {
      const each = {
        kind: "for-each" as const,
        stepId: "each",
        over: { kind: "Text" as const, value: ["https://example.com"] },
        steps: [runStep("inner~0"), runStep("afterInner~0")],
        ...(collected
          ? {
              collected: {
                outputName: "files",
                payload: { kind: "Text" as const, value: [] },
              },
            }
          : {}),
      };

      const flow: LocalFlowRun = {
        name: "",
        temporalWorkflowId: "",
        flowInputs: {},
        flowDefinitionEntityId:
          "d4e16033-c281-4cde-aa35-9085bf2e7579~0f5f3bd1-3a28-4b9f-9e3a-5b4a6b1c2d00" as EntityId,
        steps: [
          runStep("first"),
          runStep("second"),
          each,
          runStep("afterEach"),
        ],
      };

      const stepsById = getStepsInFlowById(flow);

      return getStepReadiness(stepsById.get(stepId)!, {
        flowDefinition,
        stepsById,
        processedStepIds: new Set(processed),
        skippedStepIds: new Set(skipped),
        failedStepIds: new Set(failed),
      });
    };

    it("waits until each step it runs after has finished", () => {
      expect(readiness("first")).toBe("ready");
      expect(readiness("second")).toBe("waiting");
      expect(readiness("second", { processed: ["first"] })).toBe("ready");
    });

    it("is skipped after a skipped step, as the run didn't follow the line to it", () => {
      expect(readiness("second", { skipped: ["first"] })).toBe("skip");
    });

    it("never starts after a step that failed", () => {
      expect(
        readiness("second", { processed: ["first"], failed: ["first"] }),
      ).toBe("waiting");
    });

    it("applies to for-each steps", () => {
      expect(readiness("each")).toBe("waiting");
      expect(readiness("each", { processed: ["first"] })).toBe("ready");
    });

    it("waits for a for-each step until it has collected every item, and every step in each item has finished", () => {
      const everyStep = ["first", "each", "inner~0", "afterInner~0"];

      expect(readiness("afterEach", { processed: everyStep })).toBe("waiting");
      expect(
        readiness("afterEach", {
          processed: everyStep.filter((stepId) => stepId !== "afterInner~0"),
          collected: true,
        }),
      ).toBe("waiting");
      expect(
        readiness("afterEach", { processed: everyStep, collected: true }),
      ).toBe("ready");
    });
  });

  describe("steps on an if's paths", () => {
    const fileStep = (
      stepId: string,
      runAfter: ActionStepDefinition["runAfter"],
    ): ActionStepDefinition => ({
      kind: "action",
      stepId,
      actionDefinitionId: "getFileFromUrl",
      description: "",
      inputs: { url: { kind: "flow-input", inputName: "url" } },
      runAfter,
    });

    const ifStep = (stepId: string): ActionStepDefinition => ({
      kind: "action",
      stepId,
      actionDefinitionId: "if",
      description: "",
      inputs: {
        value: { kind: "flow-input", inputName: "url" },
        condition: { kind: "flow-input", inputName: "condition" },
      },
    });

    /*
     * check ─Yes─▶ yes ─▶ afterYes ─┐
     *       └─No──▶ no ─────────────┴─▶ rejoin
     *
     * and the same if, with a step on its Yes path, inside a for-each step.
     */
    const flowDefinition: FlowDefinition = {
      name: "",
      description: "",
      inputs: [
        { name: "url", payloadKind: "Text", array: false, required: true },
        { name: "urls", payloadKind: "Text", array: true, required: true },
        {
          name: "condition",
          payloadKind: "FilterCondition",
          array: false,
          required: true,
        },
      ],
      steps: [
        ifStep("check"),
        fileStep("yes", [{ stepId: "check", outputName: "true" }]),
        fileStep("no", [{ stepId: "check", outputName: "false" }]),
        fileStep("afterYes", [{ stepId: "yes" }]),
        fileStep("rejoin", [{ stepId: "afterYes" }, { stepId: "no" }]),
        fileStep("afterCheck", [{ stepId: "check" }]),
        {
          kind: "for-each",
          stepId: "each",
          description: "",
          over: { kind: "flow-input", inputName: "urls" },
          steps: [
            ifStep("innerCheck"),
            fileStep("innerYes", [
              { stepId: "innerCheck", outputName: "true" },
            ]),
          ],
          collect: { stepId: "innerCheck", outputName: "true", as: "passed" },
        },
      ],
      outputs: [],
    };

    const text = { kind: "Text" as const, value: "https://example.com" };

    /* Each step has its inputs, so only the steps it runs after decide whether it runs. */
    const runStep = (
      stepId: string,
      outputName?: "true" | "false",
    ): ActionStep => ({
      kind: "action",
      stepId,
      actionDefinitionId:
        stepId === "check" || stepId.startsWith("innerCheck~")
          ? "if"
          : "getFileFromUrl",
      inputs: [{ inputName: "url", payload: text }],
      ...(outputName ? { outputs: [{ outputName, payload: text }] } : {}),
    });

    const readiness = (
      stepId: string,
      {
        took,
        processed = [],
        skipped = [],
      }: {
        /** The path each if took, by its run step id. */
        took?: Record<string, "true" | "false">;
        processed?: string[];
        skipped?: string[];
      },
    ) => {
      const runStepIds = [
        "check",
        "yes",
        "no",
        "afterYes",
        "rejoin",
        "afterCheck",
      ];

      const flow: LocalFlowRun = {
        name: "",
        temporalWorkflowId: "",
        flowInputs: {},
        flowDefinitionEntityId:
          "d4e16033-c281-4cde-aa35-9085bf2e7579~0f5f3bd1-3a28-4b9f-9e3a-5b4a6b1c2d00" as EntityId,
        steps: [
          ...runStepIds.map((id) => runStep(id, took?.[id])),
          {
            kind: "for-each",
            stepId: "each",
            over: { kind: "Text", value: ["a", "b"] },
            steps: [0, 1].flatMap((index) => [
              runStep(`innerCheck~${index}`, took?.[`innerCheck~${index}`]),
              runStep(`innerYes~${index}`),
            ]),
          },
        ],
      };

      const stepsById = getStepsInFlowById(flow);

      return getStepReadiness(stepsById.get(stepId)!, {
        flowDefinition,
        stepsById,
        processedStepIds: new Set([...processed, ...skipped]),
        skippedStepIds: new Set(skipped),
        failedStepIds: new Set(),
      });
    };

    it("waits for the if to finish before deciding", () => {
      expect(readiness("yes", {})).toBe("waiting");
      expect(readiness("no", {})).toBe("waiting");
    });

    it("runs the step on the path the if takes, and skips the step on the other", () => {
      const tookYes = {
        took: { check: "true" as const },
        processed: ["check"],
      };
      const tookNo = {
        took: { check: "false" as const },
        processed: ["check"],
      };

      expect(readiness("yes", tookYes)).toBe("ready");
      expect(readiness("no", tookYes)).toBe("skip");
      expect(readiness("yes", tookNo)).toBe("skip");
      expect(readiness("no", tookNo)).toBe("ready");
    });

    it("skips the steps further down a path the if didn't take", () => {
      expect(
        readiness("afterYes", {
          took: { check: "false" },
          processed: ["check", "no"],
          skipped: ["yes"],
        }),
      ).toBe("skip");
    });

    it("runs a step where the paths rejoin, whichever path the if took", () => {
      expect(
        readiness("rejoin", {
          took: { check: "true" },
          processed: ["check", "yes", "afterYes"],
          skipped: ["no"],
        }),
      ).toBe("ready");
      expect(
        readiness("rejoin", {
          took: { check: "false" },
          processed: ["check", "no"],
          skipped: ["yes", "afterYes"],
        }),
      ).toBe("ready");
      expect(
        readiness("rejoin", {
          took: { check: "false" },
          processed: ["check"],
          skipped: ["yes", "afterYes"],
        }),
      ).toBe("waiting");
    });

    it("runs a step after the if itself whichever path it took", () => {
      for (const path of ["true", "false"] as const) {
        expect(
          readiness("afterCheck", {
            took: { check: path },
            processed: ["check"],
          }),
        ).toBe("ready");
      }
    });

    it("skips the steps on both paths of a skipped if", () => {
      for (const stepId of ["yes", "no", "afterCheck"]) {
        expect(readiness(stepId, { skipped: ["check"] })).toBe("skip");
      }
    });

    it("follows each item's if inside a for-each step", () => {
      const context = {
        took: { "innerCheck~0": "true", "innerCheck~1": "false" } as const,
        processed: ["each", "innerCheck~0", "innerCheck~1"],
      };

      expect(readiness("innerYes~0", context)).toBe("ready");
      expect(readiness("innerYes~1", context)).toBe("skip");
    });
  });
});

describe("an input built from several values", () => {
  const nameUrl = "https://example.com/types/property-type/name/";
  const bioUrl = "https://example.com/types/property-type/bio/";
  const scoreUrl = "https://example.com/types/property-type/score/";
  const textId = "https://example.com/types/data-type/text/v/1";
  const numberId = "https://example.com/types/data-type/number/v/1";

  const answerStep = (stepId: string): ActionStepDefinition => ({
    kind: "action",
    stepId,
    actionDefinitionId: "answerQuestion",
    description: "",
    inputs: { question: { kind: "flow-input", inputName: "name" } },
  });

  const createStep = (properties: StepInputSource): ActionStepDefinition => ({
    kind: "action",
    stepId: "create",
    actionDefinitionId: "createEntity",
    description: "",
    inputs: {
      entityTypeIds: {
        kind: "constant",
        payload: {
          kind: "VersionedUrl",
          value: ["https://example.com/types/entity-type/person/v/1"],
        },
      },
      properties,
    },
  });

  /** Takes the name from a flow input, the bio from the step before, and a fixed score. */
  const properties: StepInputSource = {
    kind: "properties",
    values: {
      [nameUrl]: {
        dataTypeId: textId,
        from: { kind: "flow-input", inputName: "name" },
      },
      [bioUrl]: {
        dataTypeId: textId,
        from: {
          kind: "step-output",
          stepId: "answer",
          outputName: "explanation",
        },
      },
      [scoreUrl]: {
        dataTypeId: numberId,
        from: { kind: "constant", payload: { kind: "Number", value: 3 } },
      },
    },
  };

  const definitionWith = (steps: FlowDefinition["steps"]): FlowDefinition => ({
    name: "",
    description: "",
    inputs: [
      { name: "name", payloadKind: "Text", array: false, required: true },
      { name: "nickname", payloadKind: "Text", array: false, required: false },
      { name: "names", payloadKind: "Text", array: true, required: true },
    ],
    steps,
    outputs: [],
  });

  const startRun = (
    flowDefinition: FlowDefinition,
    flowInputs: FlowInputValues = { name: { kind: "Text", value: "Ada" } },
  ) => {
    const flow = initializeFlow({
      flowDefinition,
      flowDefinitionEntityId:
        "d4e16033-c281-4cde-aa35-9085bf2e7579~0f5f3bd1-3a28-4b9f-9e3a-5b4a6b1c2d00" as EntityId,
      flowInputs,
      name: "",
      temporalWorkflowId: "",
    });
    const stepsById = getStepsInFlowById(flow);
    const processed = new Set<string>();
    const skipped = new Set<string>();

    return {
      stepsById,
      processed,
      skipped,
      inputOf: (stepId: string, inputName: string) => {
        const step = stepsById.get(stepId);

        return step?.kind === "action"
          ? step.inputs?.find((input) => input.inputName === inputName)?.payload
          : undefined;
      },
      readinessOf: (stepId: string) =>
        getStepReadiness(stepsById.get(stepId)!, {
          flowDefinition,
          stepsById,
          processedStepIds: processed,
          skippedStepIds: skipped,
          failedStepIds: new Set(),
        }),
      finish: (stepId: string, explanation?: string) => {
        const outputs = explanation
          ? [
              {
                outputName: "explanation",
                payload: { kind: "Text" as const, value: explanation },
              },
            ]
          : [];
        const step = stepsById.get(stepId);

        if (step?.kind === "action") {
          step.outputs = outputs;
        }

        processed.add(stepId);

        passOutputsToUnprocessedSteps({
          stepsById,
          flowDefinition,
          stepId,
          outputs,
          processedStepIds: processed,
        });
      },
    };
  };

  it("waits for every value, then gives the step the input a constant with those values would", () => {
    const run = startRun(
      definitionWith([answerStep("answer"), createStep(properties)]),
    );

    expect(run.inputOf("create", "properties")).toBeUndefined();
    expect(run.readinessOf("create")).toBe("waiting");

    run.finish("answer", "A mathematician");

    expect(run.readinessOf("create")).toBe("ready");
    expect(run.inputOf("create", "properties")).toEqual({
      kind: "PropertyObjectWithMetadata",
      value: {
        value: {
          [nameUrl]: { value: "Ada", metadata: { dataTypeId: textId } },
          [bioUrl]: {
            value: "A mathematician",
            metadata: { dataTypeId: textId },
          },
          [scoreUrl]: { value: 3, metadata: { dataTypeId: numberId } },
        },
      },
    });
  });

  it("builds the input when the run starts if no value comes from a step", () => {
    const run = startRun(
      definitionWith([
        createStep({
          kind: "properties",
          values: {
            [nameUrl]: {
              dataTypeId: textId,
              from: { kind: "flow-input", inputName: "name" },
            },
          },
        }),
      ]),
    );

    expect(run.readinessOf("create")).toBe("ready");
    expect(run.inputOf("create", "properties")).toEqual({
      kind: "PropertyObjectWithMetadata",
      value: {
        value: {
          [nameUrl]: { value: "Ada", metadata: { dataTypeId: textId } },
        },
      },
    });
  });

  it("skips the step when the step a value comes from was skipped", () => {
    const run = startRun(
      definitionWith([answerStep("answer"), createStep(properties)]),
    );

    run.processed.add("answer");
    run.skipped.add("answer");

    expect(run.readinessOf("create")).toBe("skip");
  });

  it("never starts the step when the step a value comes from didn't give it", () => {
    const run = startRun(
      definitionWith([answerStep("answer"), createStep(properties)]),
    );

    run.finish("answer");

    expect(run.readinessOf("create")).toBe("waiting");
    expect(run.inputOf("create", "properties")).toBeUndefined();
  });

  it("skips the step when a flow input it skips on wasn't given, and runs it when it was", () => {
    const flowDefinition = definitionWith([
      createStep({
        kind: "properties",
        values: {
          [nameUrl]: {
            dataTypeId: textId,
            from: {
              kind: "flow-input",
              inputName: "nickname",
              whenMissing: "skip",
            },
          },
        },
      }),
    ]);

    expect(startRun(flowDefinition).readinessOf("create")).toBe("skip");
    expect(
      startRun(flowDefinition, {
        nickname: { kind: "Text", value: "Countess" },
      }).readinessOf("create"),
    ).toBe("ready");
  });

  it("builds property patches in the order they're listed, removals included", () => {
    const run = startRun(
      definitionWith([
        answerStep("answer"),
        {
          kind: "action",
          stepId: "update",
          actionDefinitionId: "updateEntity",
          description: "",
          inputs: {
            entityId: {
              kind: "constant",
              payload: {
                kind: "EntityId",
                value:
                  "d4e16033-c281-4cde-aa35-9085bf2e7579~0f5f3bd1-3a28-4b9f-9e3a-5b4a6b1c2d00",
              },
            },
            propertyPatches: {
              kind: "property-patches",
              patches: [
                { op: "remove", path: [scoreUrl] },
                {
                  op: "add",
                  path: [bioUrl],
                  dataTypeId: textId,
                  from: {
                    kind: "step-output",
                    stepId: "answer",
                    outputName: "explanation",
                  },
                },
                {
                  op: "replace",
                  path: [nameUrl],
                  dataTypeId: textId,
                  from: { kind: "flow-input", inputName: "name" },
                },
              ],
            },
          },
        },
      ]),
    );

    expect(run.readinessOf("update")).toBe("waiting");

    run.finish("answer", "A mathematician");

    expect(run.readinessOf("update")).toBe("ready");
    expect(run.inputOf("update", "propertyPatches")).toEqual({
      kind: "PropertyPatch",
      value: [
        { op: "remove", path: [scoreUrl] },
        {
          op: "add",
          path: [bioUrl],
          property: {
            value: "A mathematician",
            metadata: { dataTypeId: textId },
          },
        },
        {
          op: "replace",
          path: [nameUrl],
          property: { value: "Ada", metadata: { dataTypeId: textId } },
        },
      ],
    });
  });

  it("takes each item's own values inside a for-each step", () => {
    const itemProperties: StepInputSource = {
      kind: "properties",
      values: {
        [nameUrl]: { dataTypeId: textId, from: { kind: "item" } },
        [bioUrl]: {
          dataTypeId: textId,
          from: {
            kind: "step-output",
            stepId: "answer",
            outputName: "explanation",
          },
        },
      },
    };
    const create = createStep(itemProperties);
    const flowDefinition = definitionWith([
      {
        kind: "for-each",
        stepId: "each",
        description: "",
        over: { kind: "flow-input", inputName: "names" },
        steps: [answerStep("answer"), create],
        collect: { stepId: "create", outputName: "entityId", as: "created" },
      },
    ]);
    const run = startRun(flowDefinition);

    /* The for-each step starts its items: each gets the steps inside it, with its item. */
    for (const [index, name] of ["Ada", "Grace"].entries()) {
      for (const stepDefinition of [answerStep("answer"), create]) {
        const step = initializeActionStep({
          flowInputs: {},
          stepDefinition,
          overrideStepId: `${stepDefinition.stepId}~${index}`,
          existingStepsById: run.stepsById,
          item: { kind: "Text", value: name },
        });

        run.stepsById.set(step.stepId, step);
      }
    }

    run.processed.add("each");
    run.finish("answer~1", "A rear admiral");

    expect(run.readinessOf("create~0")).toBe("waiting");
    expect(run.readinessOf("create~1")).toBe("ready");
    expect(run.inputOf("create~1", "properties")).toEqual({
      kind: "PropertyObjectWithMetadata",
      value: {
        value: {
          [nameUrl]: { value: "Grace", metadata: { dataTypeId: textId } },
          [bioUrl]: {
            value: "A rear admiral",
            metadata: { dataTypeId: textId },
          },
        },
      },
    });
  });
});
