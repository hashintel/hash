/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defineSimulator } from "@hashintel/petrinaut-core";

import { SimulationContext } from "../../../../../../react/simulation/context";
import { SimulatorsContext } from "../../../../../../react/simulators/context";
import { RunSettingsPicker } from "./run-settings-picker";

import type { SimulationContextValue } from "../../../../../../react/simulation/context";

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

const Providers = ({
  simulation,
  locked = false,
}: {
  simulation: Partial<SimulationContextValue>;
  locked?: boolean;
}) => (
  <SimulatorsContext
    value={{
      registrations,
      defaultSelections: {
        quick: { simulatorId: "test.stepped" },
        stochastic: { simulatorId: "test.stepped" },
      },
    }}
  >
    <SimulationContext
      value={
        {
          mode: "quick",
          runs: 100,
          maxTime: null,
          simulatorSelection: {
            simulatorId: "test.stepped",
            parameters: { dt: 0.01 },
          },
          ...simulation,
        } as SimulationContextValue
      }
    >
      <RunSettingsPicker locked={locked} />
    </SimulationContext>
  </SimulatorsContext>
);

/** Opens the simulator popover and returns its list of simulators. */
const openPopover = async () => {
  fireEvent.click(screen.getByRole("button", { name: /^Simulator:/ }));
  return screen.findByRole("radiogroup", { name: "Simulator" });
};

beforeEach(() => {
  // The popover positions itself against its trigger with observers jsdom
  // does not have.
  class ObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ObserverStub);
  vi.stubGlobal("IntersectionObserver", ObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RunSettingsPicker", () => {
  it("reads the simulator and its values on the trigger, and the mode beside it", async () => {
    const setMode = vi.fn();
    render(<Providers simulation={{ setMode }} />);

    expect(
      screen.getByRole("button", { name: "Simulator: Stepped, 0.01 s" }),
    ).toBeTruthy();
    // Nothing of the simulator's is in the row until the popover opens.
    expect(screen.queryByLabelText(/^Step size/)).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Stochastic" }));
    await waitFor(() => expect(setMode).toHaveBeenCalledWith("stochastic"));
  });

  it("adds the run count and the end time in Stochastic mode", () => {
    render(
      <Providers simulation={{ mode: "stochastic", runs: 250, maxTime: 60 }} />,
    );
    expect(
      screen.getByRole("button", {
        name: "Simulator: Stepped, 0.01 s · 250 runs · to 60 s",
      }),
    ).toBeTruthy();
  });

  it("lists the simulators in a popover, with the one that cannot compute the mode greyed and explained", async () => {
    const selectSimulator = vi.fn();
    render(<Providers simulation={{ selectSimulator }} />);

    const list = await openPopover();
    const simulators = within(list).getAllByRole("radio");
    expect(
      simulators.map((simulator) => [
        simulator.textContent,
        simulator.getAttribute("aria-checked"),
        simulator.getAttribute("aria-disabled"),
      ]),
    ).toEqual([
      ["SteppedAdvances in steps.", "true", "false"],
      ["SolvedChooses its steps.", "false", "false"],
      // Computes no single run: the reason takes the description's place.
      ["BatchedComputes many runs at once", "false", "true"],
    ]);

    fireEvent.click(simulators[2]!);
    expect(selectSimulator).not.toHaveBeenCalled();
    fireEvent.click(simulators[1]!);
    expect(selectSimulator).toHaveBeenCalledWith("test.solved");
  });

  it("opens on the picked simulator and moves through the pickable ones with the arrow keys", async () => {
    const selectSimulator = vi.fn();
    render(
      <Providers
        simulation={{
          selectSimulator,
          simulatorSelection: { simulatorId: "test.solved", parameters: {} },
        }}
      />,
    );

    const list = await openPopover();
    const [stepped, solved, batched] = within(list).getAllByRole("radio");
    // One tab stop, on the picked simulator, which is where focus opens.
    expect([stepped?.tabIndex, solved?.tabIndex, batched?.tabIndex]).toEqual([
      -1, 0, -1,
    ]);
    await waitFor(() => expect(document.activeElement).toBe(solved));

    // Batched computes no single run, so the move wraps round to Stepped.
    fireEvent.keyDown(solved!, { key: "ArrowDown" });
    expect(selectSimulator).toHaveBeenCalledWith("test.stepped");
  });

  it("edits the picked simulator's parameters in the popover, storing only what its spec accepts", async () => {
    const setSimulatorParameter = vi.fn();
    render(<Providers simulation={{ setSimulatorParameter }} />);
    await openPopover();

    const step = screen.getByLabelText(/^Step size/);
    fireEvent.change(step, { target: { value: "0.5" } });
    expect(setSimulatorParameter).toHaveBeenCalledWith("dt", 0.5);
    setSimulatorParameter.mockClear();
    fireEvent.change(step, { target: { value: "0" } });
    expect(setSimulatorParameter).not.toHaveBeenCalled();
    // A Quick Simulation has no run count to set.
    expect(screen.queryByLabelText(/^Runs/)).toBeNull();
  });

  it("shows a parameter only while the one it depends on holds the right value", async () => {
    const { rerender } = render(
      <Providers
        simulation={{
          simulatorSelection: {
            simulatorId: "test.solved",
            parameters: { tolerance: 1e-4, exact: false },
          },
        }}
      />,
    );
    await openPopover();
    expect(screen.getByLabelText(/^Max error/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Order/)).toBeNull();

    rerender(
      <Providers
        simulation={{
          simulatorSelection: {
            simulatorId: "test.solved",
            parameters: { tolerance: 1e-4, exact: true },
          },
        }}
      />,
    );
    expect(screen.getByLabelText(/^Order/)).toBeTruthy();
  });

  it("sets the runs and the end time of a Stochastic simulation in the popover", async () => {
    const setRuns = vi.fn();
    const setMaxTime = vi.fn();
    render(
      <Providers
        simulation={{
          mode: "stochastic",
          runs: 100,
          maxTime: 60,
          setRuns,
          setMaxTime,
        }}
      />,
    );
    await openPopover();

    fireEvent.change(screen.getByLabelText(/^Runs/), {
      target: { value: "500" },
    });
    expect(setRuns).toHaveBeenCalledWith(500);
    fireEvent.change(screen.getByLabelText(/^End time/), {
      target: { value: "120" },
    });
    expect(setMaxTime).toHaveBeenCalledWith(120);
  });

  it("is read, not edited, while a simulation exists", async () => {
    const selectSimulator = vi.fn();
    render(<Providers simulation={{ selectSimulator }} locked />);

    expect(
      (screen.getByRole("radio", { name: "Stochastic" }) as HTMLInputElement)
        .disabled,
    ).toBe(true);

    const list = await openPopover();
    fireEvent.click(within(list).getAllByRole("radio")[1]!);
    expect(selectSimulator).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText(/^Step size/) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      screen.getByText("Reset the simulation to change these."),
    ).toBeTruthy();
  });
});
