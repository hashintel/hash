import { describe, expect, it } from "vitest";

import type { SDCPN } from "../core/types/sdcpn";
import { pastePayloadIntoSDCPN } from "./paste";
import type { ClipboardPayload } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyNet(): SDCPN {
  return {
    places: [],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
  };
}

function makePayload(
  data: Partial<ClipboardPayload["data"]>,
  documentId: string | null = null,
): ClipboardPayload {
  return {
    format: "petrinaut-sdcpn",
    version: 1,
    documentId,
    data: {
      places: [],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
      ...data,
    },
  };
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

describe("paste — ID generation", () => {
  it("assigns new IDs to pasted places", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      places: [
        {
          id: "place__old",
          name: "Place1",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
    });

    const { newItemIds } = pastePayloadIntoSDCPN(sdcpn, payload);

    expect(sdcpn.places).toHaveLength(1);
    expect(sdcpn.places[0]!.id).not.toBe("place__old");
    expect(sdcpn.places[0]!.id).toMatch(/^place__/);
    expect(newItemIds).toHaveLength(1);
    expect(newItemIds[0]!.type).toBe("place");
    expect(newItemIds[0]!.id).toBe(sdcpn.places[0]!.id);
  });

  it("assigns new IDs to pasted transitions", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      transitions: [
        {
          id: "transition__old",
          name: "T1",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);

    expect(sdcpn.transitions[0]!.id).not.toBe("transition__old");
    expect(sdcpn.transitions[0]!.id).toMatch(/^transition__/);
  });

  it("assigns new IDs to pasted types and their elements", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      types: [
        {
          id: "old-type-id",
          name: "Token",
          iconSlug: "circle",
          displayColor: "#FF0000",
          elements: [{ elementId: "old-el-id", name: "val", type: "real" }],
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);

    expect(sdcpn.types[0]!.id).not.toBe("old-type-id");
    expect(sdcpn.types[0]!.elements[0]!.elementId).not.toBe("old-el-id");
  });

  it("assigns new IDs to pasted differential equations", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      differentialEquations: [
        { id: "old-de", name: "Eq1", colorId: "some-color", code: "dx = 1;" },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);

    expect(sdcpn.differentialEquations[0]!.id).not.toBe("old-de");
  });

  it("assigns new IDs to pasted parameters", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      parameters: [
        {
          id: "old-param",
          name: "Rate",
          variableName: "rate",
          type: "real",
          defaultValue: "1.0",
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);

    expect(sdcpn.parameters[0]!.id).not.toBe("old-param");
  });
});

// ---------------------------------------------------------------------------
// Name deduplication
// ---------------------------------------------------------------------------

describe("paste — name deduplication", () => {
  it("keeps original name when no conflict", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      places: [
        {
          id: "p1",
          name: "Place1",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);
    expect(sdcpn.places[0]!.name).toBe("Place1");
  });

  it("renames a place when the name already exists", () => {
    const sdcpn = emptyNet();
    sdcpn.places.push({
      id: "existing",
      name: "Place1",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    });

    const payload = makePayload({
      places: [
        {
          id: "p1",
          name: "Place1",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);
    expect(sdcpn.places[1]!.name).toBe("Place2");
  });

  it("renames a transition when the name already exists", () => {
    const sdcpn = emptyNet();
    sdcpn.transitions.push({
      id: "existing",
      name: "T1",
      inputArcs: [],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    });

    const payload = makePayload({
      transitions: [
        {
          id: "t1",
          name: "T1",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);
    expect(sdcpn.transitions[1]!.name).toBe("T2");
  });

  it("renames a type when the name already exists", () => {
    const sdcpn = emptyNet();
    sdcpn.types.push({
      id: "existing",
      name: "Token",
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [],
    });

    const payload = makePayload({
      types: [
        {
          id: "c1",
          name: "Token",
          iconSlug: "circle",
          displayColor: "#FF0000",
          elements: [],
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);
    expect(sdcpn.types[1]!.name).toBe("Token2");
  });

  it("renames a differential equation when the name already exists", () => {
    const sdcpn = emptyNet();
    sdcpn.differentialEquations.push({
      id: "existing",
      name: "Eq1",
      colorId: "c1",
      code: "",
    });

    const payload = makePayload({
      differentialEquations: [
        { id: "de1", name: "Eq1", colorId: "c1", code: "" },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);
    expect(sdcpn.differentialEquations[1]!.name).toBe("Eq2");
  });

  it("renames parameter name and variableName independently", () => {
    const sdcpn = emptyNet();
    sdcpn.parameters.push({
      id: "existing",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1.0",
    });

    const payload = makePayload({
      parameters: [
        {
          id: "p1",
          name: "Rate",
          variableName: "rate",
          type: "real",
          defaultValue: "1.0",
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);
    expect(sdcpn.parameters[1]!.name).toBe("Rate2");
    expect(sdcpn.parameters[1]!.variableName).toBe("rate2");
  });

  it("deduplicates across multiple pasted items with the same name", () => {
    const sdcpn = emptyNet();
    sdcpn.places.push({
      id: "existing",
      name: "Place1",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    });

    const payload = makePayload({
      places: [
        {
          id: "p1",
          name: "Place1",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
        {
          id: "p2",
          name: "Place1",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 100,
          y: 100,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);
    expect(sdcpn.places[1]!.name).toBe("Place2");
    expect(sdcpn.places[2]!.name).toBe("Place3");
  });
});

// ---------------------------------------------------------------------------
// Position offset
// ---------------------------------------------------------------------------

describe("paste — position offset", () => {
  it("offsets pasted places by 50px", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      places: [
        {
          id: "p1",
          name: "P",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 100,
          y: 200,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);
    expect(sdcpn.places[0]!.x).toBe(150);
    expect(sdcpn.places[0]!.y).toBe(250);
  });

  it("offsets pasted transitions by 50px", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      transitions: [
        {
          id: "t1",
          name: "T",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);
    expect(sdcpn.transitions[0]!.x).toBe(50);
    expect(sdcpn.transitions[0]!.y).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Arc remapping
// ---------------------------------------------------------------------------

describe("paste — arc remapping", () => {
  it("remaps arc placeIds to the new place IDs", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      places: [
        {
          id: "place__old-p1",
          name: "P1",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "transition__old-t1",
          name: "T1",
          inputArcs: [
            { placeId: "place__old-p1", weight: 3, type: "standard" },
          ],
          outputArcs: [{ placeId: "place__old-p1", weight: 1 }],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);

    const newPlaceId = sdcpn.places[0]!.id;
    const transition = sdcpn.transitions[0]!;
    expect(transition.inputArcs[0]!.placeId).toBe(newPlaceId);
    expect(transition.outputArcs[0]!.placeId).toBe(newPlaceId);
    // Weight is preserved
    expect(transition.inputArcs[0]!.weight).toBe(3);
    expect(transition.outputArcs[0]!.weight).toBe(1);
  });

  it("drops arcs whose target place was not in the payload", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      transitions: [
        {
          id: "transition__old",
          name: "T1",
          inputArcs: [
            { placeId: "place__missing", weight: 1, type: "standard" },
          ],
          outputArcs: [{ placeId: "place__missing", weight: 1 }],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);

    expect(sdcpn.transitions[0]!.inputArcs).toHaveLength(0);
    expect(sdcpn.transitions[0]!.outputArcs).toHaveLength(0);
  });

  it("keeps arcs to included places and drops arcs to excluded places", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      places: [
        {
          id: "place__included",
          name: "P1",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "transition__t1",
          name: "T1",
          inputArcs: [
            { placeId: "place__included", weight: 1, type: "standard" },
            { placeId: "place__excluded", weight: 2, type: "standard" },
          ],
          outputArcs: [{ placeId: "place__excluded", weight: 1 }],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);

    const transition = sdcpn.transitions[0]!;
    expect(transition.inputArcs).toHaveLength(1);
    expect(transition.outputArcs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Reference remapping (colorId, differentialEquationId)
// ---------------------------------------------------------------------------

describe("paste — reference remapping", () => {
  it("remaps place.colorId when the type was also pasted", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      types: [
        {
          id: "old-type",
          name: "Token",
          iconSlug: "circle",
          displayColor: "#FF0000",
          elements: [],
        },
      ],
      places: [
        {
          id: "place__p1",
          name: "P1",
          colorId: "old-type",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);

    const newTypeId = sdcpn.types[0]!.id;
    expect(sdcpn.places[0]!.colorId).toBe(newTypeId);
  });

  it("preserves place.colorId when the type was NOT pasted", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      places: [
        {
          id: "place__p1",
          name: "P1",
          colorId: "external-type-id",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);
    expect(sdcpn.places[0]!.colorId).toBe("external-type-id");
  });

  it("preserves null colorId", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      places: [
        {
          id: "place__p1",
          name: "P1",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);
    expect(sdcpn.places[0]!.colorId).toBeNull();
  });

  it("remaps place.differentialEquationId when the equation was also pasted", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      differentialEquations: [
        { id: "old-de", name: "Eq1", colorId: "c1", code: "dx = 1;" },
      ],
      places: [
        {
          id: "place__p1",
          name: "P1",
          colorId: null,
          dynamicsEnabled: true,
          differentialEquationId: "old-de",
          x: 0,
          y: 0,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);

    const newDeId = sdcpn.differentialEquations[0]!.id;
    expect(sdcpn.places[0]!.differentialEquationId).toBe(newDeId);
  });

  it("preserves place.differentialEquationId when the equation was NOT pasted", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      places: [
        {
          id: "place__p1",
          name: "P1",
          colorId: null,
          dynamicsEnabled: true,
          differentialEquationId: "external-de-id",
          x: 0,
          y: 0,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);
    expect(sdcpn.places[0]!.differentialEquationId).toBe("external-de-id");
  });

  it("remaps differentialEquation.colorId when the type was also pasted", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      types: [
        {
          id: "old-type",
          name: "Token",
          iconSlug: "circle",
          displayColor: "#FF0000",
          elements: [],
        },
      ],
      differentialEquations: [
        { id: "old-de", name: "Eq1", colorId: "old-type", code: "" },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);

    const newTypeId = sdcpn.types[0]!.id;
    expect(sdcpn.differentialEquations[0]!.colorId).toBe(newTypeId);
  });

  it("preserves differentialEquation.colorId when the type was NOT pasted", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      differentialEquations: [
        {
          id: "old-de",
          name: "Eq1",
          colorId: "external-type",
          code: "",
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);
    expect(sdcpn.differentialEquations[0]!.colorId).toBe("external-type");
  });
});

// ---------------------------------------------------------------------------
// Empty payload
// ---------------------------------------------------------------------------

describe("paste — empty payload", () => {
  it("does nothing when the payload is empty", () => {
    const sdcpn = emptyNet();
    sdcpn.places.push({
      id: "existing",
      name: "P1",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    });

    const { newItemIds } = pastePayloadIntoSDCPN(sdcpn, makePayload({}));

    expect(newItemIds).toHaveLength(0);
    expect(sdcpn.places).toHaveLength(1); // unchanged
  });
});

// ---------------------------------------------------------------------------
// Return value (newItemIds)
// ---------------------------------------------------------------------------

describe("paste — newItemIds return value", () => {
  it("returns one entry per pasted item with correct types", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      places: [
        {
          id: "p1",
          name: "P1",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "t1",
          name: "T1",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
      ],
      types: [
        {
          id: "c1",
          name: "Token",
          iconSlug: "circle",
          displayColor: "#FF0000",
          elements: [],
        },
      ],
      differentialEquations: [
        { id: "de1", name: "Eq1", colorId: "c1", code: "" },
      ],
      parameters: [
        {
          id: "param1",
          name: "Rate",
          variableName: "rate",
          type: "real",
          defaultValue: "1.0",
        },
      ],
    });

    const { newItemIds } = pastePayloadIntoSDCPN(sdcpn, payload);

    expect(newItemIds).toHaveLength(5);

    const types = new Set(newItemIds.map((item) => item.type));
    expect(types).toContain("place");
    expect(types).toContain("transition");
    expect(types).toContain("type");
    expect(types).toContain("differentialEquation");
    expect(types).toContain("parameter");

    // All IDs should be the new IDs, not the old ones
    const returnedIds = new Set(newItemIds.map((item) => item.id));
    expect(returnedIds.has("p1")).toBe(false);
    expect(returnedIds.has("t1")).toBe(false);
    expect(returnedIds.has("c1")).toBe(false);
    expect(returnedIds.has("de1")).toBe(false);
    expect(returnedIds.has("param1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Data preservation
// ---------------------------------------------------------------------------

describe("paste — data preservation", () => {
  it("preserves all place fields besides id, name, and position", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      places: [
        {
          id: "p1",
          name: "P1",
          colorId: "external-color",
          dynamicsEnabled: true,
          differentialEquationId: "external-de",
          visualizerCode: "console.log('hi')",
          x: 10,
          y: 20,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);

    const place = sdcpn.places[0]!;
    expect(place.colorId).toBe("external-color");
    expect(place.dynamicsEnabled).toBe(true);
    expect(place.differentialEquationId).toBe("external-de");
    expect(place.visualizerCode).toBe("console.log('hi')");
  });

  it("preserves all transition fields besides id, name, position, and arcs", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      transitions: [
        {
          id: "t1",
          name: "T1",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "stochastic",
          lambdaCode: "return 0.5;",
          transitionKernelCode: "return output;",
          x: 10,
          y: 20,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);

    const transition = sdcpn.transitions[0]!;
    expect(transition.lambdaType).toBe("stochastic");
    expect(transition.lambdaCode).toBe("return 0.5;");
    expect(transition.transitionKernelCode).toBe("return output;");
  });

  it("preserves all type fields besides id and name", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      types: [
        {
          id: "c1",
          name: "Token",
          iconSlug: "square",
          displayColor: "#00FF00",
          elements: [
            { elementId: "e1", name: "count", type: "integer" },
            { elementId: "e2", name: "active", type: "boolean" },
          ],
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);

    const type = sdcpn.types[0]!;
    expect(type.iconSlug).toBe("square");
    expect(type.displayColor).toBe("#00FF00");
    expect(type.elements).toHaveLength(2);
    expect(type.elements[0]!.name).toBe("count");
    expect(type.elements[0]!.type).toBe("integer");
    expect(type.elements[1]!.name).toBe("active");
    expect(type.elements[1]!.type).toBe("boolean");
  });

  it("preserves parameter fields besides id, name, and variableName", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      parameters: [
        {
          id: "param1",
          name: "Threshold",
          variableName: "threshold",
          type: "integer",
          defaultValue: "42",
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);

    const param = sdcpn.parameters[0]!;
    expect(param.type).toBe("integer");
    expect(param.defaultValue).toBe("42");
  });

  it("preserves differential equation code", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      differentialEquations: [
        { id: "de1", name: "Eq1", colorId: "c1", code: "dx = -k * x;" },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);
    expect(sdcpn.differentialEquations[0]!.code).toBe("dx = -k * x;");
  });
});

// ---------------------------------------------------------------------------
// Paste into non-empty net (integration)
// ---------------------------------------------------------------------------

describe("paste — integration with existing data", () => {
  it("does not modify existing items in the SDCPN", () => {
    const sdcpn = emptyNet();
    sdcpn.places.push({
      id: "existing-place",
      name: "ExistingPlace",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 100,
      y: 100,
    });

    const payload = makePayload({
      places: [
        {
          id: "p1",
          name: "NewPlace",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);

    expect(sdcpn.places).toHaveLength(2);
    expect(sdcpn.places[0]!.id).toBe("existing-place");
    expect(sdcpn.places[0]!.name).toBe("ExistingPlace");
    expect(sdcpn.places[0]!.x).toBe(100);
  });

  it("handles pasting the same payload twice (double-paste)", () => {
    const sdcpn = emptyNet();
    const payload = makePayload({
      places: [
        {
          id: "p1",
          name: "Place1",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
    });

    pastePayloadIntoSDCPN(sdcpn, payload);
    pastePayloadIntoSDCPN(sdcpn, payload);

    expect(sdcpn.places).toHaveLength(2);
    expect(sdcpn.places[0]!.name).toBe("Place1");
    expect(sdcpn.places[1]!.name).toBe("Place2");
    expect(sdcpn.places[0]!.id).not.toBe(sdcpn.places[1]!.id);

    // Second paste is offset from original payload position, not from first paste
    expect(sdcpn.places[0]!.x).toBe(50);
    expect(sdcpn.places[1]!.x).toBe(50);
  });
});
