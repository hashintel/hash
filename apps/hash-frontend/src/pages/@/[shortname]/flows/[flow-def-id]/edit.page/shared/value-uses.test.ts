import { describe, expect, it } from "vitest";

import { actionStep } from "./step-fixtures";
import { indexValueUses } from "./value-uses";

import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

const outputOf = (stepId: string, outputName: string) => ({
  kind: "step-output" as const,
  stepId,
  outputName,
});

/** `search` gives `results`, which steps at every depth read, and `answer`, which only `other` reads, in two inputs. */
const steps: StepDefinition<string>[] = [
  actionStep("search"),
  actionStep("summary", {
    inputs: { context: outputOf("search", "results") },
  }),
  {
    kind: "for-each",
    stepId: "each",
    description: "",
    over: outputOf("search", "results"),
    steps: [
      actionStep("check", {
        inputs: {
          item: { kind: "item" },
          context: outputOf("search", "results"),
        },
      }),
    ],
    collect: { stepId: "check", outputName: "verdict", as: "verdicts" },
  },
  actionStep("other", {
    inputs: {
      question: outputOf("search", "answer"),
      factCheckedAnswer: outputOf("search", "answer"),
      context: outputOf("summary", "results"),
      topic: { kind: "flow-input", inputName: "topic" },
    },
  }),
];

const usesOf = indexValueUses(steps);

const stepIdsUsing = (value: Parameters<typeof usesOf>[0]) =>
  usesOf(value).map(({ step }) => step.stepId);

const propertiesUsing = (value: Parameters<typeof usesOf>[0]) =>
  usesOf(value).map(({ step, properties }) => [step.stepId, properties]);

describe("indexValueUses", () => {
  it("lists the steps that use an output at any depth, including a for-each step running over it, each once", () => {
    expect(stepIdsUsing(outputOf("search", "results"))).toEqual([
      "summary",
      "each",
      "check",
    ]);
    expect(stepIdsUsing(outputOf("search", "answer"))).toEqual(["other"]);
  });

  it("counts a for-each step collecting an output of a step inside it as using it", () => {
    expect(stepIdsUsing(outputOf("check", "verdict"))).toEqual(["each"]);
  });

  it("names the properties of each step that take the value, all of them for a step taking it twice", () => {
    expect(propertiesUsing(outputOf("search", "results"))).toEqual([
      ["summary", ["Context"]],
      ["each", ["List"]],
      ["check", ["Context"]],
    ]);
    expect(propertiesUsing(outputOf("check", "verdict"))).toEqual([
      ["each", ["Collects"]],
    ]);
    expect(propertiesUsing(outputOf("search", "answer"))).toEqual([
      ["other", ["Question", "Fact checked answer"]],
    ]);
  });

  it("lists the steps that use a flow input, and none for a value nothing uses", () => {
    expect(stepIdsUsing({ kind: "flow-input", inputName: "topic" })).toEqual([
      "other",
    ]);
    expect(stepIdsUsing(outputOf("other", "answer"))).toEqual([]);
  });
});
