import { describe, expect, it } from "vitest";

import {
  buildConnectionIndex,
  buildDependentCounts,
  buildNetGraph,
  buildNodeNeighbourhood,
  fuzzyMatchName,
} from "./notebook-model";

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";
import type { NodeRef } from "./notebook-model";

const emptyNet: ActiveNetDefinition = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  componentInstances: [],
};

const place = (
  id: string,
  overrides: Partial<ActiveNetDefinition["places"][number]> = {},
): ActiveNetDefinition["places"][number] => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
  ...overrides,
});

const transition = (
  id: string,
  overrides: Partial<ActiveNetDefinition["transitions"][number]> = {},
): ActiveNetDefinition["transitions"][number] => ({
  id,
  name: id,
  inputArcs: [],
  outputArcs: [],
  lambdaType: "stochastic",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
  ...overrides,
});

const parameter = (
  id: string,
  variableName: string,
): ActiveNetDefinition["parameters"][number] => ({
  id,
  name: id,
  variableName,
  type: "real",
  defaultValue: "1",
});

const names = (refs: { name: string }[]) => refs.map(({ name }) => name).sort();

describe("buildConnectionIndex", () => {
  it("links a transition to its input places upstream and output places downstream", () => {
    const net: ActiveNetDefinition = {
      ...emptyNet,
      places: [place("Source"), place("Sink")],
      transitions: [
        transition("Move", {
          inputArcs: [{ placeId: "Source", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "Sink", weight: 1 }],
        }),
      ],
    };

    const index = buildConnectionIndex(net);

    expect(names(index.get("Move")!.upstream)).toEqual(["Source"]);
    expect(names(index.get("Move")!.downstream)).toEqual(["Sink"]);
    // The reverse direction is derived from the same edges.
    expect(names(index.get("Source")!.downstream)).toEqual(["Move"]);
    expect(names(index.get("Sink")!.upstream)).toEqual(["Move"]);
  });

  it("links a place to its token type and differential equation", () => {
    const net: ActiveNetDefinition = {
      ...emptyNet,
      places: [
        place("Stock", {
          colorId: "colour",
          dynamicsEnabled: true,
          differentialEquationId: "decay",
        }),
      ],
      types: [
        {
          id: "colour",
          name: "Widget",
          iconSlug: "circle",
          displayColor: "#000000",
          elements: [],
        },
      ],
      differentialEquations: [
        { id: "decay", name: "Decay", colorId: "colour", code: "" },
      ],
    };

    const index = buildConnectionIndex(net);

    expect(names(index.get("Stock")!.upstream)).toEqual(["Decay", "Widget"]);
    expect(names(index.get("colour")!.downstream)).toEqual(["Decay", "Stock"]);
    expect(names(index.get("decay")!.upstream)).toEqual(["Widget"]);
    expect(names(index.get("decay")!.downstream)).toEqual(["Stock"]);
  });

  it("links parameters to the transitions and equations whose code reads them", () => {
    const net: ActiveNetDefinition = {
      ...emptyNet,
      parameters: [parameter("rate", "growth_rate")],
      transitions: [
        transition("Grow", { lambdaCode: "return parameters.growth_rate;" }),
        transition("Idle", { lambdaCode: "return 1;" }),
      ],
      differentialEquations: [
        {
          id: "growth",
          name: "Growth",
          colorId: null,
          code: "return growth_rate * x;",
        },
      ],
    };

    const index = buildConnectionIndex(net);

    expect(names(index.get("rate")!.downstream)).toEqual(["Grow", "Growth"]);
    expect(names(index.get("Grow")!.upstream)).toEqual(["rate"]);
    expect(index.get("Idle")).toBeUndefined();
  });

  it("only counts parameter references bounded by non-identifier characters", () => {
    const net: ActiveNetDefinition = {
      ...emptyNet,
      parameters: [parameter("rate", "growth_rate")],
      transitions: [
        transition("Longer", { lambdaCode: "return growth_rate2;" }),
        transition("Prefixed", { lambdaCode: "return my_growth_rate;" }),
        transition("Dollar", { lambdaCode: "return $growth_rate;" }),
        transition("Exact", {
          lambdaCode: "return growth_rate2 + growth_rate;",
        }),
      ],
    };

    const index = buildConnectionIndex(net);

    expect(names(index.get("rate")!.downstream)).toEqual(["Exact"]);
  });

  it("records both directions when a place is an input and an output of one transition", () => {
    const net: ActiveNetDefinition = {
      ...emptyNet,
      places: [place("Pool")],
      transitions: [
        transition("Churn", {
          inputArcs: [{ placeId: "Pool", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "Pool", weight: 1 }],
        }),
      ],
    };

    const index = buildConnectionIndex(net);

    expect(names(index.get("Churn")!.upstream)).toEqual(["Pool"]);
    expect(names(index.get("Churn")!.downstream)).toEqual(["Pool"]);
  });

  it("ignores component port arc endpoints", () => {
    const net: ActiveNetDefinition = {
      ...emptyNet,
      places: [place("Local")],
      transitions: [
        transition("Bridge", {
          inputArcs: [
            {
              endpoint: {
                kind: "componentPort",
                componentInstanceId: "instance",
                portPlaceId: "port",
              },
              weight: 1,
              type: "standard",
            },
          ],
          outputArcs: [{ placeId: "Local", weight: 1 }],
        }),
      ],
    };

    const index = buildConnectionIndex(net);

    expect(index.get("Bridge")!.upstream).toEqual([]);
    expect(names(index.get("Bridge")!.downstream)).toEqual(["Local"]);
  });
});

describe("buildNodeNeighbourhood", () => {
  const ref = (
    type: "place" | "transition" | "parameter",
    id: string,
  ): NodeRef => ({ type, id, name: id });

  it("keeps only places and transitions", () => {
    const neighbourhood = buildNodeNeighbourhood({
      upstream: [ref("place", "Source"), ref("parameter", "rate")],
      downstream: [ref("transition", "Move")],
    });

    expect(names(neighbourhood.dependencies)).toEqual(["Source"]);
    expect(names(neighbourhood.dependents)).toEqual(["Move"]);
    expect(neighbourhood.bidirectional).toEqual([]);
  });

  it("moves a neighbour reachable both ways into the bidirectional bucket", () => {
    const neighbourhood = buildNodeNeighbourhood({
      upstream: [ref("place", "Pool"), ref("place", "Source")],
      downstream: [ref("place", "Pool"), ref("place", "Sink")],
    });

    expect(names(neighbourhood.bidirectional)).toEqual(["Pool"]);
    expect(names(neighbourhood.dependencies)).toEqual(["Source"]);
    expect(names(neighbourhood.dependents)).toEqual(["Sink"]);
  });

  it("deduplicates repeated refs", () => {
    const neighbourhood = buildNodeNeighbourhood({
      upstream: [ref("place", "Source"), ref("place", "Source")],
      downstream: [],
    });

    expect(neighbourhood.dependencies).toHaveLength(1);
  });
});

describe("buildNetGraph", () => {
  it("turns input arcs into place -> transition and output arcs into transition -> place", () => {
    const net: ActiveNetDefinition = {
      ...emptyNet,
      places: [place("Source"), place("Sink")],
      transitions: [
        transition("Move", {
          inputArcs: [{ placeId: "Source", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "Sink", weight: 1 }],
        }),
      ],
    };

    const graph = buildNetGraph(net);

    expect(graph.nodes.map(({ id }) => id)).toEqual(["Source", "Sink", "Move"]);
    expect(graph.edges).toEqual([
      { from: "Source", to: "Move" },
      { from: "Move", to: "Sink" },
    ]);
  });

  it("excludes types, parameters and equations", () => {
    const net: ActiveNetDefinition = {
      ...emptyNet,
      places: [place("Stock", { colorId: "colour" })],
      types: [
        {
          id: "colour",
          name: "Widget",
          iconSlug: "circle",
          displayColor: "#000000",
          elements: [],
        },
      ],
      parameters: [parameter("rate", "growth_rate")],
      differentialEquations: [
        { id: "decay", name: "Decay", colorId: null, code: "" },
      ],
    };

    expect(buildNetGraph(net).nodes.map(({ id }) => id)).toEqual(["Stock"]);
  });

  it("skips arcs naming a place that no longer exists", () => {
    const net: ActiveNetDefinition = {
      ...emptyNet,
      transitions: [
        transition("Orphan", {
          inputArcs: [{ placeId: "Missing", weight: 1, type: "standard" }],
        }),
      ],
    };

    expect(buildNetGraph(net).edges).toEqual([]);
  });
});

describe("buildDependentCounts", () => {
  it("counts direct and transitive dependents down a chain", () => {
    const net: ActiveNetDefinition = {
      ...emptyNet,
      places: [place("Source"), place("Middle"), place("Sink")],
      transitions: [
        transition("First", {
          inputArcs: [{ placeId: "Source", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "Middle", weight: 1 }],
        }),
        transition("Second", {
          inputArcs: [{ placeId: "Middle", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "Sink", weight: 1 }],
        }),
      ],
    };

    const counts = buildDependentCounts(buildConnectionIndex(net));

    // Source -> First -> Middle -> Second -> Sink
    expect(counts.get("Source")).toEqual({ direct: 1, transitive: 4 });
    expect(counts.get("Middle")).toEqual({ direct: 1, transitive: 2 });
    expect(counts.get("Sink")).toEqual({ direct: 0, transitive: 0 });
  });

  it("excludes the cell itself when it sits in a cycle", () => {
    const net: ActiveNetDefinition = {
      ...emptyNet,
      places: [place("Pool")],
      transitions: [
        transition("Churn", {
          inputArcs: [{ placeId: "Pool", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "Pool", weight: 1 }],
        }),
      ],
    };

    const counts = buildDependentCounts(buildConnectionIndex(net));

    expect(counts.get("Pool")).toEqual({ direct: 1, transitive: 1 });
    expect(counts.get("Churn")).toEqual({ direct: 1, transitive: 1 });
  });

  it("counts a declaration's users across kinds", () => {
    const net: ActiveNetDefinition = {
      ...emptyNet,
      places: [place("Stock", { colorId: "colour" })],
      types: [
        {
          id: "colour",
          name: "Widget",
          iconSlug: "circle",
          displayColor: "#000000",
          elements: [],
        },
      ],
      differentialEquations: [
        { id: "decay", name: "Decay", colorId: "colour", code: "" },
      ],
    };

    const counts = buildDependentCounts(buildConnectionIndex(net));

    // The type is used by the place and the equation directly.
    expect(counts.get("colour")).toEqual({ direct: 2, transitive: 2 });
  });
});

describe("fuzzyMatchName", () => {
  it("matches a subsequence case-insensitively and returns its indices", () => {
    expect(fuzzyMatchName("rwm", "RawMaterial")).toEqual([0, 2, 3]);
  });

  it("ignores whitespace in the query", () => {
    expect(fuzzyMatchName("raw mat", "RawMaterial")).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("returns null when a character has no match after the previous one", () => {
    expect(fuzzyMatchName("lam", "Material")).toBeNull();
  });

  it("returns indices into the original string when lowercasing changes its length", () => {
    // "İ".toLowerCase() is two code units; the indices must still point into
    // the original string.
    expect(fuzzyMatchName("stan", "İstanbul")).toEqual([1, 2, 3, 4]);
  });

  it("matches a query character whose lowercase form expands", () => {
    // Lowercasing the whole query up front would split "İ" into "i" + a
    // combining dot and fail on the second step.
    expect(fuzzyMatchName("İst", "İstanbul")).toEqual([0, 1, 2]);
  });
});
