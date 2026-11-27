import { describe, expect, it } from "vitest";

import { generateDefaultNetVisualizerCode } from "../actions/default-codes";
import { buildNetVisualizerContext } from "../hir/surface-context";
import { createUserKeyedRecord } from "../validation/record-keys";
import { interpretViewHir, ViewElementValue } from "./interpret-view";
import { lowerVisualizerToHir } from "./visualizer";

import type { HirNetVisualizerContext } from "../hir/surface-context";
import type { Component, SDCPN } from "../types/sdcpn";
import type { ViewPlaces, ViewValue } from "./interpret-view";

const context: HirNetVisualizerContext = {
  surface: "visualizer",
  subject: "net",
  parameters: [{ name: "capacity", type: "integer" }],
  places: [
    { name: "Queue", elements: [{ name: "weight", type: "real" }] },
    { name: "Raw Material", elements: null },
  ],
};

const placesOf = (
  entries: Record<string, Record<string, number>[]>,
): ViewPlaces => {
  const places: Record<string, ViewPlaces[string]> = createUserKeyedRecord();
  for (const [name, tokens] of Object.entries(entries)) {
    places[name] = { count: tokens.length, tokens };
  }
  return places;
};

const draw = (
  code: string,
  places: ViewPlaces,
  drawContext: HirNetVisualizerContext = context,
): ViewValue => {
  const result = lowerVisualizerToHir(code, drawContext);
  if (!result.ok) {
    throw new Error(
      result.diagnostics.map((diagnostic) => diagnostic.message).join("; "),
    );
  }
  return interpretViewHir(result.view, {
    places,
    parameters: { capacity: 4 },
    width: 200,
    height: 96,
  });
};

const asElement = (value: ViewValue): ViewElementValue => {
  expect(value).toBeInstanceOf(ViewElementValue);
  return value as ViewElementValue;
};

const diagnosticsOf = (code: string): string[] => {
  const result = lowerVisualizerToHir(code, context);
  return result.ok ? [] : result.diagnostics.map(({ message }) => message);
};

describe("a net's visualizer", () => {
  it("reads every place of the net by name, its count and its tokens", () => {
    const picture = asElement(
      draw(
        `return <Visualizer.Svg>
          <text>{places.Queue.count} of {parameters.capacity}</text>
          {places.Queue.tokens.map((token, index) => (
            <circle key={index} r={token.weight} />
          ))}
          <text>{places["Raw Material"].tokens.length}</text>
        </Visualizer.Svg>;`,
        placesOf({
          Queue: [{ weight: 2 }, { weight: 3 }],
          "Raw Material": [{}, {}, {}],
        }),
      ),
    );
    const [queueLabel, circles, rawLabel] = picture.children;
    expect(asElement(queueLabel!).children).toEqual([2, " of ", 4]);
    expect(
      (circles as ViewValue[]).map((circle) =>
        asElement(circle).attributes.get("r"),
      ),
    ).toEqual([2, 3]);
    expect(asElement(rawLabel!).children).toEqual([3]);
  });

  it("reports a place the net does not have", () => {
    expect(
      diagnosticsOf(
        `return <Visualizer.Svg><text>{places.Missing.count}</text></Visualizer.Svg>;`,
      ),
    ).not.toEqual([]);
  });

  it("does not know `tokens`, which a place's visualizer reads", () => {
    expect(
      diagnosticsOf(
        `return <Visualizer.Svg><text>{tokens.length}</text></Visualizer.Svg>;`,
      ),
    ).not.toEqual([]);
  });

  it("leaves `places` to a place's visualizer as a name of its own", () => {
    const result = lowerVisualizerToHir(
      `const places = tokens.length;
      return <Visualizer.Svg><text>{places}</text></Visualizer.Svg>;`,
      { surface: "visualizer", parameters: [], elements: null },
    );
    expect(result.ok).toBe(true);
  });

  it("draws the default template, one row per place", () => {
    const code = generateDefaultNetVisualizerCode(["Queue", "Raw Material"]);
    const picture = asElement(
      draw(
        code,
        placesOf({ Queue: [{ weight: 1 }], "Raw Material": [{}, {}] }),
      ),
    );
    const rows = (picture.children[0] as ViewValue[]).map(asElement);
    expect(rows.map((row) => row.key)).toEqual(["Queue", "Raw Material"]);
    // The fullest place's bar spans the viewport less its margins.
    const barWidths = rows.map((row) =>
      asElement(row.children[0]!).attributes.get("width"),
    );
    expect(barWidths).toEqual([92, 184]);
  });

  it("draws the default template of a net with no place", () => {
    const emptyContext: HirNetVisualizerContext = { ...context, places: [] };
    const picture = asElement(
      draw(generateDefaultNetVisualizerCode([]), placesOf({}), emptyContext),
    );
    expect(picture.tag).toBe("Visualizer.Svg");
  });
});

describe("buildNetVisualizerContext", () => {
  const station: Component = {
    id: "station",
    name: "Station",
    places: [
      {
        id: "in",
        name: "In",
        colorId: "job",
        dynamicsEnabled: false,
        x: 0,
        y: 0,
      },
      {
        id: "busy",
        name: "Busy",
        colorId: null,
        dynamicsEnabled: false,
        x: 0,
        y: 0,
      },
    ],
    transitions: [],
    types: [
      {
        id: "job",
        name: "Job",
        iconSlug: "circle",
        displayColor: "#000000",
        elements: [{ elementId: "size", name: "size", type: "real" }],
      },
    ],
    differentialEquations: [],
    parameters: [
      {
        id: "rate",
        name: "Rate",
        variableName: "rate",
        type: "real",
        defaultValue: "1",
      },
    ],
  };
  const sdcpn: SDCPN = {
    places: [
      {
        id: "store",
        name: "Store",
        colorId: null,
        dynamicsEnabled: false,
        x: 0,
        y: 0,
      },
    ],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [
      {
        id: "speed",
        name: "Speed",
        variableName: "speed",
        type: "real",
        defaultValue: "1",
      },
    ],
    components: [station],
  };

  it("lists the root net's places and parameters by default", () => {
    expect(buildNetVisualizerContext(sdcpn)).toEqual({
      surface: "visualizer",
      subject: "net",
      parameters: [{ name: "speed", type: "real" }],
      places: [{ name: "Store", elements: null }],
    });
  });

  it("lists a component's own places, token types and parameters", () => {
    expect(buildNetVisualizerContext(sdcpn, station)).toEqual({
      surface: "visualizer",
      subject: "net",
      parameters: [{ name: "rate", type: "real" }],
      places: [
        { name: "In", elements: [{ name: "size", type: "real" }] },
        { name: "Busy", elements: null },
      ],
    });
  });
});
