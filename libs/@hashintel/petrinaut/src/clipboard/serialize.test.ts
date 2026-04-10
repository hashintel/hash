import { describe, expect, it } from "vitest";

import type { SDCPN } from "../core/types/sdcpn";
import type { SelectionItem, SelectionMap } from "../state/selection";
import { parseClipboardPayload, serializeSelection } from "./serialize";
import { CLIPBOARD_FORMAT_VERSION } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sel(...items: SelectionItem[]): SelectionMap {
  return new Map(items.map((item) => [item.id, item]));
}

const emptyNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const fullNet: SDCPN = {
  places: [
    {
      id: "p1",
      name: "Place1",
      colorId: "c1",
      dynamicsEnabled: true,
      differentialEquationId: "de1",
      x: 10,
      y: 20,
    },
    {
      id: "p2",
      name: "Place2",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 30,
      y: 40,
    },
  ],
  transitions: [
    {
      id: "t1",
      name: "Transition1",
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p2", weight: 2 }],
      lambdaType: "predicate",
      lambdaCode: "return true;",
      transitionKernelCode: "return input;",
      x: 50,
      y: 60,
    },
  ],
  types: [
    {
      id: "c1",
      name: "Token",
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [{ elementId: "e1", name: "value", type: "real" }],
    },
  ],
  differentialEquations: [
    { id: "de1", name: "Equation1", colorId: "c1", code: "dx = -x;" },
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
};

// ---------------------------------------------------------------------------
// serializeSelection
// ---------------------------------------------------------------------------

describe("serializeSelection", () => {
  it("produces an empty payload when nothing is selected", () => {
    const payload = serializeSelection(fullNet, new Map(), "doc-1");

    expect(payload.format).toBe("petrinaut-sdcpn");
    expect(payload.version).toBe(CLIPBOARD_FORMAT_VERSION);
    expect(payload.documentId).toBe("doc-1");
    expect(payload.data.places).toHaveLength(0);
    expect(payload.data.transitions).toHaveLength(0);
    expect(payload.data.types).toHaveLength(0);
    expect(payload.data.differentialEquations).toHaveLength(0);
    expect(payload.data.parameters).toHaveLength(0);
  });

  it("includes the document ID (or null) in the payload", () => {
    const withId = serializeSelection(emptyNet, new Map(), "doc-1");
    expect(withId.documentId).toBe("doc-1");

    const withNull = serializeSelection(emptyNet, new Map(), null);
    expect(withNull.documentId).toBeNull();
  });

  it("copies only the selected place", () => {
    const payload = serializeSelection(
      fullNet,
      sel({ type: "place", id: "p1" }),
      null,
    );

    expect(payload.data.places).toHaveLength(1);
    expect(payload.data.places[0]!.id).toBe("p1");
    expect(payload.data.transitions).toHaveLength(0);
  });

  it("copies a transition and strips arcs to non-selected places", () => {
    // Select transition t1 but only place p1 (not p2)
    const payload = serializeSelection(
      fullNet,
      sel({ type: "transition", id: "t1" }, { type: "place", id: "p1" }),
      null,
    );

    const transition = payload.data.transitions[0]!;
    expect(transition.inputArcs).toHaveLength(1);
    expect(transition.inputArcs[0]!.placeId).toBe("p1");
    // outputArc references p2, which is not selected → stripped
    expect(transition.outputArcs).toHaveLength(0);
  });

  it("keeps all arcs when both connected places are selected", () => {
    const payload = serializeSelection(
      fullNet,
      sel(
        { type: "transition", id: "t1" },
        { type: "place", id: "p1" },
        { type: "place", id: "p2" },
      ),
      null,
    );

    const transition = payload.data.transitions[0]!;
    expect(transition.inputArcs).toHaveLength(1);
    expect(transition.outputArcs).toHaveLength(1);
  });

  it("strips all arcs when a transition is selected alone", () => {
    const payload = serializeSelection(
      fullNet,
      sel({ type: "transition", id: "t1" }),
      null,
    );

    const transition = payload.data.transitions[0]!;
    expect(transition.inputArcs).toHaveLength(0);
    expect(transition.outputArcs).toHaveLength(0);
  });

  it("copies a token type", () => {
    const payload = serializeSelection(
      fullNet,
      sel({ type: "type", id: "c1" }),
      null,
    );

    expect(payload.data.types).toHaveLength(1);
    expect(payload.data.types[0]!.name).toBe("Token");
  });

  it("copies a differential equation", () => {
    const payload = serializeSelection(
      fullNet,
      sel({ type: "differentialEquation", id: "de1" }),
      null,
    );

    expect(payload.data.differentialEquations).toHaveLength(1);
    expect(payload.data.differentialEquations[0]!.name).toBe("Equation1");
  });

  it("copies a parameter", () => {
    const payload = serializeSelection(
      fullNet,
      sel({ type: "parameter", id: "param1" }),
      null,
    );

    expect(payload.data.parameters).toHaveLength(1);
    expect(payload.data.parameters[0]!.variableName).toBe("rate");
  });

  it("copies a mixed selection of all item types", () => {
    const payload = serializeSelection(
      fullNet,
      sel(
        { type: "place", id: "p1" },
        { type: "place", id: "p2" },
        { type: "transition", id: "t1" },
        { type: "type", id: "c1" },
        { type: "differentialEquation", id: "de1" },
        { type: "parameter", id: "param1" },
      ),
      "doc-1",
    );

    expect(payload.data.places).toHaveLength(2);
    expect(payload.data.transitions).toHaveLength(1);
    expect(payload.data.types).toHaveLength(1);
    expect(payload.data.differentialEquations).toHaveLength(1);
    expect(payload.data.parameters).toHaveLength(1);
  });

  it("ignores arc selections (arcs come with transitions)", () => {
    const payload = serializeSelection(
      fullNet,
      sel({ type: "arc", id: "$A_p1___t1" }),
      null,
    );

    expect(payload.data.places).toHaveLength(0);
    expect(payload.data.transitions).toHaveLength(0);
  });

  it("ignores selection IDs that don't match any item in the net", () => {
    const payload = serializeSelection(
      fullNet,
      sel({ type: "place", id: "nonexistent" }),
      null,
    );

    expect(payload.data.places).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseClipboardPayload
// ---------------------------------------------------------------------------

describe("parseClipboardPayload", () => {
  it("parses a valid payload", () => {
    const payload = serializeSelection(fullNet, new Map(), "doc-1");
    const json = JSON.stringify(payload);

    const parsed = parseClipboardPayload(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.format).toBe("petrinaut-sdcpn");
    expect(parsed!.documentId).toBe("doc-1");
  });

  it("returns null for empty string", () => {
    expect(parseClipboardPayload("")).toBeNull();
  });

  it("returns null for plain text", () => {
    expect(parseClipboardPayload("hello world")).toBeNull();
  });

  it("returns null for valid JSON that is not our format", () => {
    expect(parseClipboardPayload('{"key": "value"}')).toBeNull();
  });

  it("returns null for wrong format field", () => {
    const json = JSON.stringify({
      format: "something-else",
      version: 1,
      data: {},
    });
    expect(parseClipboardPayload(json)).toBeNull();
  });

  it("returns null when version is higher than supported", () => {
    const json = JSON.stringify({
      format: "petrinaut-sdcpn",
      version: CLIPBOARD_FORMAT_VERSION + 1,
      data: {},
    });
    expect(parseClipboardPayload(json)).toBeNull();
  });

  it("accepts a payload with version equal to current", () => {
    const json = JSON.stringify({
      format: "petrinaut-sdcpn",
      version: CLIPBOARD_FORMAT_VERSION,
      documentId: null,
      data: {
        places: [],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
      },
    });
    expect(parseClipboardPayload(json)).not.toBeNull();
  });

  it("returns null when version is not a number", () => {
    const json = JSON.stringify({
      format: "petrinaut-sdcpn",
      version: "1",
      data: {},
    });
    expect(parseClipboardPayload(json)).toBeNull();
  });

  it("returns null when data field is missing", () => {
    const json = JSON.stringify({
      format: "petrinaut-sdcpn",
      version: 1,
    });
    expect(parseClipboardPayload(json)).toBeNull();
  });

  it("returns null for a JSON array", () => {
    expect(parseClipboardPayload("[1,2,3]")).toBeNull();
  });

  it("returns null for JSON null", () => {
    expect(parseClipboardPayload("null")).toBeNull();
  });

  it("returns null when version is zero", () => {
    const json = JSON.stringify({
      format: "petrinaut-sdcpn",
      version: 0,
      documentId: null,
      data: {
        places: [],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
      },
    });
    expect(parseClipboardPayload(json)).toBeNull();
  });

  it("returns null when version is a float", () => {
    const json = JSON.stringify({
      format: "petrinaut-sdcpn",
      version: 1.5,
      documentId: null,
      data: {
        places: [],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
      },
    });
    expect(parseClipboardPayload(json)).toBeNull();
  });

  it("returns null when data.places contains an invalid place", () => {
    const json = JSON.stringify({
      format: "petrinaut-sdcpn",
      version: 1,
      documentId: null,
      data: {
        places: [{ id: "p1", name: "P" }], // missing required fields
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
      },
    });
    expect(parseClipboardPayload(json)).toBeNull();
  });

  it("returns null when a transition has an invalid lambdaType", () => {
    const json = JSON.stringify({
      format: "petrinaut-sdcpn",
      version: 1,
      documentId: null,
      data: {
        places: [],
        transitions: [
          {
            id: "t1",
            name: "T",
            inputArcs: [],
            outputArcs: [],
            lambdaType: "invalid",
            lambdaCode: "",
            transitionKernelCode: "",
            x: 0,
            y: 0,
          },
        ],
        types: [],
        differentialEquations: [],
        parameters: [],
      },
    });
    expect(parseClipboardPayload(json)).toBeNull();
  });

  it("returns null when a color element has an invalid type", () => {
    const json = JSON.stringify({
      format: "petrinaut-sdcpn",
      version: 1,
      documentId: null,
      data: {
        places: [],
        transitions: [],
        types: [
          {
            id: "c1",
            name: "Token",
            iconSlug: "circle",
            displayColor: "#FF0000",
            elements: [{ elementId: "e1", name: "val", type: "string" }],
          },
        ],
        differentialEquations: [],
        parameters: [],
      },
    });
    expect(parseClipboardPayload(json)).toBeNull();
  });

  it("returns null when a parameter has an invalid type", () => {
    const json = JSON.stringify({
      format: "petrinaut-sdcpn",
      version: 1,
      documentId: null,
      data: {
        places: [],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [
          {
            id: "p1",
            name: "Rate",
            variableName: "rate",
            type: "float",
            defaultValue: "1.0",
          },
        ],
      },
    });
    expect(parseClipboardPayload(json)).toBeNull();
  });

  it("returns null when data arrays are missing", () => {
    const json = JSON.stringify({
      format: "petrinaut-sdcpn",
      version: 1,
      documentId: null,
      data: {},
    });
    expect(parseClipboardPayload(json)).toBeNull();
  });

  it("returns null when an arc has a non-numeric weight", () => {
    const json = JSON.stringify({
      format: "petrinaut-sdcpn",
      version: 1,
      documentId: null,
      data: {
        places: [],
        transitions: [
          {
            id: "t1",
            name: "T",
            inputArcs: [{ placeId: "p1", weight: "heavy", type: "standard" }],
            outputArcs: [],
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
      },
    });
    expect(parseClipboardPayload(json)).toBeNull();
  });

  it("strips unknown fields from a valid payload", () => {
    const json = JSON.stringify({
      format: "petrinaut-sdcpn",
      version: 1,
      documentId: null,
      extraField: "should be stripped",
      data: {
        places: [],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
      },
    });
    const parsed = parseClipboardPayload(json);
    expect(parsed).not.toBeNull();
    expect((parsed as Record<string, unknown>).extraField).toBeUndefined();
  });
});
