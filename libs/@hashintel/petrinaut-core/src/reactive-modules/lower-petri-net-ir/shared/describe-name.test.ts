import { describe, expect, it } from "vitest";

import { describeName } from "./describe-name";

describe("describeName", () => {
  it("reads the coined prefixes back into words with their item", () => {
    expect(describeName("fire_Go")).toMatchObject({
      what: "Go fires this step",
      source: { kind: "transition", name: "Go" },
    });
    expect(describeName("avail_Pool")).toMatchObject({
      what: "Pool's tokens after the transitions swept so far",
      source: { kind: "place", name: "Pool" },
    });
    expect(describeName("take_Launch_Hangar_2")).toMatchObject({
      what: "Launch takes the token in slot 2 of Hangar",
      source: { kind: "transition", name: "Launch" },
    });
    expect(describeName("out_Launch_Air_0_battery")).toMatchObject({
      what: "battery of token 0 that Launch produces into Air",
    });
    expect(describeName("Hangar_1_present")).toMatchObject({
      what: "Slot 1 of Hangar holds a token",
      source: { kind: "place", name: "Hangar" },
    });
    expect(describeName("Hangar_1_battery")).toMatchObject({
      what: "battery of the token in slot 1 of Hangar",
    });
    expect(describeName("z_Launch_0")?.what).toBe(
      "Gaussian draw 0 of Launch's kernel",
    );
  });

  it("returns null for a name the lowerings do not coin", () => {
    expect(describeName("Waiting")).toBeNull();
    expect(describeName("net")).toBeNull();
  });
});
