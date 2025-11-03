import { describe, expect, it } from "vitest";

import type { SDCPN } from "../../core/types/sdcpn";
import type { SDCPNState } from "./sdcpn-store";
import { createSimulationStore } from "./simulation-store";

describe("SimulationStore", () => {
  const mockSDCPN: SDCPN = {
    id: "test-sdcpn",
    title: "Test SDCPN",
    types: [
      {
        id: "type1",
        name: "Type 1",
        iconId: "circle",
        colorCode: "#FF0000",
        elements: [
          { id: "e1", name: "x", type: "real" },
          { id: "e2", name: "y", type: "real" },
        ],
      },
    ],
    differentialEquations: [],
    parameters: [],
    places: [
      {
        id: "p1",
        name: "Place 1",
        type: "type1",
        dynamicsEnabled: true,
        differentialEquationCode:
          "export default Dynamics((placeValues, t) => { return new Float64Array([0, 0]); });",
        x: 0,
        y: 0,
      },
    ],
    transitions: [
      {
        id: "t1",
        name: "Transition 1",
        inputArcs: [{ placeId: "p1", weight: 1 }],
        outputArcs: [{ placeId: "p1", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda((tokens) => { return 0.5; });",
        transitionKernelCode:
          "export default TransitionKernel((tokens) => { return [[[10.0, 20.0]]]; });",
        x: 100,
        y: 0,
      },
    ],
  };

  const mockSDCPNStore = {
    getState: (): SDCPNState =>
      ({
        sdcpn: mockSDCPN,
      }) as SDCPNState,
  };

  it("should initialize in NotRun state", () => {
    const store = createSimulationStore(mockSDCPNStore);
    const state = store.getState();

    expect(state.state).toBe("NotRun");
    expect(state.simulation).toBeNull();
    expect(state.error).toBeNull();
  });

  it("should initialize simulation with initial marking", () => {
    const store = createSimulationStore(mockSDCPNStore);

    const initialMarking = new Map([
      [
        "p1",
        {
          values: new Float64Array([1.0, 2.0, 3.0, 4.0]),
          count: 2,
        },
      ],
    ]);

    store.getState().initialize({
      initialMarking,
      seed: 42,
      dt: 0.1,
    });

    const state = store.getState();

    expect(state.state).toBe("Paused");
    expect(state.simulation).not.toBeNull();
    expect(state.simulation?.frames).toHaveLength(1);
    expect(state.simulation?.currentFrameNumber).toBe(0);
    expect(state.error).toBeNull();
  });

  it("should throw error when initializing while running", () => {
    const store = createSimulationStore(mockSDCPNStore);

    const initialMarking = new Map([
      [
        "p1",
        {
          values: new Float64Array([1.0, 2.0]),
          count: 1,
        },
      ],
    ]);

    store.getState().initialize({
      initialMarking,
      seed: 42,
      dt: 0.1,
    });

    store.getState().setState("Running");

    expect(() =>
      store.getState().initialize({
        initialMarking,
        seed: 42,
        dt: 0.1,
      }),
    ).toThrow("Cannot initialize simulation while it is running");
  });

  it("should advance simulation by one step", () => {
    const store = createSimulationStore(mockSDCPNStore);

    const initialMarking = new Map([
      [
        "p1",
        {
          values: new Float64Array([1.0, 2.0]),
          count: 1,
        },
      ],
    ]);

    store.getState().initialize({
      initialMarking,
      seed: 42,
      dt: 0.1,
    });

    store.getState().step();

    const state = store.getState();

    expect(state.simulation?.frames).toHaveLength(2);
    expect(state.simulation?.currentFrameNumber).toBe(1);
    expect(state.state).toBe("Paused");
  });

  it("should throw error when stepping without initialization", () => {
    const store = createSimulationStore(mockSDCPNStore);

    expect(() => store.getState().step()).toThrow(
      "Cannot step simulation: No simulation initialized",
    );
  });

  it("should reset simulation to NotRun state", () => {
    const store = createSimulationStore(mockSDCPNStore);

    const initialMarking = new Map([
      [
        "p1",
        {
          values: new Float64Array([1.0, 2.0]),
          count: 1,
        },
      ],
    ]);

    store.getState().initialize({
      initialMarking,
      seed: 42,
      dt: 0.1,
    });

    store.getState().step();
    store.getState().reset();

    const state = store.getState();

    expect(state.state).toBe("NotRun");
    expect(state.simulation).toBeNull();
    expect(state.error).toBeNull();
  });

  it("should change state from Paused to Running", () => {
    const store = createSimulationStore(mockSDCPNStore);

    const initialMarking = new Map([
      [
        "p1",
        {
          values: new Float64Array([1.0, 2.0]),
          count: 1,
        },
      ],
    ]);

    store.getState().initialize({
      initialMarking,
      seed: 42,
      dt: 0.1,
    });

    store.getState().setState("Running");

    expect(store.getState().state).toBe("Running");
  });

  it("should handle errors during initialization", () => {
    const store = createSimulationStore(mockSDCPNStore);

    // Invalid initial marking (wrong place ID)
    const invalidMarking = new Map([
      [
        "invalid_place",
        {
          values: new Float64Array([1.0, 2.0]),
          count: 1,
        },
      ],
    ]);

    store.getState().initialize({
      initialMarking: invalidMarking,
      seed: 42,
      dt: 0.1,
    });

    const state = store.getState();

    expect(state.state).toBe("Error");
    expect(state.simulation).toBeNull();
    expect(state.error).toContain("does not exist in SDCPN");
  });
});
