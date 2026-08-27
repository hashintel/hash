/**
 * @vitest-environment jsdom
 */
import { render } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  scenarioSchema,
} from "@hashintel/petrinaut-core";

import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useAdHocScenarioAuthoring } from "./ad-hoc-scenario-authoring";

import type { SDCPNContextValue } from "../../../../../../react/state/sdcpn-context";
import type { AdHocScenarioState, SDCPN } from "@hashintel/petrinaut-core";

const sdcpn: SDCPN = {
  places: [
    {
      id: "place-queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  parameters: [
    {
      id: "param-rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1.5",
    },
  ],
  differentialEquations: [],
};

const sdcpnContextValue: SDCPNContextValue = {
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: "test-net",
  petriNetDefinition: sdcpn,
  readonly: false,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  setTitle: () => {},
  title: "Test",
  getItemType: () => null,
};

const draftState: AdHocScenarioState = {
  variables: [
    {
      name: "baseLoad",
      type: "integer",
      expression: "6",
      optimize: null,
      exposed: true,
    },
  ],
  netParameters: [
    {
      parameterId: "param-rate",
      expression: "scenario.baseLoad / 2",
      optimize: null,
    },
  ],
  places: {
    "place-queue": {
      kind: "uncoloured",
      count: { expression: "scenario.baseLoad", optimize: null },
    },
  },
};

const Harness = ({
  existingNames,
  onValue,
}: {
  existingNames: ReadonlySet<string>;
  onValue: (value: ReturnType<typeof useAdHocScenarioAuthoring>) => void;
}) => {
  onValue(useAdHocScenarioAuthoring({ existingScenarioNames: existingNames }));
  return null;
};

function renderAuthoring(existingNames: ReadonlySet<string> = new Set()) {
  const holder: {
    current: ReturnType<typeof useAdHocScenarioAuthoring> | null;
  } = { current: null };
  const capture = (value: ReturnType<typeof useAdHocScenarioAuthoring>) => {
    holder.current = value;
  };
  render(
    <SDCPNContext value={sdcpnContextValue}>
      <Harness existingNames={existingNames} onValue={capture} />
    </SDCPNContext>,
  );
  return holder as { current: ReturnType<typeof useAdHocScenarioAuthoring> };
}

describe("useAdHocScenarioAuthoring", () => {
  it("derives parameters and overrides, and persists the ad-hoc state", () => {
    const authoring = renderAuthoring();
    act(() => {
      authoring.current.setName("Morning rush");
      authoring.current.setState(draftState);
    });

    expect(authoring.current.canSave).toBe(true);
    const scenario = authoring.current.buildScenario("scenario-1");
    expect(scenario).not.toBeNull();
    // The exposed Variable became the scenario's one tunable parameter.
    expect(scenario!.scenarioParameters).toEqual([
      { type: "integer", identifier: "base_load", default: 6 },
    ]);
    // The override survived, rewritten to read the exposed parameter.
    expect(scenario!.parameterOverrides["param-rate"]).toContain("base_load");
    expect(scenario!.initialState).toEqual({
      type: "adhoc",
      content: draftState,
    });
    // The persisted shape passes the schema the save paths validate with.
    expect(scenarioSchema.safeParse(scenario).success).toBe(true);
  });

  it("blocks saving on a duplicate name or broken state", () => {
    const authoring = renderAuthoring(new Set(["Morning rush"]));
    act(() => {
      authoring.current.setName("Morning rush");
      authoring.current.setState(draftState);
    });
    expect(authoring.current.canSave).toBe(false);
    expect(authoring.current.firstError).toContain("already exists");
    expect(authoring.current.buildScenario("scenario-1")).toBeNull();
  });
});
