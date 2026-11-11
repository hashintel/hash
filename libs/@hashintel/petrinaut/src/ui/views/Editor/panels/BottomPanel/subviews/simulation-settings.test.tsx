/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defineSimulator,
  DEFAULT_PETRINAUT_EXTENSIONS,
} from "@hashintel/petrinaut-core";

import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../../../../../../react/lsp/context";
import {
  DEFAULT_SIMULATION_CONTEXT,
  SimulationContext,
} from "../../../../../../react/simulation/context";
import { SimulatorsContext } from "../../../../../../react/simulators/context";
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
    "aria-label": ariaLabel,
    items,
    onChange,
    value,
  }: {
    "aria-label"?: string;
    items: readonly { value: string; text: string; disabled?: boolean }[];
    onChange: (value: string) => void;
    value: string;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value} disabled={item.disabled}>
          {item.text}
        </option>
      ))}
    </select>
  );
  // The Ark segment group floats its indicator from measurements jsdom
  // cannot make; the stub is a row of pressed buttons.
  const { SegmentedControl } =
    await import("../../SimulateView/shared/ds-control-stubs");
  return { ...actual, Select, SegmentedControl };
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
  ...DEFAULT_SIMULATION_CONTEXT,
  adHocNetParameters: sdcpn.parameters,
  simulatorSelection: { simulatorId: "js-fixed-step", parameters: {} },
};

const neverLoaded = {
  isAvailable: () => true,
  load: () => Promise.reject(new Error("The picker loads no simulator")),
};

const registrations = [
  defineSimulator(
    {
      id: "test.stepped",
      label: "Stepped",
      description: "Advances in steps.",
      parameters: {
        dt: {
          type: "number",
          label: "Step size",
          unit: "s",
          default: 0.01,
          min: 0,
          exclusiveMin: true,
        },
      },
      produces: { run: true, experiment: true },
    },
    neverLoaded,
  ),
  defineSimulator(
    {
      id: "test.solved",
      label: "Solved",
      description: "Chooses its steps.",
      parameters: {
        tolerance: {
          type: "number",
          label: "Max error",
          default: 1e-6,
          min: 0,
          exclusiveMin: true,
        },
        exact: { type: "boolean", label: "Exact", default: false },
        order: {
          type: "integer",
          label: "Order",
          default: 4,
          enabledWhen: { key: "exact", in: [true] },
        },
      },
      produces: { run: true, experiment: false },
    },
    neverLoaded,
  ),
  defineSimulator(
    {
      id: "test.batched",
      label: "Batched",
      description: "Computes many runs.",
      parameters: {},
      produces: { run: false, experiment: true },
    },
    neverLoaded,
  ),
];

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
      <SimulatorsContext
        value={{
          registrations,
          defaultSelections: {
            quick: { simulatorId: "test.stepped" },
            stochastic: { simulatorId: "test.stepped" },
          },
        }}
      >
        <SimulationContext value={{ ...simulationContextValue, ...simulation }}>
          {children}
        </SimulationContext>
      </SimulatorsContext>
    </SDCPNContext>
  </LanguageClientContext>
);

describe("SimulationSettings", () => {
  it("offers the simulator and its parameters for an event-driven run, in place of the Time Step", () => {
    const selectSimulator = vi.fn();
    const setSimulatorParameter = vi.fn();
    const { rerender } = render(
      <Providers
        simulation={{
          simulatorSelection: {
            simulatorId: "test.stepped",
            parameters: { dt: 0.01 },
          },
          selectSimulator,
          setSimulatorParameter,
        }}
      >
        <SimulationSettings />
      </Providers>,
    );

    // The simulator brings its own fields.
    expect(screen.queryByLabelText(/Time Step/)).toBeNull();
    expect(screen.queryByLabelText(/Max error/)).toBeNull();
    const step = screen.getByLabelText(/Step size/);
    fireEvent.change(step, { target: { value: "0.5" } });
    expect(setSimulatorParameter).toHaveBeenCalledWith("dt", 0.5);
    // A value the spec rejects is not stored.
    setSimulatorParameter.mockClear();
    fireEvent.change(step, { target: { value: "0" } });
    expect(setSimulatorParameter).not.toHaveBeenCalled();

    const picker = screen.getByLabelText("Simulator");
    // A simulator that computes no single run is listed and cannot be picked.
    expect(
      Array.from(picker.querySelectorAll("option")).map((option) => [
        option.textContent,
        option.disabled,
      ]),
    ).toEqual([
      ["Stepped", false],
      ["Solved", false],
      ["Batched", true],
    ]);
    fireEvent.change(picker, { target: { value: "test.solved" } });
    expect(selectSimulator).toHaveBeenCalledWith("test.solved");

    rerender(
      <Providers
        simulation={{
          simulatorSelection: {
            simulatorId: "test.solved",
            parameters: { tolerance: 1e-4, exact: false },
          },
          selectSimulator,
          setSimulatorParameter,
        }}
      >
        <SimulationSettings />
      </Providers>,
    );
    expect(screen.queryByLabelText(/Step size/)).toBeNull();
    expect(screen.getByLabelText(/Max error/)).toBeTruthy();
    // Shown only while the parameter it depends on holds the right value.
    expect(screen.queryByLabelText(/Order/)).toBeNull();
  });

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
    // numeric input row, and the simulator selected here is not one this
    // host registers, so it brings no field either.
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
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
