/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";

import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../../../../../../react/lsp/context";
import { SimulationContext } from "../../../../../../react/simulation/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { simulationSettingsSubView } from "./simulation-settings";

import type { SimulationContextValue } from "../../../../../../react/simulation/context";
import type { SDCPNContextValue } from "../../../../../../react/state/sdcpn-context";
import type { Scenario, SDCPN } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

// Monaco cannot run in jsdom; the expression editor becomes a plain textarea.
vi.mock("../../../../../monaco/code-editor", () => ({
  CodeEditor: ({
    onChange,
    value,
  }: {
    onChange: (value: string | undefined) => void;
    value?: string;
  }) => (
    <textarea
      aria-label="Expression"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();
  // The real Select is an Ark menu jsdom cannot drive; a native select with
  // the same items stands in for the scenario picker.
  const Select = ({
    items,
    onChange,
    value,
  }: {
    items: readonly { value: string; text: string }[];
    onChange: (value: string) => void;
    value: string;
  }) => (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.text}
        </option>
      ))}
    </select>
  );
  return { ...actual, Select };
});

// jsdom provides neither observer; the scroll fades and the value editor's
// popover construct both.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): never[] {
    return [];
  }
}
globalThis.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver =
  ObserverStub as unknown as typeof IntersectionObserver;

afterEach(cleanup);

const perPlaceScenario: Scenario = {
  id: "scenario-1",
  name: "Morning rush",
  scenarioParameters: [{ type: "real", identifier: "rate", default: 10 }],
  parameterOverrides: {},
  initialState: {
    type: "per_place",
    content: { "place-queue": "scenario.rate" },
  },
};

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
      name: "Arrival rate",
      variableName: "arrival_rate",
      type: "real",
      defaultValue: "1.5",
    },
  ],
  differentialEquations: [],
  scenarios: [perPlaceScenario],
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

const simulationContextValue: SimulationContextValue = {
  state: "NotRun",
  error: null,
  errorItemId: null,
  parameterValues: {},
  initialMarking: {},
  selectedScenarioId: null,
  scenarioParameterValues: {},
  compiledScenarioResult: null,
  scenarioCompilationErrors: null,
  adHocScenario: null,
  adHocNetParameters: sdcpn.parameters,
  dt: 0.01,
  maxTime: null,
  totalFrames: 0,
  getFrame: () => Promise.resolve(null),
  getAllFrames: () => Promise.resolve([]),
  getFramesInRange: () => Promise.resolve([]),
  setSelectedScenarioId: () => {},
  setAdHocScenario: () => {},
  setScenarioParameterValue: () => {},
  setInitialMarking: () => {},
  setParameterValue: () => {},
  setDt: () => {},
  setMaxTime: () => {},
  initialize: () => Promise.resolve(),
  run: () => {},
  pause: () => {},
  reset: () => {},
  setBackpressure: () => {},
  ack: () => {},
};

const SimulationSettings = simulationSettingsSubView.component;

const Providers = ({
  simulation,
  children,
}: {
  simulation: Partial<SimulationContextValue>;
  children: ReactNode;
}) => (
  <LanguageClientContext value={DEFAULT_LANGUAGE_CLIENT_CONTEXT}>
    <SDCPNContext value={sdcpnContextValue}>
      <SimulationContext value={{ ...simulationContextValue, ...simulation }}>
        {children}
      </SimulationContext>
    </SDCPNContext>
  </LanguageClientContext>
);

describe("SimulationSettings", () => {
  it("shows the scenario form with no scenario selected", () => {
    render(
      <Providers simulation={{}}>
        <SimulationSettings />
      </Providers>,
    );

    expect(screen.getByText("Variables")).toBeTruthy();
    expect(screen.getByText("Parameters")).toBeTruthy();
    expect(screen.getByText("Initial state")).toBeTruthy();
    // The icon slot adds a zero-width space to the button's name.
    expect(screen.getByRole("button", { name: /Clear/ })).toBeTruthy();
    // The net parameter is an expression override in the form, not a
    // numeric input row: the only spinbutton left is the Time Step.
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
    expect(screen.queryByRole("slider")).toBe(null);
  });

  it("shows a selected scenario through the run form in the same render", () => {
    render(
      <Providers simulation={{ selectedScenarioId: perPlaceScenario.id }}>
        <SimulationSettings />
      </Providers>,
    );

    // The run state reseeds during the selection's own render pass, so the
    // run form is in the DOM synchronously — no empty frame in between.
    expect(screen.getByText("Scenario parameters")).toBeTruthy();
    expect(screen.getByText("Parameters")).toBeTruthy();
    expect(screen.getByText("Initial state")).toBeTruthy();
    expect(screen.getByRole("button", { name: "rate" })).toBeTruthy();
    expect(screen.queryByText("Variables")).toBe(null);
    expect(screen.queryByRole("button", { name: /Clear/ })).toBe(null);
  });

  it("pushes an edited scenario parameter to the run", () => {
    const setScenarioParameterValue = vi.fn();
    render(
      <Providers
        simulation={{
          selectedScenarioId: perPlaceScenario.id,
          setScenarioParameterValue,
        }}
      >
        <SimulationSettings />
      </Providers>,
    );

    const value = screen.getByRole("button", { name: "rate" });
    value.focus();
    fireEvent.click(value, { detail: 0 });
    fireEvent.change(screen.getByLabelText("Expression"), {
      target: { value: "20" },
    });

    expect(setScenarioParameterValue).toHaveBeenCalledWith("rate", "20");
  });

  it("writes a form edit to the inline definition with no scenario", () => {
    const setAdHocScenario =
      vi.fn<SimulationContextValue["setAdHocScenario"]>();
    render(
      <Providers simulation={{ setAdHocScenario }}>
        <SimulationSettings />
      </Providers>,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add a variable (Top-level variables)",
      }),
    );

    expect(setAdHocScenario).toHaveBeenCalledTimes(1);
    expect(setAdHocScenario.mock.calls[0]?.[0]?.variables).toHaveLength(1);
  });
});
