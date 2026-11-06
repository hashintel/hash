import { describe, expect, it } from "vitest";

import { createFlowEditor } from "@local/hash-isomorphic-utils/flows/flow-editor";

import { actionStep, flowWith } from "../shared/step-fixtures";
import { getFieldProblems, getPathInSource } from "./field-problems";

const answerInputNames = ["question", "context", "entities"];

const codesByInput = (fieldProblems: ReturnType<typeof getFieldProblems>) => ({
  byInputName: Object.fromEntries(
    [...fieldProblems.byInputName].map(([inputName, problems]) => [
      inputName,
      problems.map(({ code }) => code),
    ]),
  ),
  stepProblems: fieldProblems.stepProblems.map(({ code }) => code),
});

describe("getFieldProblems", () => {
  it("puts each problem on the input it's about, from its path, at any depth", () => {
    const { problemsByStepId } = createFlowEditor({
      ...flowWith([
        actionStep("top", {
          actionDefinitionId: "answerQuestion",
          inputs: {
            context: { kind: "flow-input", inputName: "removed" },
            entities: {
              kind: "constant",
              payload: { kind: "Number", value: 3 },
            },
          },
        }),
        {
          kind: "for-each",
          stepId: "each",
          description: "",
          over: { kind: "flow-input", inputName: "questions" },
          steps: [
            actionStep("inner", {
              actionDefinitionId: "answerQuestion",
              inputs: {
                question: { kind: "item" },
                context: {
                  kind: "step-output",
                  stepId: "gone",
                  outputName: "explanation",
                },
              },
            }),
          ],
          collect: { stepId: "inner", outputName: "explanation", as: "all" },
        },
      ]),
      inputs: [
        { name: "questions", payloadKind: "Text", array: true, required: true },
      ],
    }).getState();

    expect(
      codesByInput(
        getFieldProblems(problemsByStepId.get("top") ?? [], answerInputNames),
      ),
    ).toEqual({
      byInputName: {
        question: ["missingInput"],
        context: ["unknownFlowInput"],
        entities: ["incompatibleConnection"],
      },
      stepProblems: [],
    });
    expect(
      codesByInput(
        getFieldProblems(problemsByStepId.get("inner") ?? [], answerInputNames),
      ),
    ).toEqual({ byInputName: { context: ["unknownStep"] }, stepProblems: [] });
  });

  it("keeps problems about the step as a whole, or an input it doesn't show, apart", () => {
    const { problemsByStepId } = createFlowEditor(
      flowWith([
        actionStep("filter", {
          actionDefinitionId: "filterList",
          inputs: {
            condition: { kind: "flow-input", inputName: "missing" },
            extra: { kind: "flow-input", inputName: "missing" },
          },
          runAfter: [{ stepId: "gone" }],
        }),
      ]),
    ).getState();

    expect(
      codesByInput(
        getFieldProblems(problemsByStepId.get("filter") ?? [], [
          "items",
          "condition",
        ]),
      ),
    ).toEqual({
      byInputName: {
        /* The action's own check, which wants a fixed condition for now, reports on the field too. */
        condition: ["unknownFlowInput", "invalidInput"],
        items: ["missingInput"],
      },
      stepProblems: ["unknownInput", "unknownStep"],
    });
  });

  it("tells where in an input's source its problem is, e.g. at a query's limit", () => {
    const { problemsByStepId } = createFlowEditor(
      flowWith([
        actionStep("find", {
          inputs: {
            query: {
              kind: "constant",
              payload: {
                kind: "EntityQuery",
                value: { filter: { all: [] }, limit: 0 },
              },
            },
          },
        }),
      ]),
    ).getState();

    const { byInputName } = getFieldProblems(
      problemsByStepId.get("find") ?? [],
      ["query"],
    );

    expect(byInputName.get("query")?.map(getPathInSource)).toEqual([
      ["payload", "value", "limit"],
    ]);
  });
});
