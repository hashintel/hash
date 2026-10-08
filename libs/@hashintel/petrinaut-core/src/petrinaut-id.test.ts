import { describe, expect, it } from "vitest";

import {
  canonicalizePetrinautIds,
  generatePetrinautId,
  isPetrinautId,
  toPetrinautId,
} from "./petrinaut-id";

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

describe("isPetrinautId", () => {
  it("accepts a lowercase UUID only", () => {
    expect(isPetrinautId("56c16f29-0b95-5de8-992d-54db5288e8c4")).toBe(true);
    expect(isPetrinautId("56C16F29-0B95-5DE8-992D-54DB5288E8C4")).toBe(false);
    expect(isPetrinautId("net-1")).toBe(false);
    expect(isPetrinautId(42)).toBe(false);
  });
});

describe("toPetrinautId", () => {
  it("lowercases a UUID", () => {
    expect(toPetrinautId("56C16F29-0B95-5DE8-992D-54DB5288E8C4")).toBe(
      "56c16f29-0b95-5de8-992d-54db5288e8c4",
    );
  });

  it("maps any other id to a fixed UUIDv5", () => {
    expect(toPetrinautId("net-1")).toBe("56c16f29-0b95-5de8-992d-54db5288e8c4");
    expect(toPetrinautId("subnet-1")).toBe(
      "55829d6f-6bb8-5023-9b4f-d7a16b751004",
    );
  });

  it("is idempotent", () => {
    for (const id of ["net-1", "subnet__x", "", generatePetrinautId()]) {
      expect(toPetrinautId(toPetrinautId(id))).toBe(toPetrinautId(id));
      expect(isPetrinautId(toPetrinautId(id))).toBe(true);
    }
  });
});

describe("generatePetrinautId", () => {
  it("returns a fresh Petrinaut id on each call", () => {
    const first = generatePetrinautId();
    const second = generatePetrinautId();
    expect(isPetrinautId(first)).toBe(true);
    expect(first).not.toBe(second);
  });
});

describe("canonicalizePetrinautIds", () => {
  it("rewrites subnet definitions together with their references", () => {
    const sdcpn: SDCPN = {
      ...emptyNet,
      subnets: [
        subnet("outer", [instance("nested", "inner")]),
        subnet("inner"),
      ],
      componentInstances: [instance("root", "outer")],
    };

    const canonical = canonicalizePetrinautIds(sdcpn);

    expect(canonical.subnets?.map(({ id }) => id)).toEqual([
      toPetrinautId("outer"),
      toPetrinautId("inner"),
    ]);
    expect(canonical.subnets?.[0]?.componentInstances?.[0]?.subnetId).toBe(
      toPetrinautId("inner"),
    );
    expect(canonical.componentInstances?.[0]?.subnetId).toBe(
      toPetrinautId("outer"),
    );
    expect(canonical.subnets?.[1]).not.toHaveProperty("componentInstances");
    expect(sdcpn.subnets?.[0]?.id).toBe("outer");
  });

  it("returns the same reference when every id is canonical", () => {
    const sdcpn = canonicalizePetrinautIds({
      ...emptyNet,
      subnets: [subnet("outer", [instance("nested", "inner")])],
      componentInstances: [instance("root", "outer")],
    });

    expect(canonicalizePetrinautIds(sdcpn)).toBe(sdcpn);
    expect(canonicalizePetrinautIds(emptyNet)).toBe(emptyNet);
  });
});
