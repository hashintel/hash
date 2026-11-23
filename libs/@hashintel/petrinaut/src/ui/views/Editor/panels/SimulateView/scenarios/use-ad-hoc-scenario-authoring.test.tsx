/**
 * @vitest-environment jsdom
 */
import { render } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";

import { SDCPNContext } from "../../../../../../react/document/sdcpn-context";
import { useAdHocScenarioAuthoring } from "./use-ad-hoc-scenario-authoring";

import type { SDCPNContextValue } from "../../../../../../react/document/sdcpn-context";
import type { UseAdHocScenarioAuthoringOptions } from "./use-ad-hoc-scenario-authoring";
import type {
  AdHocScenarioState,
  Scenario,
  SDCPN,
} from "@hashintel/petrinaut-core";

// Petrinaut ids, which the schema a scenario is saved through keeps as they are.
const queuePlaceId = "00000000-0000-4000-8000-000000000001";
const rateParameterId = "00000000-0000-4000-8000-000000000002";

const sdcpn: SDCPN = {
  places: [
    {
      id: queuePlaceId,
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  parameters: [
    {
      id: rateParameterId,
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1.5",
    },
  ],
  differentialEquations: [],
};

const sdcpnContextValue: SDCPNContextValue = {
  petriNetId: "test-net",
  petriNetDefinition: sdcpn,
  readonly: false,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
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
      parameterId: rateParameterId,
      expression: "scenario.baseLoad / 2",
      optimize: null,
    },
  ],
  places: {
    [queuePlaceId]: {
      kind: "uncoloured",
      count: { expression: "scenario.baseLoad", optimize: null },
    },
  },
};

const Harness = ({
  options,
  onValue,
}: {
  options: UseAdHocScenarioAuthoringOptions;
  onValue: (value: ReturnType<typeof useAdHocScenarioAuthoring>) => void;
}) => {
  onValue(useAdHocScenarioAuthoring(options));
  return null;
};

const scenarioNamed = (name: string): Scenario => ({
  id: name,
  name,
  scenarioParameters: [],
  parameterOverrides: {},
  initialState: { type: "per_place", content: {} },
});

function renderAuthoring(
  otherScenarioNames: string[] = [],
  code?: UseAdHocScenarioAuthoringOptions["code"],
) {
  const holder: {
    current: ReturnType<typeof useAdHocScenarioAuthoring> | null;
  } = { current: null };
  const capture = (value: ReturnType<typeof useAdHocScenarioAuthoring>) => {
    holder.current = value;
  };
  render(
    <SDCPNContext
      value={{
        ...sdcpnContextValue,
        petriNetDefinition: {
          ...sdcpn,
          scenarios: otherScenarioNames.map(scenarioNamed),
        },
      }}
    >
      <Harness options={{ code }} onValue={capture} />
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
    const scenario = authoring.current.scenarioToSave("scenario-1");
    expect(scenario).not.toBeNull();
    // The exposed Variable became the scenario's one tunable parameter.
    expect(scenario!.scenarioParameters).toEqual([
      { type: "integer", identifier: "base_load", default: 6 },
    ]);
    // The override survived, rewritten to read the exposed parameter.
    expect(scenario!.parameterOverrides[rateParameterId]).toContain(
      "base_load",
    );
    expect(scenario!.initialState).toEqual({
      type: "adhoc",
      content: draftState,
    });
  });

  it("blocks saving on a duplicate name or broken state", () => {
    const authoring = renderAuthoring(["Morning rush"]);
    act(() => {
      authoring.current.setName("Morning rush");
      authoring.current.setState(draftState);
    });
    expect(authoring.current.canSave).toBe(false);
    expect(authoring.current.firstError).toContain("already exists");
    expect(authoring.current.scenarioToSave("scenario-1")).toBeNull();
  });

  it("keeps a code scenario's code verbatim and guards the parameters it reads", () => {
    const code = {
      body: "return { Queue: range(scenario.base_load).map(() => ({})) };",
      parameters: [
        { type: "integer" as const, identifier: "base_load", default: 6 },
      ],
    };
    const authoring = renderAuthoring([], code);
    act(() => {
      authoring.current.setName("Constellation");
      authoring.current.setState({ ...draftState, places: {} });
    });

    expect(authoring.current.code).toBe(code.body);
    expect(authoring.current.canSave).toBe(true);
    const scenario = authoring.current.scenarioToSave("scenario-1");
    expect(scenario?.initialState).toEqual({
      type: "code",
      content: code.body,
    });
    expect(scenario?.scenarioParameters).toEqual([
      { type: "integer", identifier: "base_load", default: 6 },
    ]);

    // Renaming the exposed Variable the code reads leaves `scenario.base_load`
    // dangling, so saving is refused until it is exposed again by that name.
    act(() => {
      authoring.current.setState({
        ...draftState,
        places: {},
        variables: [{ ...draftState.variables[0]!, name: "load" }],
      });
    });
    expect(authoring.current.canSave).toBe(false);
    expect(authoring.current.firstError).toBe(
      'Variable "base_load" is read by the scenario\'s code as scenario.base_load; keep it exposed with that name and type.',
    );
    expect(authoring.current.scenarioToSave("scenario-1")).toBeNull();
  });

  it("refuses to save a code scenario with a Variable that is not exposed", () => {
    const code = {
      body: "return { Queue: range(scenario.base_load).map(() => ({})) };",
      parameters: [
        { type: "integer" as const, identifier: "base_load", default: 6 },
      ],
    };
    const authoring = renderAuthoring([], code);
    act(() => {
      authoring.current.setName("Constellation");
      authoring.current.setState({
        ...draftState,
        places: {},
        variables: [
          ...draftState.variables,
          {
            name: "spare",
            type: "integer",
            expression: "2",
            optimize: null,
            exposed: false,
          },
        ],
      });
    });

    // A code scenario stores no form state, so an unexposed Variable would
    // be inlined into the overrides and lost on the next open.
    expect(authoring.current.canSave).toBe(false);
    expect(authoring.current.firstError).toBe(
      'Variable "spare" cannot be kept with code-defined initial state; turn Scenario Parameter on or delete it.',
    );
    expect(authoring.current.scenarioToSave("scenario-1")).toBeNull();

    act(() => {
      authoring.current.setState({
        ...draftState,
        places: {},
        variables: [
          ...draftState.variables,
          {
            name: "spare",
            type: "integer",
            expression: "2",
            optimize: null,
            exposed: true,
          },
        ],
      });
    });
    expect(authoring.current.canSave).toBe(true);
    expect(
      authoring.current.scenarioToSave("scenario-1")?.scenarioParameters,
    ).toEqual([
      { type: "integer", identifier: "base_load", default: 6 },
      { type: "integer", identifier: "spare", default: 2 },
    ]);
  });
});
