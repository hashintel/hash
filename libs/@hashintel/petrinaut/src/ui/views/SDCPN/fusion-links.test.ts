import { describe, expect, it } from "vitest";

import {
  fusionLinks,
  fusionStatuses,
  planFusion,
  planRewire,
} from "./fusion-links";

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";
import type { Fusion, FusionMember, SDCPN } from "@hashintel/petrinaut-core";

const place = (placeId: string): FusionMember => ({ kind: "place", placeId });
const port = (
  componentInstanceId: string,
  portPlaceId = "in",
): FusionMember => ({
  kind: "componentPort",
  componentInstanceId,
  portPlaceId,
});

const fusion = (id: string, ...members: FusionMember[]): Fusion => ({
  id,
  members,
});

describe("fusionLinks", () => {
  it("links every other member to the anchor, wherever the anchor is listed", () => {
    const links = fusionLinks(
      fusion("f", port("m1"), place("buffer"), port("m2")),
    );

    expect(links.map(({ hub, member }) => [hub, member])).toEqual([
      [place("buffer"), port("m1")],
      [place("buffer"), port("m2")],
    ]);
    expect(new Set(links.map(({ id }) => id)).size).toBe(2);
  });

  it("takes the first port as the hub of a fusion with no anchor", () => {
    expect(
      fusionLinks(fusion("f", port("m1"), port("m2"))).map(({ hub }) => hub),
    ).toEqual([port("m1")]);
  });

  it("draws nothing for a fusion with no member", () => {
    expect(fusionLinks(fusion("f"))).toEqual([]);
  });
});

describe("fusionStatuses", () => {
  const sdcpn: SDCPN = {
    places: [
      {
        id: "buffer",
        name: "Buffer",
        colorId: null,
        dynamicsEnabled: false,
        x: 0,
        y: 0,
      },
    ],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
    subnets: [
      {
        id: "stage",
        name: "Stage",
        places: [
          {
            id: "in",
            name: "In",
            colorId: "part",
            dynamicsEnabled: false,
            isPort: true,
            x: 0,
            y: 0,
          },
        ],
        transitions: [],
        types: [
          {
            id: "part",
            name: "Part",
            iconSlug: "circle",
            displayColor: "#000",
            elements: [{ elementId: "w", name: "weight", type: "real" }],
          },
        ],
        differentialEquations: [],
        parameters: [],
      },
    ],
    componentInstances: [
      {
        id: "m1",
        name: "M1",
        subnetId: "stage",
        parameterValues: {},
        x: 0,
        y: 0,
      },
      {
        id: "m2",
        name: "M2",
        subnetId: "stage",
        parameterValues: {},
        x: 0,
        y: 0,
      },
      {
        id: "m3",
        name: "M3",
        subnetId: "stage",
        parameterValues: {},
        x: 0,
        y: 0,
      },
    ],
    fusions: [
      { ...fusion("mismatch", place("buffer"), port("m1")), name: "Belt" },
      fusion("ports", port("m2"), port("m3")),
    ],
  };
  const net: ActiveNetDefinition = {
    ...sdcpn,
    componentInstances: sdcpn.componentInstances ?? [],
    fusions: sdcpn.fusions ?? [],
  };

  it("gives each fusion its name and the worst of its problems", () => {
    const statuses = fusionStatuses(sdcpn, net, null);

    expect(statuses.get("mismatch")).toEqual({
      name: "Belt",
      severity: "error",
    });
    // Two ports no transition touches: nothing to report.
    expect(statuses.get("ports")).toEqual({ name: "M2.In", severity: null });
  });
});

describe("planFusion", () => {
  const net = (...fusions: Fusion[]) => ({ fusions });

  it("starts a fusion between two places that are in none", () => {
    expect(planFusion(net(), place("buffer"), port("m1"))).toEqual({
      kind: "new",
      members: [place("buffer"), port("m1")],
    });
  });

  it("adds the free end to the fusion the other end is in", () => {
    const fusions = net(fusion("f", port("m1"), port("m2")));

    expect(planFusion(fusions, port("m1"), port("m3"))).toEqual({
      kind: "join",
      fusionId: "f",
      member: port("m3"),
    });
    expect(planFusion(fusions, place("buffer"), port("m2"))).toEqual({
      kind: "join",
      fusionId: "f",
      member: place("buffer"),
    });
  });

  it("joins the first end's fusion when both ends are fused, leaving the merge to the mutation", () => {
    const fusions = net(
      fusion("f", port("m1"), port("m2")),
      fusion("g", port("m3"), port("m4")),
    );

    expect(planFusion(fusions, port("m2"), port("m3"))).toEqual({
      kind: "join",
      fusionId: "f",
      member: port("m3"),
    });
  });

  it("refuses a join that would put two places of the net in one fusion", () => {
    const fusions = net(
      fusion("f", place("buffer"), port("m1")),
      fusion("g", place("store"), port("m2")),
    );

    expect(planFusion(fusions, place("store"), port("m1"))).toEqual({
      kind: "refused",
    });
    expect(planFusion(fusions, port("m1"), port("m2"))).toEqual({
      kind: "refused",
    });
    // The fusion's own anchor is no second place.
    expect(planFusion(fusions, place("buffer"), port("m3"))).toMatchObject({
      kind: "join",
      fusionId: "f",
    });
  });
});

describe("planRewire", () => {
  const belt = fusion("belt", place("buffer"), port("m1"));
  const net = (...others: Fusion[]) => ({ fusions: [belt, ...others] });

  it("moves the fusion from the member to a free port or place", () => {
    expect(planRewire(net(), belt, port("m1"), port("m2"))).toEqual({
      kind: "replace",
      fusionId: "belt",
      member: port("m1"),
      replacement: port("m2"),
    });
    // The anchor itself gives way to another place.
    expect(planRewire(net(), belt, place("buffer"), place("store"))).toEqual({
      kind: "replace",
      fusionId: "belt",
      member: place("buffer"),
      replacement: place("store"),
    });
  });

  it("takes the member out when its end is dropped on the empty canvas", () => {
    expect(planRewire(net(), belt, port("m1"), null)).toEqual({
      kind: "detach",
      fusionId: "belt",
      member: port("m1"),
    });
  });

  it("does nothing when the end lands on the fusion itself", () => {
    expect(planRewire(net(), belt, port("m1"), place("buffer"))).toEqual({
      kind: "none",
    });
    expect(planRewire(net(), belt, port("m1"), port("m1"))).toEqual({
      kind: "none",
    });
  });

  it("refuses a second place of the net, its own or another fusion's", () => {
    const stock = fusion("stock", place("store"), port("m2"));

    expect(planRewire(net(), belt, port("m1"), place("store"))).toEqual({
      kind: "refused",
    });
    expect(planRewire(net(stock), belt, port("m1"), port("m2"))).toEqual({
      kind: "refused",
    });
    // With the anchor the end that moves, the other fusion's place takes over.
    expect(
      planRewire(net(stock), belt, place("buffer"), port("m2")),
    ).toMatchObject({ kind: "replace", replacement: port("m2") });
  });
});
