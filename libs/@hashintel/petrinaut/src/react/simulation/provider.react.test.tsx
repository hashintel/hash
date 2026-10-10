/**
 * @vitest-environment jsdom
 */
import {
  act,
  render,
  waitFor,
  type RenderResult,
} from "@testing-library/react";
import { use } from "react";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  type Scenario,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { PetrinautNavigationProvider } from "../navigation";
import { SDCPNContext, type SDCPNContextValue } from "../state/sdcpn-context";
import { SimulationContext, type SimulationContextValue } from "./context";
import { SimulationProvider } from "./provider";

const makeScenario = (
  id: string,
  name: string,
  defaultRate: number,
): Scenario => ({
  id,
  name,
  scenarioParameters: [
    { type: "real", identifier: "rate", default: defaultRate },
  ],
  parameterOverrides: {},
  initialState: { type: "per_place", content: {} },
});

const makeSdcpn = (scenarios: Scenario[]): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  subnets: [],
  componentInstances: [],
  scenarios,
});

const makeSdcpnContextValue = (scenarios: Scenario[]): SDCPNContextValue => ({
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: "test-net",
  petriNetDefinition: makeSdcpn(scenarios),
  readonly: false,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  setTitle: () => {},
  title: "Test",
  getItemType: () => null,
});

const SimulationContextConsumer = ({
  onContextValue,
}: {
  onContextValue: (value: SimulationContextValue) => void;
}) => {
  onContextValue(use(SimulationContext));
  return null;
};

const TestWrapper = ({
  scenarios,
  onContextValue,
}: {
  scenarios: Scenario[];
  onContextValue: (value: SimulationContextValue) => void;
}) => (
  <SDCPNContext.Provider value={makeSdcpnContextValue(scenarios)}>
    <PetrinautNavigationProvider>
      <SimulationProvider>
        <SimulationContextConsumer onContextValue={onContextValue} />
      </SimulationProvider>
    </PetrinautNavigationProvider>
  </SDCPNContext.Provider>
);

function renderSimulationProvider(scenarios: Scenario[]): {
  getValue: () => SimulationContextValue;
  rerender: (nextScenarios: Scenario[]) => void;
  renderResult: RenderResult;
} {
  const valueHolder = { current: null as SimulationContextValue | null };
  const captureValue = (value: SimulationContextValue) => {
    valueHolder.current = value;
  };
  const renderResult = render(
    <TestWrapper scenarios={scenarios} onContextValue={captureValue} />,
  );

  return {
    getValue: () => valueHolder.current!,
    rerender: (nextScenarios) =>
      renderResult.rerender(
        <TestWrapper scenarios={nextScenarios} onContextValue={captureValue} />,
      ),
    renderResult,
  };
}

describe("SimulationProvider", () => {
  it("does not leak implicit first-scenario overrides after reorder and deletion", async () => {
    const firstScenario = makeScenario("scenario-a", "Scenario A", 1);
    const secondScenario = makeScenario("scenario-b", "Scenario B", 2);
    const { getValue, rerender, renderResult } = renderSimulationProvider([
      firstScenario,
      secondScenario,
    ]);

    try {
      expect(getValue().selectedScenarioId).toBe(firstScenario.id);

      act(() => {
        getValue().setScenarioParameterValue("rate", "99");
      });

      expect(getValue().scenarioParameterValues).toEqual({ rate: "99" });

      rerender([secondScenario, firstScenario]);

      expect(getValue().selectedScenarioId).toBe(firstScenario.id);
      expect(getValue().scenarioParameterValues).toEqual({ rate: "99" });

      rerender([secondScenario]);

      await waitFor(() => {
        expect(getValue().selectedScenarioId).toBe(secondScenario.id);
        expect(getValue().scenarioParameterValues).toEqual({ rate: "2" });
      });
    } finally {
      renderResult.unmount();
    }
  });
});
