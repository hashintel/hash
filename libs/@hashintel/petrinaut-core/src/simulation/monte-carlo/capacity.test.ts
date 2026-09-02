/**
 * End-to-end capacity behaviour through the Monte Carlo stepping loop.
 *
 * These cover what the unit tests in `engine/capacity.test.ts` cannot: that the
 * limit actually holds while frames advance, that it interacts correctly with
 * several transitions feeding one place in the same frame, and that a net
 * blocked only by capacity reports deadlock rather than spinning.
 */
import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../../hir";
import { createMonteCarloSimulator } from "./monte-carlo-simulator";

import type { SDCPN, Place, Transition } from "../../types/sdcpn";

function place(id: string, capacity?: number): Place {
  return {
    id,
    name: id,
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 0,
    y: 0,
    ...(capacity === undefined ? {} : { capacity }),
  };
}

/** An always-firing transition, so only structure gates it. */
function alwaysFiring(
  id: string,
  inputArcs: Transition["inputArcs"],
  outputArcs: Transition["outputArcs"],
): Transition {
  return {
    id,
    name: id,
    inputArcs,
    outputArcs,
    lambdaType: "predicate",
    lambdaCode: "export default Lambda(() => true);",
    transitionKernelCode: "export default TransitionKernel(() => ({}));",
    x: 0,
    y: 0,
  };
}

function run(
  sdcpn: SDCPN,
  initialMarking: Record<string, number>,
  frames = 20,
) {
  const simulator = createMonteCarloSimulator({
    sdcpn,
    initialMarking,
    parameterValues: {},
    seed: 1,
    dt: 1,
    maxTime: frames,
    runCount: 1,
    hirArtifacts: compileHirArtifacts(sdcpn).artifacts,
  });
  simulator.runUntilComplete();
  return simulator;
}

describe("place capacity", () => {
  it("stops a producer once its output place is full", () => {
    const sdcpn: SDCPN = {
      types: [],
      places: [place("source"), place("sink", 3)],
      transitions: [
        alwaysFiring(
          "move",
          [{ placeId: "source", weight: 1, type: "standard" }],
          [{ placeId: "sink", weight: 1 }],
        ),
      ],
      differentialEquations: [],
      parameters: [],
    };

    const counts = run(sdcpn, { source: 10, sink: 0 }).getRunSnapshot(
      0,
    ).placeTokenCounts;

    expect(counts.sink).toBe(3);
    // The 7 tokens that could not move stay put rather than vanishing.
    expect(counts.source).toBe(7);
  });

  it("never exceeds capacity when a firing adds several tokens at once", () => {
    // Weight 2 into a capacity of 3: the second firing would reach 4, so it is
    // blocked and the place settles at 2 rather than overshooting to 4.
    const sdcpn: SDCPN = {
      types: [],
      places: [place("source"), place("sink", 3)],
      transitions: [
        alwaysFiring(
          "move",
          [{ placeId: "source", weight: 1, type: "standard" }],
          [{ placeId: "sink", weight: 2 }],
        ),
      ],
      differentialEquations: [],
      parameters: [],
    };

    expect(
      run(sdcpn, { source: 10, sink: 0 }).getRunSnapshot(0).placeTokenCounts
        .sink,
    ).toBe(2);
  });

  it("holds the limit when two transitions feed one place in the same frame", () => {
    // Both producers are evaluated in the same frame and their output is applied
    // together at the end, so the capacity check has to account for output that
    // is committed but not yet written into the frame's counts.
    const sdcpn: SDCPN = {
      types: [],
      places: [place("left"), place("right"), place("shared", 1)],
      transitions: [
        alwaysFiring(
          "fromLeft",
          [{ placeId: "left", weight: 1, type: "standard" }],
          [{ placeId: "shared", weight: 1 }],
        ),
        alwaysFiring(
          "fromRight",
          [{ placeId: "right", weight: 1, type: "standard" }],
          [{ placeId: "shared", weight: 1 }],
        ),
      ],
      differentialEquations: [],
      parameters: [],
    };

    const counts = run(sdcpn, { left: 5, right: 5, shared: 0 }).getRunSnapshot(
      0,
    ).placeTokenCounts;

    expect(counts.shared).toBe(1);
    // Exactly one producer consumed a token; the other was blocked.
    expect((counts.left ?? 0) + (counts.right ?? 0)).toBe(9);
  });

  it("does not block a transition that recycles its own output place", () => {
    // A 1-in/1-out self loop leaves the count unchanged, so a place sitting at
    // capacity must not block it.
    const sdcpn: SDCPN = {
      types: [],
      places: [place("pool", 2)],
      transitions: [
        alwaysFiring(
          "churn",
          [{ placeId: "pool", weight: 1, type: "standard" }],
          [{ placeId: "pool", weight: 1 }],
        ),
      ],
      differentialEquations: [],
      parameters: [],
    };

    const simulator = run(sdcpn, { pool: 2 });

    expect(simulator.getRunSnapshot(0).placeTokenCounts.pool).toBe(2);
    // It kept firing rather than deadlocking on its own full output place.
    expect(simulator.getRunSummary(0).completionReason).toBe("maxTime");
  });

  it("reports deadlock when capacity is the only thing left blocking", () => {
    const sdcpn: SDCPN = {
      types: [],
      places: [place("source"), place("sink", 1)],
      transitions: [
        alwaysFiring(
          "move",
          [{ placeId: "source", weight: 1, type: "standard" }],
          [{ placeId: "sink", weight: 1 }],
        ),
      ],
      differentialEquations: [],
      parameters: [],
    };

    const simulator = run(sdcpn, { source: 10, sink: 0 }, 100);
    const summary = simulator.getRunSummary(0);

    expect(summary.completionReason).toBe("deadlock");
    // Deadlock was detected promptly rather than after stepping to maxTime.
    expect(summary.frameNumber).toBeLessThan(10);
  });

  it("treats a capacity of zero as a place that can never receive tokens", () => {
    const sdcpn: SDCPN = {
      types: [],
      places: [place("source"), place("sink", 0)],
      transitions: [
        alwaysFiring(
          "move",
          [{ placeId: "source", weight: 1, type: "standard" }],
          [{ placeId: "sink", weight: 1 }],
        ),
      ],
      differentialEquations: [],
      parameters: [],
    };

    const counts = run(sdcpn, { source: 4, sink: 0 }).getRunSnapshot(
      0,
    ).placeTokenCounts;

    expect(counts.sink).toBe(0);
    expect(counts.source).toBe(4);
  });

  it("leaves nets without capacities unchanged", () => {
    const sdcpn: SDCPN = {
      types: [],
      places: [place("source"), place("sink")],
      transitions: [
        alwaysFiring(
          "move",
          [{ placeId: "source", weight: 1, type: "standard" }],
          [{ placeId: "sink", weight: 1 }],
        ),
      ],
      differentialEquations: [],
      parameters: [],
    };

    expect(
      run(sdcpn, { source: 10, sink: 0 }).getRunSnapshot(0).placeTokenCounts
        .sink,
    ).toBe(10);
  });
});
