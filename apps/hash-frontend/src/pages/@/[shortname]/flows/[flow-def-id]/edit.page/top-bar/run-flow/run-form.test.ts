import { describe, expect, it } from "vitest";

import { createFlowEditor } from "@local/hash-isomorphic-utils/flows/flow-editor";

import { actionStep, flowWith } from "../../shared/step-fixtures";
import {
  getFlowInputValues,
  getInitialFormValues,
  getRunBlocker,
} from "./run-form";

import type {
  FlowDefinition,
  FlowInputDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

const instructionsInput: FlowInputDefinition = {
  name: "instructions",
  payloadKind: "Text",
  array: false,
  required: true,
};

const draftStep = actionStep("draft", {
  actionDefinitionId: "draftMessage",
  inputs: { instructions: { kind: "flow-input", inputName: "instructions" } },
});

/** A valid flow that drafts a message from its instructions. Any other input goes unused, which is only a warning. */
const draftFlow = (
  otherInputs: FlowInputDefinition[] = [],
): FlowDefinition<string> => ({
  ...flowWith([draftStep]),
  inputs: [instructionsInput, ...otherInputs],
});

const blockerOf = (flowDefinition: FlowDefinition<string>) =>
  getRunBlocker(createFlowEditor(flowDefinition).getState());

describe("getRunBlocker", () => {
  it("lets a valid flow run, even with warnings", () => {
    expect(
      blockerOf(
        draftFlow([
          {
            name: "unused",
            payloadKind: "Text",
            array: false,
            required: false,
          },
        ]),
      ),
    ).toBeNull();
  });

  it("names the flow's first error", () => {
    expect(
      blockerOf(flowWith([actionStep("draft", { ...draftStep, inputs: {} })])),
    ).toBe(
      `Fix this flow's problems to run it: Required input "instructions" of action "draftMessage" is not connected`,
    );
  });

  it("stops a flow with no steps", () => {
    expect(blockerOf(flowWith([]))).toBe("Add a step to run this flow");
  });

  it("stops a flow with a required input the form can't take, but not an optional one", () => {
    const entitiesInput: FlowInputDefinition = {
      name: "entities",
      label: "Customers",
      payloadKind: "EntityId",
      array: true,
      required: true,
    };

    expect(blockerOf(draftFlow([entitiesInput]))).toBe(
      "“Customers” takes an entity list, which can't be given here yet",
    );
    expect(
      blockerOf(draftFlow([{ ...entitiesInput, required: false }])),
    ).toBeNull();
  });

  it("stops a flow with a required list of a kind the form takes one of", () => {
    expect(
      blockerOf(
        draftFlow([
          { name: "topics", payloadKind: "Text", array: true, required: true },
        ]),
      ),
    ).toBe("“Topics” takes a text list, which can't be given here yet");
  });
});

describe("getFlowInputValues", () => {
  const inputs: FlowInputDefinition[] = [
    { name: "count", payloadKind: "Number", array: false, required: true },
    { name: "notify", payloadKind: "Boolean", array: false, required: true },
    { name: "subject", payloadKind: "Text", array: false, required: true },
    { name: "note", payloadKind: "Text", array: false, required: false },
    { name: "due", payloadKind: "Date", array: false, required: false },
    { name: "entity", payloadKind: "EntityId", array: false, required: false },
  ];

  it("starts with a value for each input the form takes", () => {
    expect(getInitialFormValues(inputs)).toEqual({
      count: { kind: "Number", value: null },
      notify: { kind: "Boolean", value: false },
      subject: { kind: "Text", value: "" },
      note: { kind: "Text", value: "" },
      due: { kind: "Date", value: "" },
    });
  });

  it("gives zero and false, and leaves out what's blank", () => {
    expect(
      getFlowInputValues(inputs, {
        ...getInitialFormValues(inputs),
        count: { kind: "Number", value: 0 },
        subject: { kind: "Text", value: "Hello" },
        due: { kind: "Date", value: "2026-11-05" },
      }),
    ).toEqual({
      flowInputs: {
        count: { kind: "Number", value: 0 },
        notify: { kind: "Boolean", value: false },
        subject: { kind: "Text", value: "Hello" },
        due: { kind: "Date", value: "2026-11-05" },
      },
      missingInputNames: [],
    });
  });

  it("names the required inputs left blank", () => {
    expect(getFlowInputValues(inputs, getInitialFormValues(inputs))).toEqual({
      flowInputs: { notify: { kind: "Boolean", value: false } },
      missingInputNames: ["count", "subject"],
    });
  });
});
