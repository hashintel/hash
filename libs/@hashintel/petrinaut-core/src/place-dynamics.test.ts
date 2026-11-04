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

describe("withoutDifferentialEquation", () => {
  it("returns the same place when nothing referenced the equation", () => {
    const source = place({ dynamics: [{ differentialEquationId: "orbit" }] });
    expect(withoutDifferentialEquation(source, "pull")).toBe(source);
    const bare = place({});
    expect(withoutDifferentialEquation(bare, "orbit")).toBe(bare);
  });

  it("removes every term that referenced the equation", () => {
    const source = place({
      dynamics: [
        { differentialEquationId: "orbit" },
        { differentialEquationId: "pull" },
        { differentialEquationId: "orbit" },
      ],
    });
    expect(withoutDifferentialEquation(source, "orbit")).toEqual(
      place({ dynamics: [{ differentialEquationId: "pull" }] }),
    );
  });

  it("leaves an empty list when the last term goes", () => {
    expect(
      withoutDifferentialEquation(
        place({ dynamics: [{ differentialEquationId: "orbit" }] }),
        "orbit",
      ),
    ).toEqual(place({ dynamics: [] }));
  });
});
