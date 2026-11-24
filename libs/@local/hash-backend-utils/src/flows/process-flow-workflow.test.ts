import { describe, expect, it } from "vitest";

import { getStepReadiness } from "./process-flow-workflow.js";
import { getStepsInFlowById } from "./process-flow-workflow/get-all-steps-in-flow.js";

import type { EntityId } from "@blockprotocol/type-system";
import type {
  ActionStep,
  ActionStepDefinition,
  FlowDefinition,
  LocalFlowRun,
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
