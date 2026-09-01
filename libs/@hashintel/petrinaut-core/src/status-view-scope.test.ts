import { describe, expect, it } from "vitest";

import {
  getStatusViewEvaluationScope,
  resolveStatusViewLabelPlace,
  visitComponentInstancePlaces,
} from "./status-view-scope";

import type { Place, SDCPN } from "./types/sdcpn";

const makePlace = (
  id: string,
  name: string,
  colorId: string | null,
): Place => ({
  id,
  name,
  colorId,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

const makeInstance = (id: string, name: string, subnetId: string) => ({
  id,
  name,
  subnetId,
  parameterValues: {},
  x: 0,
  y: 0,
});

const sdcpn: SDCPN = {
  places: [makePlace("root-place", "RootPlace", "root-color")],
  transitions: [],
  types: [
    {
      id: "root-color",
      name: "RootColor",
      iconSlug: "circle",
      displayColor: "#111111",
      elements: [],
    },
  ],
  differentialEquations: [],
  parameters: [],
  subnets: [
    {
      id: "subnet-outer",
      name: "Outer",
      places: [makePlace("shared-id", "OuterPlace", "outer-color")],
      transitions: [],
      types: [
        {
          id: "outer-color",
          name: "OuterColor",
          iconSlug: "circle",
          displayColor: "#222222",
          elements: [],
        },
      ],
      differentialEquations: [],
      parameters: [],
      componentInstances: [makeInstance("inner-1", "InnerOne", "subnet-inner")],
    },
    {
      id: "subnet-inner",
      name: "Inner",
      places: [makePlace("shared-id", "InnerPlace", "inner-color")],
      transitions: [],
      types: [
        {
          id: "inner-color",
          name: "InnerColor",
          iconSlug: "circle",
          displayColor: "#333333",
          elements: [],
        },
      ],
      differentialEquations: [],
      parameters: [],
    },
  ],
  componentInstances: [makeInstance("outer-1", "OuterOne", "subnet-outer")],
};

describe("visitComponentInstancePlaces", () => {
  it("yields scoped ids and name paths for nested instances", () => {
    const visited: { scopedId: string; namePath: readonly string[] }[] = [];
    visitComponentInstancePlaces(sdcpn, ({ scopedId, instanceNamePath }) => {
      visited.push({ scopedId, namePath: instanceNamePath });
    });

    expect(visited).toEqual([
      { scopedId: "outer-1::shared-id", namePath: ["OuterOne"] },
      {
        scopedId: "outer-1::inner-1::shared-id",
        namePath: ["OuterOne", "InnerOne"],
      },
    ]);
  });

  it("skips instances and places whose ids contain the scope separator", () => {
    const withBadIds: SDCPN = {
      ...sdcpn,
      subnets: [
        {
          ...sdcpn.subnets![0]!,
          places: [
            ...sdcpn.subnets![0]!.places,
            makePlace("bad::place", "BadPlace", "outer-color"),
          ],
          componentInstances: [],
        },
        sdcpn.subnets![1]!,
      ],
      componentInstances: [
        ...sdcpn.componentInstances!,
        makeInstance("bad::instance", "BadInstance", "subnet-inner"),
      ],
    };

    const visited: string[] = [];
    visitComponentInstancePlaces(withBadIds, ({ scopedId }) => {
      visited.push(scopedId);
    });

    expect(visited).toEqual(["outer-1::shared-id"]);
  });
});

describe("getStatusViewEvaluationScope", () => {
  it("collects root places, scoped instance copies, and all colours", () => {
    const { places, types } = getStatusViewEvaluationScope(sdcpn);

    expect(places.map((place) => place.id)).toEqual([
      "root-place",
      "outer-1::shared-id",
      "outer-1::inner-1::shared-id",
    ]);
    expect(types.map((color) => color.id)).toEqual([
      "root-color",
      "outer-color",
      "inner-color",
    ]);
  });
});

describe("resolveStatusViewLabelPlace", () => {
  it("resolves a bare id to a root place", () => {
    expect(resolveStatusViewLabelPlace(sdcpn, "root-place")?.colorId).toBe(
      "root-color",
    );
  });

  it("resolves a scoped id through the instance path, not by bare place id", () => {
    expect(
      resolveStatusViewLabelPlace(sdcpn, "outer-1::shared-id")?.colorId,
    ).toBe("outer-color");
    expect(
      resolveStatusViewLabelPlace(sdcpn, "outer-1::inner-1::shared-id")
        ?.colorId,
    ).toBe("inner-color");
  });

  it("returns undefined for unresolvable references", () => {
    expect(resolveStatusViewLabelPlace(sdcpn, "missing")).toBeUndefined();
    expect(
      resolveStatusViewLabelPlace(sdcpn, "missing-instance::shared-id"),
    ).toBeUndefined();
    expect(
      resolveStatusViewLabelPlace(sdcpn, "outer-1::missing-place"),
    ).toBeUndefined();
  });
});
