import { describe, expect, test } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";

import { hashProcessEditorId } from "../hash/petrinaut-tools";
import { readRecordedCall, recordedCanonicalCallsOf } from "./recorded-calls";

const editor = { editor_id: hashProcessEditorId };

/** A net of its own, as the tools that define one take it. */
const desk = {
  id: "desk",
  name: "Desk",
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

/** An instance as it was recorded: its component under `subnetId`. */
const deskInstance = {
  id: "desk-1",
  name: "Desk1",
  subnetId: "desk",
  parameterValues: {},
  x: 0,
  y: 0,
};

describe("a call recorded under a tool named after the subnet", () => {
  test("is read as today's tool for a component, in its keys", () => {
    expect(
      readRecordedCall("petrinaut_update_subnet", {
        ...editor,
        subnetId: "desk",
        update: { name: "Front desk" },
      }),
    ).toEqual({
      toolName: "petrinaut_update_component",
      input: { ...editor, componentId: "desk", update: { name: "Front desk" } },
    });
    expect(readRecordedCall("removeSubnet", { subnetId: "desk" })).toEqual({
      toolName: "removeComponent",
      input: { componentId: "desk" },
    });
  });

  test("makes the canonical calls of that tool, the instances it holds read as a document's are", () => {
    expect(
      recordedCanonicalCallsOf("petrinaut_create_subnet", {
        ...editor,
        ...desk,
        id: "hall",
        componentInstances: [deskInstance],
      }),
    ).toMatchObject([
      {
        toolName: "addComponent",
        input: {
          id: toPetrinautId("hall"),
          componentInstances: [{ component: { id: toPetrinautId("desk") } }],
        },
      },
    ]);
    expect(
      recordedCanonicalCallsOf("petrinaut_remove_subnet", {
        ...editor,
        subnetId: "desk",
      }),
    ).toEqual([
      {
        toolName: "removeComponent",
        input: { componentId: toPetrinautId("desk") },
      },
    ]);
  });
});

describe("a call recorded under a name that passed from the instance tool to the component tool", () => {
  test("is read as today's tool when its input fits it", () => {
    const input = {
      ...editor,
      componentId: "desk",
      update: { name: "Front desk" },
    };

    expect(readRecordedCall("petrinaut_update_component", input)).toEqual({
      toolName: "petrinaut_update_component",
      input,
    });
    expect(
      readRecordedCall("petrinaut_create_component", { ...editor, ...desk })
        .toolName,
    ).toBe("petrinaut_create_component");
  });

  test("is read as the instance tool it was when its input fits that, its keys converted", () => {
    expect(
      readRecordedCall("petrinaut_create_component", {
        ...editor,
        ...deskInstance,
        targetSubnetId: "hall",
      }),
    ).toEqual({
      toolName: "petrinaut_create_component_instance",
      input: {
        ...editor,
        id: "desk-1",
        name: "Desk1",
        component: { id: "desk" },
        parameterValues: {},
        x: 0,
        y: 0,
        targetComponentId: "hall",
      },
    });
    expect(
      recordedCanonicalCallsOf("petrinaut_update_component", {
        ...editor,
        instanceId: "desk-1",
        update: { subnetId: "desk" },
        position: { x: 10, y: 20 },
        targetSubnetId: "hall",
      }),
    ).toEqual([
      {
        toolName: "updateComponentInstance",
        input: {
          instanceId: toPetrinautId("desk-1"),
          update: { component: { id: toPetrinautId("desk") } },
          targetComponentId: toPetrinautId("hall"),
        },
      },
      {
        toolName: "updateComponentInstancePosition",
        input: {
          instanceId: toPetrinautId("desk-1"),
          position: { x: 10, y: 20 },
          targetComponentId: toPetrinautId("hall"),
        },
      },
    ]);
    expect(
      readRecordedCall("petrinaut_remove_component", {
        ...editor,
        instanceId: "desk-1",
      }).toolName,
    ).toBe("petrinaut_remove_component_instance");
  });

  test("makes no canonical call when its input fits neither, and does not throw", () => {
    const input = { ...editor, instanceId: "desk-1", moved: true };

    expect(readRecordedCall("petrinaut_update_component", input)).toEqual({
      toolName: "petrinaut_update_component",
      input,
    });
    expect(
      recordedCanonicalCallsOf("petrinaut_update_component", input),
    ).toEqual([]);
  });
});

describe("a call recorded under a name that has not changed", () => {
  test("has `targetSubnetId` read as `targetComponentId`", () => {
    expect(
      recordedCanonicalCallsOf("petrinaut_remove_place", {
        ...editor,
        placeId: "triage",
        targetSubnetId: "hall",
      }),
    ).toEqual([
      {
        toolName: "removePlace",
        input: {
          placeId: toPetrinautId("triage"),
          targetComponentId: toPetrinautId("hall"),
        },
      },
    ]);
    expect(
      readRecordedCall("addComponentInstance", {
        ...deskInstance,
        targetSubnetId: null,
      }).input,
    ).toEqual({
      id: "desk-1",
      name: "Desk1",
      component: { id: "desk" },
      parameterValues: {},
      x: 0,
      y: 0,
      targetComponentId: null,
    });
  });

  test("is returned as it is when it is in today's keys", () => {
    const input = { ...editor, placeId: "triage", targetComponentId: "hall" };

    expect(readRecordedCall("petrinaut_remove_place", input).input).toBe(input);
    expect(readRecordedCall("ledger_commit", undefined)).toEqual({
      toolName: "ledger_commit",
      input: undefined,
    });
  });

  test("makes no canonical call when its tool does not take its input, and does not throw", () => {
    expect(
      recordedCanonicalCallsOf("petrinaut_remove_place", {
        ...editor,
        place: "triage",
      }),
    ).toEqual([]);
  });
});
