import { describe, expect, it } from "vitest";

import { getStepReadiness } from "./process-flow-workflow.js";

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
          steps: [getFileStep("inner")],
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

      const step = flow.steps.find((candidate) => candidate.stepId === stepId)!;

      return getStepReadiness({
        step,
        flow,
        flowDefinition,
        processedStepIds: processed,
        skippedStepIds: skipped,
        failedStepIds: failed,
      });
    };

    it("waits until each step it runs after has finished", () => {
      expect(readiness("first")).toBe("ready");
      expect(readiness("second")).toBe("waiting");
      expect(readiness("second", { processed: ["first"] })).toBe("ready");
    });

    it("counts a skipped step as finished", () => {
      expect(readiness("second", { skipped: ["first"] })).toBe("ready");
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

    it("waits for a for-each step until every item has finished", () => {
      expect(readiness("afterEach", { processed: ["first", "each"] })).toBe(
        "waiting",
      );
      expect(
        readiness("afterEach", {
          processed: ["first", "each"],
          collected: true,
        }),
      ).toBe("ready");
    });
  });
});
