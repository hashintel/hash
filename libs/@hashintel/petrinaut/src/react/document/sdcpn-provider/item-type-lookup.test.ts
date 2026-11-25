import { describe, expect, it } from "vitest";

import {
  ARC_ID_PREFIX,
  DEFAULT_PETRINAUT_EXTENSIONS,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { createItemTypeLookup } from "./item-type-lookup";

// The lookup reads ids only.
const definition = {
  places: [{ id: "place" }, { id: "shared" }],
  transitions: [{ id: "transition" }],
  types: [{ id: "type" }],
  parameters: [{ id: "parameter" }],
  differentialEquations: [{ id: "equation" }],
  componentInstances: [{ id: "instance" }],
  fusions: [{ id: "fusion" }],
  metrics: [{ id: "metric" }],
  components: [
    {
      places: [{ id: "component-place" }],
      transitions: [],
      types: [{ id: "shared" }],
      parameters: [],
      differentialEquations: [],
    },
  ],
} as unknown as SDCPN;

describe("createItemTypeLookup", () => {
  it("names the kind of each item of the root net and its components", () => {
    const getItemType = createItemTypeLookup(
      definition,
      DEFAULT_PETRINAUT_EXTENSIONS,
    );
    expect(
      [
        "place",
        "transition",
        "type",
        "parameter",
        "equation",
        "instance",
        "fusion",
        "metric",
        "component-place",
        `${ARC_ID_PREFIX}anything`,
        "missing",
      ].map(getItemType),
    ).toEqual([
      "place",
      "transition",
      "type",
      "parameter",
      "differentialEquation",
      "componentInstance",
      "fusion",
      "metric",
      "place",
      "arc",
      null,
    ]);
  });

  it("reads an id two lists hold as a type before a place, in whichever net", () => {
    expect(
      createItemTypeLookup(definition, DEFAULT_PETRINAUT_EXTENSIONS)("shared"),
    ).toBe("type");
  });

  it("leaves out the items of an extension that is off, except instances", () => {
    const getItemType = createItemTypeLookup(definition, {
      colors: false,
      stochasticity: false,
      dynamics: false,
      parameters: false,
      components: false,
    });
    expect(
      ["type", "parameter", "equation", "fusion", "instance", "shared"].map(
        getItemType,
      ),
    ).toEqual([null, null, null, null, "componentInstance", "place"]);
  });
});
