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
    expect(describeName("out_Launch_Air_0_arrival_time")?.what).toBe(
      "arrival_time of token 0 that Launch produces into Air",
    );
    expect(describeName("next_Hangar_2_present")).toMatchObject({
      what: "Hangar_2_present once the survivors closed up",
      source: { kind: "place", name: "Hangar" },
    });
  });

  it("reads the clock strategy's names and the bare time reference", () => {
    expect(describeName("t")).toEqual({
      what: "The time reference",
      why: "External and driven by nothing: a clock's flow is a rate against d(t), so a module that reads it awaits t.",
    });
    expect(describeName("clk_Birth")).toMatchObject({
      what: "Time left until Birth fires",
      source: { kind: "transition", name: "Birth" },
    });
    expect(describeName("ev_Death")).toMatchObject({
      what: "Toggles when Death fires",
      source: { kind: "transition", name: "Death" },
    });
    expect(describeName("pick_Go")).toEqual({
      what: "The environment lets Go fire this step",
      why: "An input nothing drives: any resolution of the conflict is a run, and a proof ranges over all of them.",
      source: { kind: "transition", name: "Go" },
    });
    expect(describeName("fires_Birth")).toEqual({
      what: "Birth's clock ran out and its arcs allow it",
      source: { kind: "transition", name: "Birth" },
    });
    expect(describeName("fired_Death")).toMatchObject({
      what: "Death fired this step",
      source: { kind: "transition", name: "Death" },
    });
    expect(describeName("e_Go")?.what).toBe(
      "Exponential draw for Go's token-dependent rate",
    );
  });

  it("returns null for a name the lowerings do not coin", () => {
    expect(describeName("Waiting")).toBeNull();
    expect(describeName("net")).toBeNull();
  });
});
