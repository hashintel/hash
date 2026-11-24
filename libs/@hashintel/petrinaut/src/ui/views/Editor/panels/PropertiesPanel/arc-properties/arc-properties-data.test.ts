import { describe, expect, it } from "vitest";

import { generateArcId, getArcEndpointKey } from "@hashintel/petrinaut-core";

import { arcPropertiesData } from "./arc-properties-data";

import type { ArcEndpoint, Place, SDCPN } from "@hashintel/petrinaut-core";

const place = (id: string, name: string): Place => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
});

const port = (
  componentInstanceId: string,
  portPlaceId: string,
): ArcEndpoint => ({
  kind: "componentPort",
  componentInstanceId,
  portPlaceId,
});

const sdcpn: SDCPN = {
  places: [place("buffer", "Buffer")],
  transitions: [
    {
      id: "assemble",
      name: "Assemble",
      inputArcs: [{ placeId: "buffer", weight: 2, type: "read" }],
      outputArcs: [{ endpoint: port("m1", "in"), weight: 3 }],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
  components: [
    {
      id: "bench",
      name: "Bench",
      places: [{ ...place("in", "In"), isPort: true }],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    },
  ],
  componentInstances: [
    {
      id: "m1",
      name: "Machine",
      component: { id: "bench" },
      parameterValues: {},
      x: 0,
      y: 0,
    },
  ],
};

const arcBetween = (inputId: string, outputId: string) =>
  arcPropertiesData(
    generateArcId({ inputId, outputId }),
    sdcpn,
    sdcpn,
    new Map(),
  );

describe("what an arc's panel shows", () => {
  it("names the place and the transition of an input arc, with its weight and type", () => {
    expect(arcBetween("buffer", "assemble")).toMatchObject({
      arcDirection: "input",
      sourceName: "Buffer",
      targetName: "Assemble",
      weight: 2,
      type: "read",
    });
  });

  it("names the instance and the port of an arc to a port", () => {
    expect(
      arcBetween("assemble", getArcEndpointKey(port("m1", "in"))),
    ).toMatchObject({
      arcDirection: "output",
      sourceName: "Assemble",
      targetName: "Machine.In",
      weight: 3,
      type: "standard",
    });
  });

  it.each([
    [port("m1", "gone"), "Machine.Unknown port"],
    [port("gone", "in"), "Unknown component.Unknown port"],
  ])("says which part of a port it cannot find", (endpoint, targetName) => {
    expect(
      arcBetween("assemble", getArcEndpointKey(endpoint))?.targetName,
    ).toBe(targetName);
  });

  it("has nothing to show for an id that is not an arc's, or an end the net lacks", () => {
    expect(arcPropertiesData("buffer", sdcpn, sdcpn, new Map())).toBeNull();
    expect(arcBetween("gone", "assemble")).toBeNull();
  });
});
