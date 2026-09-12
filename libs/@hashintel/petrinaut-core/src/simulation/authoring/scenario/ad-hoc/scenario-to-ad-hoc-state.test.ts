import { describe, expect, it } from "vitest";

import {
  cafeQueue,
  deploymentPipelineSDCPN,
  dronePatrol,
  probabilisticSatellitesSDCPN,
  productionMachines,
  sirModel,
  supplyChainProfit,
  supplyChainWithDisruption,
  vaccinationCampaign,
} from "../../../../examples/index";
import { lowerScenarioToHir } from "../../../../hir/scenario";
import { compileScenario } from "../compile-scenario";
import {
  adHocExposedParameterIdentifier,
  synthesizeAdHocScenario,
} from "./ad-hoc-scenario";
import { adHocStateFromScenario } from "./scenario-to-ad-hoc-state";

import type {
  AdHocScenarioState,
  Color,
  Parameter,
  Place,
  Scenario,
  SDCPN,
} from "../../../../types/sdcpn";
import type { AdHocSynthesisContext } from "./ad-hoc-scenario";

const place = (id: string, name: string, colorId: string | null): Place => ({
  id,
  name,
  colorId,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

const SATELLITE: Color = {
  id: "colour-satellite",
  name: "Satellite",
  iconSlug: "circle",
  displayColor: "#3676b8",
  elements: [
    { elementId: "e1", name: "altitude", type: "real" },
    { elementId: "e2", name: "active", type: "boolean" },
    { elementId: "e3", name: "label", type: "string" },
    { elementId: "e4", name: "tag", type: "uuid" },
  ],
};

const netParameter = (id: string, variableName: string): Parameter => ({
  id,
  name: variableName,
  variableName,
  type: "real",
  defaultValue: "1",
});

const CONTEXT: AdHocSynthesisContext = {
  netParameters: [
    netParameter("param-gravity", "gravity"),
    netParameter("param-drag", "drag"),
  ],
  places: [
    place("place-space", "Space", "colour-satellite"),
    place("place-debris", "Debris", null),
    place("place-orphan", "Orphan", "colour-missing"),
  ],
  types: [SATELLITE],
};

const scenario = (initialState: Scenario["initialState"]): Scenario => ({
  id: "scenario-moon",
  name: "Moon Orbit",
  scenarioParameters: [
    { type: "real", identifier: "launch_rate", default: 0.3 },
    { type: "integer", identifier: "satellites", default: 20 },
    { type: "boolean", identifier: "night_mode", default: 0 },
    { type: "boolean", identifier: "day_mode", default: 1 },
    { type: "ratio", identifier: "mix", default: 0.5 },
  ],
  parameterOverrides: { "param-gravity": "9.81", "param-drag": "" },
  initialState,
});

const EXPECTED_VARIABLES = [
  { name: "launch_rate", type: "real", expression: "0.3" },
  { name: "satellites", type: "integer", expression: "20" },
  { name: "night_mode", type: "boolean", expression: "false" },
  { name: "day_mode", type: "boolean", expression: "true" },
  { name: "mix", type: "ratio", expression: "0.5" },
].map((variable) => ({ ...variable, exposed: true, optimize: null }));

const EXPECTED_NET_PARAMETERS = [
  { parameterId: "param-gravity", expression: "9.81", optimize: null },
  { parameterId: "param-drag", expression: "", optimize: null },
];

describe("adHocStateFromScenario", () => {
  const gravityOverride = {
    parameterId: "param-gravity",
    expression: "9.81",
    optimize: null,
  };
  const goneOverride = {
    parameterId: "param-gone",
    expression: "3",
    optimize: null,
  };
  const stored: AdHocScenarioState = {
    variables: [
      {
        name: "boost",
        type: "real",
        expression: "1.5",
        exposed: true,
        optimize: null,
      },
    ],
    netParameters: [gravityOverride, goneOverride],
    places: {
      "place-debris": {
        kind: "uncoloured",
        count: { expression: "scenario.satellites * 2", optimize: null },
      },
    },
  };

  it("returns an adhoc scenario's stored definition", () => {
    const result = adHocStateFromScenario(
      scenario({
        type: "adhoc",
        content: { ...stored, netParameters: [gravityOverride] },
      }),
      CONTEXT,
    );
    expect(result.kind).toBe("adhoc");
    expect(result.state).toEqual({
      ...stored,
      netParameters: [gravityOverride],
    });
  });

  it("drops a stale override from an adhoc scenario's stored definition", () => {
    const result = adHocStateFromScenario(
      scenario({ type: "adhoc", content: stored }),
      CONTEXT,
    );
    expect(result.state.netParameters).toEqual([gravityOverride]);
    expect(result.state.variables).toEqual(stored.variables);
    expect(result.state.places).toEqual(stored.places);
  });

  it("drops a stale place from an adhoc scenario's stored definition", () => {
    const content: AdHocScenarioState = {
      ...stored,
      netParameters: [gravityOverride],
      places: {
        ...stored.places,
        "place-gone": {
          kind: "uncoloured",
          count: { expression: "1", optimize: null },
        },
      },
    };
    expect(synthesizeAdHocScenario(content, CONTEXT).ok).toBe(false);

    const result = adHocStateFromScenario(
      scenario({ type: "adhoc", content }),
      CONTEXT,
    );

    expect(result.state.places).toEqual(stored.places);
    expect(synthesizeAdHocScenario(result.state, CONTEXT).ok).toBe(true);
  });

  it("drops every adhoc override when the context carries no net parameters", () => {
    const result = adHocStateFromScenario(
      scenario({ type: "adhoc", content: stored }),
      { ...CONTEXT, netParameters: [] },
    );
    expect(result.state.netParameters).toEqual([]);
    expect(result.state.variables).toEqual(stored.variables);
    expect(result.state.places).toEqual(stored.places);
  });

  it("returns a code scenario's body verbatim with Variables and Parameters only", () => {
    const result = adHocStateFromScenario(
      scenario({ type: "code", content: "return { Debris: 4 };" }),
      CONTEXT,
    );
    expect(result).toEqual({
      kind: "code",
      code: "return { Debris: 4 };",
      state: {
        variables: EXPECTED_VARIABLES,
        netParameters: EXPECTED_NET_PARAMETERS,
        places: {},
      },
    });
  });

  it("converts a per_place scenario's parameters, overrides and places", () => {
    const result = adHocStateFromScenario(
      scenario({
        type: "per_place",
        content: {
          "place-debris": "scenario.satellites + 1",
          "place-space": [
            [400, true, "alpha", "0f9c5b2e-8c1a-4d6e-9b3f-2a7c1d4e5f60"],
            [550.5],
          ],
        },
      }),
      CONTEXT,
    );
    expect(result.kind).toBe("per_place");
    expect(result.state.variables).toEqual(EXPECTED_VARIABLES);
    expect(result.state.netParameters).toEqual(EXPECTED_NET_PARAMETERS);
    expect(result.state.places).toEqual({
      "place-debris": {
        kind: "uncoloured",
        count: { expression: "scenario.satellites + 1", optimize: null },
      },
      "place-space": {
        kind: "coloured",
        variables: [],
        sharedColumns: {},
        rows: [
          {
            kind: "fixed",
            cells: [
              { expression: "400", optimize: null },
              { expression: "true", optimize: null },
              { expression: '"alpha"', optimize: null },
              {
                expression: '"0f9c5b2e-8c1a-4d6e-9b3f-2a7c1d4e5f60"',
                optimize: null,
              },
            ],
          },
          {
            kind: "fixed",
            cells: [
              { expression: "550.5", optimize: null },
              { expression: "false", optimize: null },
              { expression: '""', optimize: null },
              {
                expression: '"00000000-0000-0000-0000-000000000000"',
                optimize: null,
              },
            ],
          },
        ],
      },
    });
  });

  it("drops an override for a parameter the net does not know", () => {
    const result = adHocStateFromScenario(
      {
        ...scenario({ type: "per_place", content: {} }),
        parameterOverrides: {
          "param-gravity": "9.81",
          "param-gone": "3",
          "param-drag": "",
        },
      },
      CONTEXT,
    );
    expect(result.state.netParameters).toEqual(EXPECTED_NET_PARAMETERS);
  });

  it("drops every override when the context carries no net parameters", () => {
    const result = adHocStateFromScenario(
      scenario({ type: "code", content: "return {};" }),
      { ...CONTEXT, netParameters: [] },
    );
    expect(result.state.netParameters).toEqual([]);
    expect(result.state.variables).toEqual(EXPECTED_VARIABLES);
  });

  it("keeps an empty uncoloured expression empty", () => {
    const result = adHocStateFromScenario(
      scenario({ type: "per_place", content: { "place-debris": "" } }),
      CONTEXT,
    );
    expect(result.state.places).toEqual({
      "place-debris": {
        kind: "uncoloured",
        count: { expression: "", optimize: null },
      },
    });
  });

  it("drops places the net does not know and coloured places without a colour", () => {
    const result = adHocStateFromScenario(
      scenario({
        type: "per_place",
        content: {
          "place-unknown": "3",
          "place-orphan": [[1, true]],
          "place-debris": "2",
        },
      }),
      CONTEXT,
    );
    expect(Object.keys(result.state.places)).toEqual(["place-debris"]);
  });
});

// -- Core examples ---------------------------------------------------------------

type Example = { title: string; petriNetDefinition: SDCPN };

const EXAMPLES: Example[] = [
  cafeQueue,
  deploymentPipelineSDCPN,
  dronePatrol,
  probabilisticSatellitesSDCPN,
  productionMachines,
  sirModel,
  supplyChainProfit,
  supplyChainWithDisruption,
  vaccinationCampaign,
];

const exampleScenarios = (
  type: Scenario["initialState"]["type"],
): [string, Scenario, SDCPN][] =>
  EXAMPLES.flatMap((example) =>
    (example.petriNetDefinition.scenarios ?? [])
      .filter((candidate) => candidate.initialState.type === type)
      .map((candidate): [string, Scenario, SDCPN] => [
        `${example.title} / ${candidate.name}`,
        candidate,
        example.petriNetDefinition,
      ]),
  );

const synthesisContext = (net: SDCPN): AdHocSynthesisContext => ({
  netParameters: net.parameters,
  places: net.places,
  types: net.types,
});

const compileOriginal = (candidate: Scenario, net: SDCPN) => {
  const result = compileScenario(
    candidate,
    lowerScenarioToHir(candidate),
    net.parameters,
    net.places,
    net.types,
  );
  if (!result.ok) {
    throw new Error(JSON.stringify(result.errors));
  }
  return result.result;
};

const synthesizeConverted = (candidate: Scenario, net: SDCPN): Scenario => {
  const context = synthesisContext(net);
  const converted = adHocStateFromScenario(candidate, context);
  const outcome = synthesizeAdHocScenario(converted.state, context);
  if (!outcome.ok) {
    throw new Error(JSON.stringify(outcome.errors));
  }
  return outcome.scenario;
};

const compileConverted = (candidate: Scenario, net: SDCPN) => {
  const context = synthesisContext(net);
  const synthesized = synthesizeConverted(candidate, net);
  const result = compileScenario(
    synthesized,
    lowerScenarioToHir(synthesized, { adHocContext: context }),
    net.parameters,
    net.places,
    net.types,
  );
  if (!result.ok) {
    throw new Error(JSON.stringify(result.errors));
  }
  return result.result;
};

describe("adHocStateFromScenario over the core examples", () => {
  it("covers every stored kind the examples ship", () => {
    expect(exampleScenarios("per_place")).toHaveLength(22);
    expect(exampleScenarios("code")).toHaveLength(2);
    expect(exampleScenarios("adhoc")).toHaveLength(0);
  });

  it.each([...exampleScenarios("per_place"), ...exampleScenarios("code")])(
    "%s keeps every scenario parameter identifier verbatim",
    (_title, candidate, net) => {
      const converted = adHocStateFromScenario(
        candidate,
        synthesisContext(net),
      );
      const identifiers = candidate.scenarioParameters.map(
        (parameter) => parameter.identifier,
      );
      expect(
        converted.state.variables.map((variable) => variable.name),
      ).toEqual(identifiers);
      for (const identifier of identifiers) {
        expect(adHocExposedParameterIdentifier(identifier)).toBe(identifier);
      }
    },
  );

  it.each(exampleScenarios("per_place"))(
    "%s compiles to the same initial state and parameter values once converted",
    (_title, candidate, net) => {
      const converted = adHocStateFromScenario(
        candidate,
        synthesisContext(net),
      );
      expect(converted.kind).toBe("per_place");
      const original = compileOriginal(candidate, net);
      const viaForm = compileConverted(candidate, net);
      expect(viaForm.initialState).toEqual(original.initialState);
      expect(viaForm.parameterValues).toEqual(original.parameterValues);
    },
  );

  it.each(exampleScenarios("code"))(
    "%s keeps its code body and synthesizes the same parameters and overrides",
    (_title, candidate, net) => {
      const converted = adHocStateFromScenario(
        candidate,
        synthesisContext(net),
      );
      expect(converted.kind).toBe("code");
      if (converted.kind !== "code") {
        return;
      }
      expect(converted.code).toBe(candidate.initialState.content);
      expect(converted.state.places).toEqual({});
      const synthesized = synthesizeConverted(candidate, net);
      expect(synthesized.scenarioParameters).toEqual(
        candidate.scenarioParameters,
      );
      expect(synthesized.parameterOverrides).toEqual(
        candidate.parameterOverrides,
      );
    },
  );
});
