import { describe, expect, it } from "vitest";

import { canonicalizeNetIds, generateNetId, isNetId, toNetId } from "./net-id";

import type { ComponentInstance, SDCPN, Subnet } from "./types/sdcpn";

const emptyNet = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
} satisfies SDCPN;

const instance = (id: string, subnetId: string): ComponentInstance => ({
  id,
  name: id,
  subnetId,
  parameterValues: {},
  x: 0,
  y: 0,
});

const subnet = (
  id: string,
  componentInstances?: ComponentInstance[],
): Subnet => ({
  ...emptyNet,
  id,
  name: id,
  ...(componentInstances && { componentInstances }),
});

describe("isNetId", () => {
  it("accepts a lowercase UUID only", () => {
    expect(isNetId("56c16f29-0b95-5de8-992d-54db5288e8c4")).toBe(true);
    expect(isNetId("56C16F29-0B95-5DE8-992D-54DB5288E8C4")).toBe(false);
    expect(isNetId("net-1")).toBe(false);
    expect(isNetId(42)).toBe(false);
  });
});

describe("toNetId", () => {
  it("lowercases a UUID", () => {
    expect(toNetId("56C16F29-0B95-5DE8-992D-54DB5288E8C4")).toBe(
      "56c16f29-0b95-5de8-992d-54db5288e8c4",
    );
  });

  it("maps any other id to a fixed UUIDv5", () => {
    expect(toNetId("net-1")).toBe("56c16f29-0b95-5de8-992d-54db5288e8c4");
    expect(toNetId("subnet-1")).toBe("55829d6f-6bb8-5023-9b4f-d7a16b751004");
    expect(toNetId("net-1")[14]).toBe("5");
  });

  it("is idempotent", () => {
    for (const id of ["net-1", "subnet__x", "", generateNetId()]) {
      expect(toNetId(toNetId(id))).toBe(toNetId(id));
      expect(isNetId(toNetId(id))).toBe(true);
    }
  });
});

describe("generateNetId", () => {
  it("returns distinct net ids", () => {
    const first = generateNetId();
    const second = generateNetId();
    expect(isNetId(first)).toBe(true);
    expect(first).not.toBe(second);
  });
});

describe("canonicalizeNetIds", () => {
  it("rewrites subnet definitions together with their references", () => {
    const sdcpn: SDCPN = {
      ...emptyNet,
      subnets: [
        subnet("outer", [instance("nested", "inner")]),
        subnet("inner"),
      ],
      componentInstances: [instance("root", "outer")],
    };

    const canonical = canonicalizeNetIds(sdcpn);

    expect(canonical.subnets?.map(({ id }) => id)).toEqual([
      toNetId("outer"),
      toNetId("inner"),
    ]);
    expect(canonical.subnets?.[0]?.componentInstances?.[0]?.subnetId).toBe(
      toNetId("inner"),
    );
    expect(canonical.componentInstances?.[0]?.subnetId).toBe(toNetId("outer"));
    expect(canonical.subnets?.[1]).not.toHaveProperty("componentInstances");
    expect(sdcpn.subnets?.[0]?.id).toBe("outer");
  });

  it("returns the same reference when every id is canonical", () => {
    const sdcpn = canonicalizeNetIds({
      ...emptyNet,
      subnets: [subnet("outer", [instance("nested", "inner")])],
      componentInstances: [instance("root", "outer")],
    });

    expect(canonicalizeNetIds(sdcpn)).toBe(sdcpn);
    expect(canonicalizeNetIds(emptyNet)).toBe(emptyNet);
  });
});
