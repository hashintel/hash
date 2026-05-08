import { describe, expect, it } from "vitest";

import type { InputArc, OutputArc, Transition } from "../../../types/sdcpn";
import {
  checkTransitionEnablement,
  isTransitionStructurallyEnabled,
} from "./check-transition-enablement";
import type { SimulationFrame } from "./types";

const transitionState = {
  timeSinceLastFiringMs: 0,
  firedInThisFrame: false,
  firingCount: 0,
};

function makeTransition({
  id = "t1",
  name = "Transition",
  inputArcs,
  outputArcs = [],
}: {
  id?: string;
  name?: string;
  inputArcs: InputArc[];
  outputArcs?: OutputArc[];
}): Transition {
  return {
    id,
    name,
    inputArcs,
    outputArcs,
    lambdaType: "stochastic",
    lambdaCode: "return 1.0;",
    transitionKernelCode: "return {};",
    x: 0,
    y: 0,
  };
}

function makeTransitionMap(
  transitions: Transition[],
): ReadonlyMap<string, Transition> {
  return new Map(transitions.map((transition) => [transition.id, transition]));
}

function makeFrame({
  places,
  transitions,
}: {
  places: SimulationFrame["places"];
  transitions: Transition[];
}): SimulationFrame {
  return {
    time: 0,
    places,
    transitions: Object.fromEntries(
      transitions.map((transition) => [transition.id, transitionState]),
    ),
    buffer: new Float64Array([]),
  };
}

describe("isTransitionStructurallyEnabled", () => {
  it("returns true when input place has sufficient tokens", () => {
    const transition = makeTransition({
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
    });
    const frame = makeFrame({
      places: { p1: { offset: 0, count: 2, dimensions: 0 } },
      transitions: [transition],
    });

    expect(
      isTransitionStructurallyEnabled(
        frame,
        makeTransitionMap([transition]),
        "t1",
      ),
    ).toBe(true);
  });

  it("returns false when input place has insufficient tokens", () => {
    const transition = makeTransition({
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
    });
    const frame = makeFrame({
      places: { p1: { offset: 0, count: 0, dimensions: 0 } },
      transitions: [transition],
    });

    expect(
      isTransitionStructurallyEnabled(
        frame,
        makeTransitionMap([transition]),
        "t1",
      ),
    ).toBe(false);
  });

  it("respects arc weights when checking enablement", () => {
    const transition = makeTransition({
      inputArcs: [{ placeId: "p1", weight: 3, type: "standard" }],
    });
    const frame = makeFrame({
      places: { p1: { offset: 0, count: 2, dimensions: 0 } },
      transitions: [transition],
    });

    expect(
      isTransitionStructurallyEnabled(
        frame,
        makeTransitionMap([transition]),
        "t1",
      ),
    ).toBe(false);
  });

  it("checks all input places for enablement", () => {
    const transition = makeTransition({
      inputArcs: [
        { placeId: "p1", weight: 1, type: "standard" },
        { placeId: "p2", weight: 1, type: "standard" },
      ],
    });
    const frame = makeFrame({
      places: {
        p1: { offset: 0, count: 2, dimensions: 0 },
        p2: { offset: 0, count: 0, dimensions: 0 },
      },
      transitions: [transition],
    });

    expect(
      isTransitionStructurallyEnabled(
        frame,
        makeTransitionMap([transition]),
        "t1",
      ),
    ).toBe(false);
  });

  it("returns true for inhibitor arc when place has fewer tokens than weight", () => {
    const transition = makeTransition({
      inputArcs: [{ placeId: "p1", weight: 2, type: "inhibitor" }],
    });
    const frame = makeFrame({
      places: { p1: { offset: 0, count: 1, dimensions: 0 } },
      transitions: [transition],
    });

    expect(
      isTransitionStructurallyEnabled(
        frame,
        makeTransitionMap([transition]),
        "t1",
      ),
    ).toBe(true);
  });

  it("returns false for inhibitor arc when place has enough tokens", () => {
    const transition = makeTransition({
      inputArcs: [{ placeId: "p1", weight: 2, type: "inhibitor" }],
    });
    const frame = makeFrame({
      places: { p1: { offset: 0, count: 3, dimensions: 0 } },
      transitions: [transition],
    });

    expect(
      isTransitionStructurallyEnabled(
        frame,
        makeTransitionMap([transition]),
        "t1",
      ),
    ).toBe(false);
  });

  it("returns false for inhibitor arc when place has exactly the weight in tokens", () => {
    const transition = makeTransition({
      inputArcs: [{ placeId: "p1", weight: 2, type: "inhibitor" }],
    });
    const frame = makeFrame({
      places: { p1: { offset: 0, count: 2, dimensions: 0 } },
      transitions: [transition],
    });

    expect(
      isTransitionStructurallyEnabled(
        frame,
        makeTransitionMap([transition]),
        "t1",
      ),
    ).toBe(false);
  });

  it("returns true for inhibitor arc when place is empty", () => {
    const transition = makeTransition({
      inputArcs: [{ placeId: "p1", weight: 1, type: "inhibitor" }],
    });
    const frame = makeFrame({
      places: { p1: { offset: 0, count: 0, dimensions: 0 } },
      transitions: [transition],
    });

    expect(
      isTransitionStructurallyEnabled(
        frame,
        makeTransitionMap([transition]),
        "t1",
      ),
    ).toBe(true);
  });

  it("checks mixed standard and inhibitor arcs together", () => {
    const transition = makeTransition({
      inputArcs: [
        { placeId: "p1", weight: 1, type: "standard" },
        { placeId: "p2", weight: 1, type: "inhibitor" },
      ],
    });
    const frame = makeFrame({
      places: {
        p1: { offset: 0, count: 2, dimensions: 0 },
        p2: { offset: 0, count: 0, dimensions: 0 },
      },
      transitions: [transition],
    });

    expect(
      isTransitionStructurallyEnabled(
        frame,
        makeTransitionMap([transition]),
        "t1",
      ),
    ).toBe(true);
  });

  it("returns false when standard arc is satisfied but inhibitor arc is not", () => {
    const transition = makeTransition({
      inputArcs: [
        { placeId: "p1", weight: 1, type: "standard" },
        { placeId: "p2", weight: 1, type: "inhibitor" },
      ],
    });
    const frame = makeFrame({
      places: {
        p1: { offset: 0, count: 2, dimensions: 0 },
        p2: { offset: 0, count: 3, dimensions: 0 },
      },
      transitions: [transition],
    });

    expect(
      isTransitionStructurallyEnabled(
        frame,
        makeTransitionMap([transition]),
        "t1",
      ),
    ).toBe(false);
  });

  it("returns true for transitions with no input arcs", () => {
    const transition = makeTransition({
      inputArcs: [],
      outputArcs: [{ placeId: "p1", weight: 1 }],
    });
    const frame = makeFrame({ places: {}, transitions: [transition] });

    expect(
      isTransitionStructurallyEnabled(
        frame,
        makeTransitionMap([transition]),
        "t1",
      ),
    ).toBe(true);
  });
});

describe("checkTransitionEnablement", () => {
  it("returns hasEnabledTransition=true when at least one transition is enabled", () => {
    const transitions = [
      makeTransition({
        id: "t1",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      }),
      makeTransition({
        id: "t2",
        inputArcs: [{ placeId: "p2", weight: 1, type: "standard" }],
      }),
    ];
    const frame = makeFrame({
      places: {
        p1: { offset: 0, count: 1, dimensions: 0 },
        p2: { offset: 0, count: 0, dimensions: 0 },
      },
      transitions,
    });

    const result = checkTransitionEnablement(
      frame,
      makeTransitionMap(transitions),
    );

    expect(result.hasEnabledTransition).toBe(true);
    expect(result.transitionStatus.get("t1")).toBe(true);
    expect(result.transitionStatus.get("t2")).toBe(false);
  });

  it("returns hasEnabledTransition=false when no transitions are enabled", () => {
    const transitions = [
      makeTransition({
        id: "t1",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      }),
      makeTransition({
        id: "t2",
        inputArcs: [{ placeId: "p2", weight: 1, type: "standard" }],
      }),
    ];
    const frame = makeFrame({
      places: {
        p1: { offset: 0, count: 0, dimensions: 0 },
        p2: { offset: 0, count: 0, dimensions: 0 },
      },
      transitions,
    });

    const result = checkTransitionEnablement(
      frame,
      makeTransitionMap(transitions),
    );

    expect(result.hasEnabledTransition).toBe(false);
    expect(result.transitionStatus.get("t1")).toBe(false);
    expect(result.transitionStatus.get("t2")).toBe(false);
  });

  it("returns hasEnabledTransition=false when there are no transitions", () => {
    const frame = makeFrame({ places: {}, transitions: [] });

    const result = checkTransitionEnablement(frame, makeTransitionMap([]));

    expect(result.hasEnabledTransition).toBe(false);
    expect(result.transitionStatus.size).toBe(0);
  });

  it("returns all transitions enabled when all have sufficient tokens", () => {
    const transitions = [
      makeTransition({
        id: "t1",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      }),
      makeTransition({
        id: "t2",
        inputArcs: [{ placeId: "p1", weight: 2, type: "standard" }],
      }),
      makeTransition({
        id: "t3",
        inputArcs: [{ placeId: "p1", weight: 5, type: "standard" }],
      }),
    ];
    const frame = makeFrame({
      places: { p1: { offset: 0, count: 5, dimensions: 0 } },
      transitions,
    });

    const result = checkTransitionEnablement(
      frame,
      makeTransitionMap(transitions),
    );

    expect(result.hasEnabledTransition).toBe(true);
    expect(result.transitionStatus.get("t1")).toBe(true);
    expect(result.transitionStatus.get("t2")).toBe(true);
    expect(result.transitionStatus.get("t3")).toBe(true);
  });
});
