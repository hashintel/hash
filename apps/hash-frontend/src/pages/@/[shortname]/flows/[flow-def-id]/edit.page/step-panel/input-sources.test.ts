import { describe, expect, it } from "vitest";

import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";

import { actionStep, flowWith } from "../shared/step-fixtures";
import {
  getInputTarget,
  getNewFlowInput,
  getSourceOptions,
} from "./input-sources";

import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";

const explanationOf = (stepId: string) => ({
  kind: "step-output" as const,
  stepId,
  outputName: "explanation",
});

const answer = (
  stepId: string,
  options: Parameters<typeof actionStep>[1] = {},
) =>
  actionStep(stepId, {
    actionDefinitionId: "answerQuestion",
    description: stepId,
    ...options,
  });

const offeredFor = (
  flowDefinition: FlowDefinition<string>,
  stepId: string,
  inputName: string,
) => {
  const step = flowDefinition.steps.find(
    (candidate) => candidate.stepId === stepId,
  );

  if (step?.kind !== "action") {
    throw new Error(`No action step "${stepId}"`);
  }

  const actionDefinition =
    actionDefinitions[
      step.actionDefinitionId as keyof typeof actionDefinitions
    ];
  const input = actionDefinition.inputs.find(({ name }) => name === inputName);

  if (!input) {
    throw new Error(`No input "${inputName}"`);
  }

  const { flowInputs, earlierSteps } = getSourceOptions({
    flowDefinition,
    stepId,
    target: getInputTarget({ flowDefinition, stepId, input, actionDefinition }),
  });

  return {
    flowInputs: flowInputs.map(({ label, source }) => ({ label, source })),
    earlierSteps: earlierSteps.map(({ from, label }) => `${from} › ${label}`),
  };
};

describe("getSourceOptions", () => {
  /*
   * first → second ⇢ third (a data link) → fetch → later, with `list` (a for-each step) also before `fetch`, and
   * `loose` connected to nothing. `fetch` takes a URL: one required Text.
   */
  const flowDefinition: FlowDefinition<string> = {
    ...flowWith([
      answer("first"),
      answer("second", { runAfter: [{ stepId: "first" }] }),
      answer("third", { inputs: { question: explanationOf("second") } }),
      {
        kind: "for-each",
        stepId: "list",
        description: "list",
        over: { kind: "flow-input", inputName: "questions" },
        steps: [answer("inner", { inputs: { question: { kind: "item" } } })],
        collect: { stepId: "inner", outputName: "explanation", as: "all" },
      },
      actionStep("fetch", {
        actionDefinitionId: "getWebPageByUrl",
        runAfter: [{ stepId: "third" }, { stepId: "list" }],
      }),
      answer("later", { runAfter: [{ stepId: "fetch" }] }),
      answer("loose"),
    ]),
    inputs: [
      {
        name: "site",
        label: "Site",
        payloadKind: "Text",
        array: false,
        required: true,
      },
      { name: "count", payloadKind: "Number", array: false, required: true },
      { name: "notes", payloadKind: "Text", array: false, required: false },
      { name: "questions", payloadKind: "Text", array: true, required: true },
    ],
  };

  it("offers the outputs of every step the step runs after, directly or not, nearest first, and none after it or apart from it", () => {
    /*
     * Each answer step also gives `answer` (FormattedText), `confidence` (a Number) and `sourceCode` (Text that may be
     * missing), and `list` gives a Text list: none can feed one required Text.
     */
    expect(offeredFor(flowDefinition, "fetch", "url").earlierSteps).toEqual([
      "third › Explanation",
      "second › Explanation",
      "first › Explanation",
    ]);
  });

  it("offers only the flow inputs that can feed the input, under their label or name", () => {
    expect(offeredFor(flowDefinition, "fetch", "url").flowInputs).toEqual([
      { label: "Site", source: { kind: "flow-input", inputName: "site" } },
    ]);

    /* An optional input also takes values that may be missing. */
    expect(offeredFor(flowDefinition, "third", "context")).toEqual({
      flowInputs: [
        { label: "Site", source: { kind: "flow-input", inputName: "site" } },
        { label: "Notes", source: { kind: "flow-input", inputName: "notes" } },
      ],
      earlierSteps: [
        "second › Explanation",
        "second › Source code",
        "first › Explanation",
        "first › Source code",
      ],
    });
  });

  it("offers an output that takes its kind from an input only once that input is picked", () => {
    const filtered = {
      ...flowDefinition,
      steps: [
        actionStep("picked", {
          actionDefinitionId: "filterList",
          description: "picked",
          inputs: { items: { kind: "flow-input", inputName: "questions" } },
        }),
        actionStep("unpicked", {
          actionDefinitionId: "filterList",
          description: "unpicked",
        }),
        actionStep("next", {
          actionDefinitionId: "filterList",
          runAfter: [{ stepId: "picked" }, { stepId: "unpicked" }],
        }),
      ],
    };

    expect(offeredFor(filtered, "next", "items")).toEqual({
      flowInputs: [
        {
          label: "Questions",
          source: { kind: "flow-input", inputName: "questions" },
        },
      ],
      earlierSteps: ["picked › Matching", "picked › Non matching"],
    });
  });
});

describe("getNewFlowInput", () => {
  it("names a new flow input after the input, apart from the flow's other inputs, in a kind the input takes", () => {
    const flowDefinition: FlowDefinition<string> = {
      ...flowWith([]),
      inputs: [
        { name: "url", payloadKind: "Text", array: false, required: true },
        { name: "url2", payloadKind: "Text", array: false, required: true },
      ],
    };

    expect(
      getNewFlowInput({
        flowDefinition,
        inputName: "url",
        target: { oneOfPayloadKinds: ["Text"], array: false, required: true },
      }),
    ).toEqual({
      name: "url3",
      label: "Url 3",
      payloadKind: "Text",
      array: false,
      required: true,
    });
    expect(
      getNewFlowInput({
        flowDefinition,
        inputName: "since",
        target: {
          oneOfPayloadKinds: ["DateTime", "Date"],
          array: true,
          required: false,
        },
      }),
    ).toEqual({
      name: "since",
      label: "Since",
      payloadKind: "DateTime",
      array: true,
      required: false,
    });
  });
});
