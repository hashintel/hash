import { describe, expect, it } from "vitest";

import { createFlowEditor } from "@local/hash-isomorphic-utils/flows/flow-editor";

import { actionStep, flowWith } from "../../shared/step-fixtures";
import {
  getFlowInputValues,
  getFormValuesFromRun,
  getInitialFormValues,
  getRunBlocker,
} from "./run-form";

import type { EntityId } from "@blockprotocol/type-system";
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
    const durationInput: FlowInputDefinition = {
      name: "window",
      label: "Window",
      payloadKind: "Duration",
      array: false,
      required: true,
    };

    expect(blockerOf(draftFlow([durationInput]))).toBe(
      "“Window” takes a duration, which can't be given here yet",
    );
    expect(
      blockerOf(draftFlow([{ ...durationInput, required: false }])),
    ).toBeNull();
  });

  it("lets a flow with a required entity or entity list run", () => {
    expect(
      blockerOf(
        draftFlow([
          {
            name: "customer",
            payloadKind: "EntityId",
            array: false,
            required: true,
          },
          {
            name: "customers",
            payloadKind: "EntityId",
            array: true,
            required: true,
          },
        ]),
      ),
    ).toBeNull();
  });

  it("stops a flow with a required list of a kind the form takes one of", () => {
    expect(
      blockerOf(
        draftFlow([
          { name: "topics", payloadKind: "Text", array: true, required: true },
        ]),
      ),
    ).toBe("“Topics” takes a list of text, which can't be given here yet");
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
    { name: "entities", payloadKind: "EntityId", array: true, required: false },
    { name: "tags", payloadKind: "Text", array: true, required: false },
  ];

  const acme =
    "f3c9a1d2-0b7e-4c55-9f0e-6a1b2c3d4e5f~1d4c8e2a-7b3f-4a61-8c9d-0e5f6a7b8c9d" as EntityId;
  const globex =
    "f3c9a1d2-0b7e-4c55-9f0e-6a1b2c3d4e5f~9a8b7c6d-5e4f-4321-8765-4321fedcba98" as EntityId;

  it("starts with a value for each input the form takes", () => {
    expect(getInitialFormValues(inputs)).toEqual({
      count: { kind: "Number", value: null },
      notify: { kind: "Boolean", value: false },
      subject: { kind: "Text", value: "" },
      note: { kind: "Text", value: "" },
      due: { kind: "Date", value: "" },
      entity: { kind: "EntityId", array: false, value: null },
      entities: { kind: "EntityId", array: true, value: [] },
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

  it("gives an entity's ID, and a list's IDs in the order they were picked", () => {
    expect(
      getFlowInputValues(inputs, {
        ...getInitialFormValues(inputs),
        entity: { kind: "EntityId", array: false, value: acme },
        entities: { kind: "EntityId", array: true, value: [globex, acme] },
      }).flowInputs,
    ).toEqual({
      notify: { kind: "Boolean", value: false },
      entity: { kind: "EntityId", value: acme },
      entities: { kind: "EntityId", value: [globex, acme] },
    });
  });

  it("names the required inputs left blank", () => {
    expect(getFlowInputValues(inputs, getInitialFormValues(inputs))).toEqual({
      flowInputs: { notify: { kind: "Boolean", value: false } },
      missingInputNames: ["count", "subject"],
    });
  });

  it("names a required entity, or a required entity list, left empty", () => {
    const entityInputs: FlowInputDefinition[] = [
      { name: "entity", payloadKind: "EntityId", array: false, required: true },
      {
        name: "entities",
        payloadKind: "EntityId",
        array: true,
        required: true,
      },
    ];

    expect(
      getFlowInputValues(entityInputs, getInitialFormValues(entityInputs)),
    ).toEqual({ flowInputs: {}, missingInputNames: ["entity", "entities"] });
  });
});

describe("getFormValuesFromRun", () => {
  it("fills in the run's values for the inputs that still take them, and names the ones that changed", () => {
    expect(
      getFormValuesFromRun(
        [
          {
            name: "count",
            payloadKind: "Number",
            array: false,
            required: true,
          },
          /* Took a number when the flow ran. */
          { name: "limit", payloadKind: "Text", array: false, required: false },
          /* Took one topic when the flow ran. */
          { name: "topics", payloadKind: "Text", array: true, required: false },
          /* Unchanged, but the form can't take it. */
          {
            name: "when",
            payloadKind: "DateTime",
            array: false,
            required: false,
          },
          /* Added since the run. */
          { name: "due", payloadKind: "Date", array: false, required: false },
        ],
        {
          count: { kind: "Number", value: 0 },
          /* Removed since the run. */
          region: { kind: "Text", value: "EU" },
          limit: { kind: "Number", value: 5 },
          topics: { kind: "Text", value: "AI" },
          when: { kind: "DateTime", value: "2026-11-01T10:00:00Z" },
        },
      ),
    ).toEqual({
      values: {
        count: { kind: "Number", value: 0 },
        limit: { kind: "Text", value: "" },
        due: { kind: "Date", value: "" },
      },
      changedInputLabels: ["Region", "Limit", "Topics"],
    });
  });

  it("fills in the run's entity and list of entities, and names an entity input that changed between one and a list", () => {
    const acme =
      "f3c9a1d2-0b7e-4c55-9f0e-6a1b2c3d4e5f~1d4c8e2a-7b3f-4a61-8c9d-0e5f6a7b8c9d" as EntityId;
    const globex =
      "f3c9a1d2-0b7e-4c55-9f0e-6a1b2c3d4e5f~9a8b7c6d-5e4f-4321-8765-4321fedcba98" as EntityId;

    expect(
      getFormValuesFromRun(
        [
          {
            name: "entity",
            payloadKind: "EntityId",
            array: false,
            required: true,
          },
          {
            name: "entities",
            payloadKind: "EntityId",
            array: true,
            required: false,
          },
          /* Took one entity when the flow ran. */
          {
            name: "owners",
            payloadKind: "EntityId",
            array: true,
            required: false,
          },
        ],
        {
          entity: { kind: "EntityId", value: acme },
          entities: { kind: "EntityId", value: [globex, acme] },
          owners: { kind: "EntityId", value: globex },
        },
      ),
    ).toEqual({
      values: {
        entity: { kind: "EntityId", array: false, value: acme },
        entities: { kind: "EntityId", array: true, value: [globex, acme] },
        owners: { kind: "EntityId", array: true, value: [] },
      },
      changedInputLabels: ["Owners"],
    });
  });
});
