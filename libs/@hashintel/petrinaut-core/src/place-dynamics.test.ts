import { describe, expect, it } from "vitest";

import {
  getPlaceDynamicsEquationIds,
  placeUsesDifferentialEquation,
  remapPlaceDynamics,
  withoutDifferentialEquations,
} from "./place-dynamics";

import type { Place } from "./types/sdcpn";

const place = (fields: Partial<Place>): Place => ({
  id: "space",
  name: "Space",
  colorId: "satellite",
  dynamicsEnabled: true,
  x: 0,
  y: 0,
  ...fields,
});

describe("getPlaceDynamicsEquationIds", () => {
  it("lists the composed equations in order", () => {
    expect(
      getPlaceDynamicsEquationIds(
        place({
          dynamics: [
            { differentialEquationId: "orbit" },
            { differentialEquationId: "pull" },
            { differentialEquationId: "drag" },
          ],
        }),
      ),
    ).toEqual(["orbit", "pull", "drag"]);
  });

  it("is empty for a place without equations", () => {
    expect(getPlaceDynamicsEquationIds(place({}))).toEqual([]);
    expect(getPlaceDynamicsEquationIds(place({ dynamics: [] }))).toEqual([]);
  });
});

describe("placeUsesDifferentialEquation", () => {
  it("finds an equation anywhere in the list", () => {
    const composed = place({
      dynamics: [
        { differentialEquationId: "orbit" },
        { differentialEquationId: "pull" },
      ],
    });
    expect(placeUsesDifferentialEquation(composed, "orbit")).toBe(true);
    expect(placeUsesDifferentialEquation(composed, "pull")).toBe(true);
    expect(placeUsesDifferentialEquation(composed, "drag")).toBe(false);
    expect(placeUsesDifferentialEquation(place({}), "orbit")).toBe(false);
  });
});

describe("withoutDifferentialEquations", () => {
  it("returns the same place when nothing referenced the equations", () => {
    const source = place({ dynamics: [{ differentialEquationId: "orbit" }] });
    expect(withoutDifferentialEquations(source, new Set(["pull"]))).toBe(
      source,
    );
    expect(withoutDifferentialEquations(source, new Set())).toBe(source);
    const bare = place({});
    expect(withoutDifferentialEquations(bare, new Set(["orbit"]))).toBe(bare);
  });

  it("removes every term that referenced the equation", () => {
    const source = place({
      dynamics: [
        { differentialEquationId: "orbit" },
        { differentialEquationId: "pull" },
        { differentialEquationId: "orbit" },
      ],
    });
    expect(withoutDifferentialEquations(source, new Set(["orbit"]))).toEqual(
      place({ dynamics: [{ differentialEquationId: "pull" }] }),
    );
  });

  it("removes the terms of several equations at once", () => {
    const source = place({
      dynamics: [
        { differentialEquationId: "orbit" },
        { differentialEquationId: "pull" },
        { differentialEquationId: "drag" },
      ],
    });
    expect(
      withoutDifferentialEquations(source, new Set(["orbit", "drag"])),
    ).toEqual(place({ dynamics: [{ differentialEquationId: "pull" }] }));
  });

  it("leaves an empty list when the last term goes", () => {
    expect(
      withoutDifferentialEquations(
        place({ dynamics: [{ differentialEquationId: "orbit" }] }),
        new Set(["orbit"]),
      ),
    ).toEqual(place({ dynamics: [] }));
  });
});

describe("remapPlaceDynamics", () => {
  it("passes every equation id through the map, in order", () => {
    expect(
      remapPlaceDynamics(
        place({
          dynamics: [
            { differentialEquationId: "orbit" },
            { differentialEquationId: "pull" },
          ],
        }),
        (equationId) => `copy-${equationId}`,
      ),
    ).toEqual({
      dynamics: [
        { differentialEquationId: "copy-orbit" },
        { differentialEquationId: "copy-pull" },
      ],
    });
  });

  it("adds no key to a place without dynamics", () => {
    expect(remapPlaceDynamics(place({}), (equationId) => equationId)).toEqual(
      {},
    );
  });
});
