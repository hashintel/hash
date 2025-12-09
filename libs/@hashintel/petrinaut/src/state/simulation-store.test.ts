import { describe, expect, it } from "vitest";

import type { SDCPN } from "../core/types/sdcpn";
import { createSimulationStore } from "./simulation-store";

describe("SimulationStore", () => {
  const mockSDCPN: SDCPN = {
    types: [
      {
        id: "type1",
        name: "Type 1",
        iconSlug: "circle",
        displayColor: "#FF0000",
        elements: [
          { elementId: "e1", name: "x", type: "real" },
          { elementId: "e2", name: "y", type: "real" },
        ],
      },
    ],
    differentialEquations: [
      {
        id: "diffeq1",
        name: "Differential Equation 1",
        colorId: "type1",
        code: `export default Dynamics((tokens, parameters) => {
          return tokens;
        });`,
      },
    ],
    parameters: [],
    places: [
      {
        id: "p1",
        name: "Place1",
        colorId: "type1",
        dynamicsEnabled: true,
        differentialEquationId: "diffeq1",
        x: 0,
        y: 0,
      },
    ],
    transitions: [
      {
        id: "t1",
        name: "TransitionOne",
        inputArcs: [{ placeId: "p1", weight: 1 }],
        outputArcs: [{ placeId: "p1", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: `export default Lambda((input, parameters) => { return 0.5; });`,
        transitionKernelCode: `export default TransitionKernel((input, parameters) => {
          return {
            Place1: [input.Place1[0]]
          };
        });`,
        x: 100,
        y: 0,
      },
    ],
  };

  const getSDCPN = () => ({
    sdcpn: mockSDCPN,
  });

  it("should initialize in NotRun state", () => {
    const store = createSimulationStore(getSDCPN);
    const state = store.getState();

    expect(state.state).toBe("NotRun");
    expect(state.simulation).toBeNull();
    expect(state.error).toBeNull();
  });

  it("should initialize simulation successfully", () => {
    const store = createSimulationStore(getSDCPN);

    // Set initial marking in store first
    store.getState().setInitialMarking("p1", {
      values: new Float64Array([1.0, 2.0, 3.0, 4.0]),
      count: 2,
    });

    store.getState().initialize({
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
    const store = createSimulationStore(getSDCPN);

    // Set initial marking
    store.getState().setInitialMarking("p1", {
      values: new Float64Array([1.0, 2.0, 3.0, 4.0]),
      count: 2,
    });

    store.getState().initialize({
      seed: 42,
      dt: 0.1,
    });

    store.getState().setState("Running");

    expect(() =>
      store.getState().initialize({
        seed: 42,
        dt: 0.1,
      }),
    ).toThrow("Cannot initialize simulation while it is running");
  });

  it("should advance simulation by one step", () => {
    const store = createSimulationStore(getSDCPN);

    // Set initial marking
    store.getState().setInitialMarking("p1", {
      values: new Float64Array([1.0, 2.0]),
      count: 1,
    });

    store.getState().initialize({
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
    const store = createSimulationStore(getSDCPN);

    expect(() => store.getState().step()).toThrow(
      "Cannot step simulation: No simulation initialized",
    );
  });

  it("should reset simulation to NotRun state", () => {
    const store = createSimulationStore(getSDCPN);

    // Set initial marking
    store.getState().setInitialMarking("p1", {
      values: new Float64Array([1.0, 2.0]),
      count: 1,
    });

    store.getState().initialize({
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
    const store = createSimulationStore(getSDCPN);

    // Set initial marking
    store.getState().setInitialMarking("p1", {
      values: new Float64Array([1.0, 2.0]),
      count: 1,
    });

    store.getState().initialize({
      seed: 42,
      dt: 0.1,
    });

    store.getState().setState("Running");

    expect(store.getState().state).toBe("Running");
  });

  it("should handle errors during initialization", () => {
    const store = createSimulationStore(getSDCPN);

    // Set invalid initial marking (place doesn't exist in SDCPN)
    store.getState().setInitialMarking("invalid_place", {
      values: new Float64Array([1.0, 2.0]),
      count: 1,
    });

    store.getState().initialize({
      seed: 42,
      dt: 0.1,
    });

    const state = store.getState();

    expect(state.state).toBe("Error");
    expect(state.simulation).toBeNull();
    expect(state.error).toContain("does not exist in SDCPN");
  });

  it("should set currently viewed frame", () => {
    const store = createSimulationStore(getSDCPN);

    // Set initial marking
    store.getState().setInitialMarking("p1", {
      values: new Float64Array([1.0, 2.0]),
      count: 1,
    });

    store.getState().initialize({
      seed: 42,
      dt: 0.1,
    });

    // Step a few times to create multiple frames
    store.getState().step();
    store.getState().step();

    // Set viewed frame to frame 1
    store.getState().setCurrentlyViewedFrame(1);

    const state = store.getState();

    expect(state.currentlyViewedFrame).toBe(1);
  });

  it("should clamp viewed frame to valid range", () => {
    const store = createSimulationStore(getSDCPN);

    // Set initial marking
    store.getState().setInitialMarking("p1", {
      values: new Float64Array([1.0, 2.0]),
      count: 1,
    });

    store.getState().initialize({
      seed: 42,
      dt: 0.1,
    });

    // Try to set frame beyond available frames (only 1 frame exists)
    store.getState().setCurrentlyViewedFrame(10);

    let state = store.getState();
    expect(state.currentlyViewedFrame).toBe(0); // Should clamp to last frame (0)

    // Try to set negative frame
    store.getState().setCurrentlyViewedFrame(-5);

    state = store.getState();
    expect(state.currentlyViewedFrame).toBe(0); // Should clamp to 0
  });

  it("should throw error when setting viewed frame without simulation", () => {
    const store = createSimulationStore(getSDCPN);

    expect(() => store.getState().setCurrentlyViewedFrame(0)).toThrow(
      "Cannot set viewed frame: No simulation initialized.",
    );
  });

  it("should update currentlyViewedFrame when stepping", () => {
    const store = createSimulationStore(getSDCPN);

    // Set initial marking
    store.getState().setInitialMarking("p1", {
      values: new Float64Array([1.0, 2.0]),
      count: 1,
    });

    store.getState().initialize({
      seed: 42,
      dt: 0.1,
    });

    expect(store.getState().currentlyViewedFrame).toBe(0);

    // Step to frame 1
    store.getState().step();
    expect(store.getState().currentlyViewedFrame).toBe(1);

    // Step to frame 2
    store.getState().step();
    expect(store.getState().currentlyViewedFrame).toBe(2);
  });

  it("should reset currentlyViewedFrame when resetting simulation", () => {
    const store = createSimulationStore(getSDCPN);

    // Set initial marking
    store.getState().setInitialMarking("p1", {
      values: new Float64Array([1.0, 2.0]),
      count: 1,
    });

    store.getState().initialize({
      seed: 42,
      dt: 0.1,
    });

    store.getState().step();
    expect(store.getState().currentlyViewedFrame).toBe(1);

    store.getState().reset();

    const state = store.getState();
    expect(state.currentlyViewedFrame).toBe(0);
    expect(state.state).toBe("NotRun");
  });
});
