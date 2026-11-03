import { describe, expect, it } from "vitest";

import {
  getPlaceDynamicsEquationIds,
  placeUsesDifferentialEquation,
  withoutDifferentialEquation,
} from "./place-dynamics";

import type { Place } from "./types/sdcpn";

const place = (fields: Partial<Place>): Place => ({
  id: "space",
  name: "Space",
  colorId: "satellite",
  dynamicsEnabled: true,
  differentialEquationId: null,
  x: 0,
  y: 0,
  ...fields,
});

describe("getPlaceDynamicsEquationIds", () => {
  it("lists the selected equation first, then the composed terms in order", () => {
    expect(
      getPlaceDynamicsEquationIds(
        place({
          differentialEquationId: "orbit",
          dynamics: [
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

  it("lists composed terms without a selected equation", () => {
    expect(
      getPlaceDynamicsEquationIds(
        place({ dynamics: [{ differentialEquationId: "pull" }] }),
      ),
    ).toEqual(["pull"]);
  });
});

describe("placeUsesDifferentialEquation", () => {
  it("finds an equation in either position", () => {
    const composed = place({
      differentialEquationId: "orbit",
      dynamics: [{ differentialEquationId: "pull" }],
    });
    expect(placeUsesDifferentialEquation(composed, "orbit")).toBe(true);
    expect(placeUsesDifferentialEquation(composed, "pull")).toBe(true);
    expect(placeUsesDifferentialEquation(composed, "drag")).toBe(false);
  });
});

describe("withoutDifferentialEquation", () => {
  it("returns the same place when nothing referenced the equation", () => {
    const source = place({ differentialEquationId: "orbit" });
    expect(withoutDifferentialEquation(source, "pull")).toBe(source);
  });

  it("clears the selected equation and keeps the composed terms", () => {
    const source = place({
      differentialEquationId: "orbit",
      dynamics: [{ differentialEquationId: "pull" }],
    });
    expect(withoutDifferentialEquation(source, "orbit")).toEqual(
      place({
        differentialEquationId: null,
        dynamics: [{ differentialEquationId: "pull" }],
      }),
    );
  });

  it("removes the composed terms that referenced the equation", () => {
    const source = place({
      differentialEquationId: "orbit",
      dynamics: [
        { differentialEquationId: "pull" },
        { differentialEquationId: "drag" },
      ],
    });
    expect(withoutDifferentialEquation(source, "pull")).toEqual(
      place({
        differentialEquationId: "orbit",
        dynamics: [{ differentialEquationId: "drag" }],
      }),
    );
  });

  it("never adds a dynamics key", () => {
    expect(
      withoutDifferentialEquation(
        place({ differentialEquationId: "orbit" }),
        "orbit",
      ),
    ).not.toHaveProperty("dynamics");
  });
});
