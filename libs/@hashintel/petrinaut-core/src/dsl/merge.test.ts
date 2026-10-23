import { describe, expect, it } from "vitest";

import * as examples from "../examples";
import { mergeDslDocument } from "./merge";
import { parsePetrinautDsl } from "./parse";
import { printPetrinautDsl } from "./print";

import type { SDCPN } from "../types/sdcpn";
import type { DslDiagnostic } from "./ast";

/** Ids a test can read: `new-1`, `new-2`, … */
const sequentialIds = () => {
  let count = 0;
  return () => {
    count += 1;
    return `new-${count}`;
  };
};

/** `text` written onto `existing`, which must leave no error. */
const apply = (existing: SDCPN, text: string): SDCPN => {
  const parsed = parsePetrinautDsl(text);
  expect(parsed.diagnostics).toEqual([]);
  const merged = mergeDslDocument(existing, parsed.document, {
    generateId: sequentialIds(),
  });
  if (!merged.ok) {
    throw new Error(
      merged.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    );
  }
  return merged.sdcpn;
};

const errorsOf = (existing: SDCPN, text: string): DslDiagnostic[] => {
  const parsed = parsePetrinautDsl(text);
  expect(parsed.diagnostics).toEqual([]);
  const merged = mergeDslDocument(existing, parsed.document);
  expect(merged.ok).toBe(false);
  return merged.diagnostics;
};

const print = (sdcpn: SDCPN): string => printPetrinautDsl({ sdcpn }).text;

const idsAndPositions = (sdcpn: SDCPN) => ({
  places: sdcpn.places.map(({ id, x, y }) => [id, x, y]),
  transitions: sdcpn.transitions.map(({ id, x, y }) => [id, x, y]),
  instances: (sdcpn.componentInstances ?? []).map(({ id, x, y }) => [id, x, y]),
  types: sdcpn.types.map(({ id, elements }) => [
    id,
    elements.map(({ elementId }) => elementId),
  ]),
  parameters: sdcpn.parameters.map(({ id }) => id),
  equations: sdcpn.differentialEquations.map(({ id }) => id),
  fusions: (sdcpn.fusions ?? []).map(({ id }) => id),
  metrics: (sdcpn.metrics ?? []).map(({ id }) => id),
  scenarios: (sdcpn.scenarios ?? []).map(({ id }) => id),
  subnets: (sdcpn.subnets ?? []).map((subnet) => [
    subnet.id,
    subnet.places.map(({ id, x, y }) => [id, x, y]),
    subnet.transitions.map(({ id, x, y }) => [id, x, y]),
  ]),
});

const sorting: SDCPN = {
  description: "Sorts parts by weight.",
  componentsOnly: false,
  types: [
    {
      id: "part",
      name: "Part",
      iconSlug: "square",
      displayColor: "#123456",
      elements: [
        { elementId: "w", name: "weight", type: "real" },
        { elementId: "k", name: "kind", type: "string" },
      ],
    },
  ],
  parameters: [
    {
      id: "threshold",
      name: "Weight threshold",
      variableName: "threshold",
      type: "real",
      defaultValue: "1.5",
    },
  ],
  differentialEquations: [
    {
      id: "cool",
      name: "Cool down",
      colorId: "part",
      code: "return tokens.map(() => ({ weight: -1 }));",
    },
  ],
  places: [
    {
      id: "raw",
      name: "Raw",
      description: "Parts as delivered.",
      colorId: "part",
      dynamicsEnabled: true,
      differentialEquationId: "cool",
      visualizerCode: "return <svg />;",
      showAsInitialState: true,
      x: 30,
      y: 45,
    },
    {
      id: "scrap",
      name: "Scrap",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      capacity: 3,
      x: 300,
      y: 45,
    },
  ],
  subnets: [
    {
      id: "cell",
      name: "Work cell",
      description: "One machine.",
      source: { library: "acme.cells", component: "cell" },
      places: [
        {
          id: "in",
          name: "In",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          isPort: true,
          portDirection: "in",
          x: 0,
          y: 0,
        },
        {
          id: "done",
          name: "Done",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          isPort: true,
          portDirection: "out",
          x: 150,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "work",
          name: "Work",
          inputArcs: [{ placeId: "in", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "done", weight: 1 }],
          lambdaType: "stochastic",
          lambdaCode: "return parameters.speed;",
          transitionKernelCode: "",
          x: 75,
          y: 0,
        },
      ],
      types: [],
      differentialEquations: [],
      parameters: [
        {
          id: "speed",
          name: "speed",
          variableName: "speed",
          type: "real",
          defaultValue: "1",
        },
      ],
    },
  ],
  componentInstances: [
    {
      id: "c1",
      name: "Cell",
      subnetId: "cell",
      parameterValues: { speed: "2" },
      x: 600,
      y: 45,
    },
  ],
  fusions: [
    {
      id: "f1",
      name: "Output",
      members: [
        { kind: "place", placeId: "scrap" },
        {
          kind: "componentPort",
          componentInstanceId: "c1",
          portPlaceId: "done",
        },
      ],
    },
  ],
  transitions: [
    {
      id: "sort",
      name: "Sort",
      description: "Heavy parts go to the cell.",
      inputArcs: [
        { placeId: "raw", weight: 2, type: "standard" },
        {
          endpoint: { kind: "place", placeId: "scrap" },
          weight: 1,
          type: "inhibitor",
        },
      ],
      outputArcs: [
        {
          endpoint: {
            kind: "componentPort",
            componentInstanceId: "c1",
            portPlaceId: "in",
          },
          weight: 2,
        },
      ],
      lambdaType: "predicate",
      lambdaCode: "return input.Raw[0].weight > parameters.threshold;",
      transitionKernelCode: "return { Cell: input.Raw };",
      x: 165,
      y: 45,
    },
  ],
  metrics: [
    { id: "m1", name: "Scrap count", code: "return state.places.Scrap.count;" },
  ],
  scenarios: [
    {
      id: "s1",
      name: "Busy",
      description: "A rush.",
      scenarioParameters: [
        { type: "ratio", identifier: "surge", default: 0.5 },
      ],
      parameterOverrides: { threshold: "scenario.surge * 2" },
      initialState: {
        type: "per_place",
        content: { raw: [[1, "a"]], scrap: "1" },
      },
    },
  ],
};

describe("mergeDslDocument", () => {
  it("writes an unchanged text back as the same document", () => {
    expect(apply(sorting, print(sorting))).toEqual(sorting);
  });

  it("keeps every id and position of the examples, and prints the same text again", () => {
    for (const example of Object.values(examples)) {
      const original = example.petriNetDefinition;
      const merged = apply(original, print(original));

      expect(print(merged), example.title).toBe(print(original));
      expect(idsAndPositions(merged), example.title).toEqual(
        idsAndPositions(original),
      );
      expect(JSON.stringify(merged), example.title).not.toContain('"new-');
    }
  });

  it("adds a new place and transition at fresh ids under the net, and drops what the text dropped", () => {
    const merged = apply(
      sorting,
      print(sorting)
        .replace(
          "place Scrap capacity 3\n",
          "place Scrap capacity 3\nplace Bin\n",
        )
        .replace(
          'metric "Scrap count"',
          'transition Dump {\n  Scrap -> Bin\n}\n\nmetric "Scrap count"',
        )
        .replace(/metric "Scrap count"[^\n]*\n/u, ""),
    );

    expect(merged.places.map(({ id, name }) => [id, name])).toEqual([
      ["raw", "Raw"],
      ["scrap", "Scrap"],
      ["new-1", "Bin"],
    ]);
    expect(merged.places[2]).toMatchObject({ x: 30, y: 45 + 8 * 15 });
    expect(merged.transitions.map(({ id }) => id)).toEqual(["sort", "new-2"]);
    expect(merged.transitions[1]).toMatchObject({
      name: "Dump",
      inputArcs: [{ placeId: "scrap", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "new-1", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "",
      x: 30 + 10 * 15,
    });
    expect(merged.metrics).toEqual([]);
  });

  it("takes a lone new name beside a lone dropped entity as a rename", () => {
    const text = print(sorting)
      .replaceAll("Scrap", "Reject")
      .replace("Reject count", "Scrap count");

    const merged = apply(sorting, text);

    expect(merged.places[1]).toMatchObject({
      id: "scrap",
      name: "Reject",
      capacity: 3,
      x: 300,
    });
    expect(merged.transitions[0]!.inputArcs[1]).toEqual({
      endpoint: { kind: "place", placeId: "scrap" },
      weight: 1,
      type: "inhibitor",
    });
    expect(merged.scenarios![0]!.initialState).toMatchObject({
      content: { scrap: "1" },
    });
  });

  it("keeps a renamed component's id and its instances", () => {
    const merged = apply(
      sorting,
      print(sorting).replaceAll('"Work cell"', "Station"),
    );

    expect(merged.subnets![0]).toMatchObject({ id: "cell", name: "Station" });
    expect(merged.componentInstances![0]).toMatchObject({
      id: "c1",
      subnetId: "cell",
      parameterValues: { speed: "2" },
    });
  });

  it("gives a new component fresh ids and resolves instances of it", () => {
    const merged = apply(
      sorting,
      print(sorting).replace(
        "\ntype Part",
        "\ncomponent Buffer {\n  param size: integer = 2\n  port inout Slot capacity 3\n}\n\ntype Part",
      ) + "instance Hold = Buffer(size = 4)\nfuse Hold.Slot, Raw\n",
    );

    const buffer = merged.subnets!.find((subnet) => subnet.name === "Buffer")!;
    expect(buffer).toMatchObject({
      id: "new-1",
      parameters: [{ id: "new-2", variableName: "size", defaultValue: "2" }],
      places: [
        {
          id: "new-3",
          name: "Slot",
          isPort: true,
          portDirection: "inout",
          capacity: 3,
        },
      ],
    });
    expect(buffer.places[0]!.portDirection).toBe("inout");
    expect(merged.componentInstances!.at(-1)).toMatchObject({
      id: "new-4",
      name: "Hold",
      subnetId: "new-1",
      parameterValues: { "new-2": "4" },
      x: 30,
      y: 45 + 8 * 15,
    });
    expect(merged.fusions!.at(-1)).toMatchObject({
      id: "new-5",
      members: [
        {
          kind: "componentPort",
          componentInstanceId: "new-4",
          portPlaceId: "new-3",
        },
        { kind: "place", placeId: "raw" },
      ],
    });
  });

  it("leaves a port's direction undeclared when the text only repeats what the arcs say", () => {
    const undeclared: SDCPN = {
      ...sorting,
      subnets: [
        {
          ...sorting.subnets![0]!,
          places: sorting.subnets![0]!.places.map(
            ({ portDirection: _direction, ...place }) => place,
          ),
        },
      ],
    };

    const merged = apply(undeclared, print(undeclared));

    expect(merged).toEqual(undeclared);
    expect(print(undeclared)).toContain("port in In\n");
  });

  it("matches fusions by name, by members, and by a shared member", () => {
    const base: SDCPN = {
      ...sorting,
      fusions: [
        {
          id: "named",
          name: "Output",
          members: [
            { kind: "place", placeId: "scrap" },
            {
              kind: "componentPort",
              componentInstanceId: "c1",
              portPlaceId: "done",
            },
          ],
        },
        {
          id: "unnamed",
          members: [
            { kind: "place", placeId: "raw" },
            {
              kind: "componentPort",
              componentInstanceId: "c1",
              portPlaceId: "in",
            },
          ],
        },
      ],
    };
    const text = print(base)
      .replace(
        "fuse Output = Scrap, Cell.Done",
        "fuse Output = Cell.Done, Scrap",
      )
      .replace("fuse Raw, Cell.In", "fuse Cell.In, Scrap");

    const merged = apply(base, text);

    expect(merged.fusions!.map(({ id }) => id)).toEqual(["named", "unnamed"]);
    expect(merged.fusions![1]!.members).toEqual([
      { kind: "componentPort", componentInstanceId: "c1", portPlaceId: "in" },
      { kind: "place", placeId: "scrap" },
    ]);
  });

  it("keeps a parameter's spelling when the text has no label, and takes a new label", () => {
    const base: SDCPN = {
      ...sorting,
      parameters: [
        {
          id: "arrival",
          name: "Arrival rate",
          variableName: "arrival_rate",
          type: "real",
          defaultValue: "1",
        },
      ],
      scenarios: [],
    };
    const text = print(base);
    expect(text).toContain("param arrival_rate: real = 1\n");

    const unchanged = apply(base, text);
    const relabelled = apply(
      base,
      text.replace(
        "param arrival_rate: real = 1",
        'param arrival_rate "Arrivals per hour": integer = 2',
      ),
    );

    expect(unchanged.parameters[0]).toEqual(base.parameters[0]);
    expect(relabelled.parameters[0]).toEqual({
      id: "arrival",
      name: "Arrivals per hour",
      variableName: "arrival_rate",
      type: "integer",
      defaultValue: "2",
    });
  });

  it("keeps a scenario's initial state when its text has none, and reads a marking and a body", () => {
    const text = print(sorting);
    expect(text).toContain(
      '  marking {\n    Raw: [[1,"a"]]\n    Scrap: 1\n  }\n',
    );

    const kept = apply(
      sorting,
      text.replace(/  marking \{\n(?:.*\n)*?  \}\n/u, ""),
    );
    const coded = apply(
      sorting,
      text.replace(
        /  marking \{\n(?:.*\n)*?  \}\n/u,
        "  initial { return { Raw: [] }; }\n",
      ),
    );

    expect(kept.scenarios![0]!.initialState).toEqual(
      sorting.scenarios![0]!.initialState,
    );
    expect(coded.scenarios![0]!.initialState).toEqual({
      type: "code",
      content: "return { Raw: [] };",
    });
  });

  it("reports every reference the text cannot resolve, at its text, and gives no document", () => {
    const component = /component "Work cell"[\s\S]*?\n\}\n/u.exec(
      print(sorting),
    )![0];
    const offset = component.split("\n").length - 1;

    const diagnostics = errorsOf(
      sorting,
      `${component}place Raw
place Raw
instance Ghost = Nowhere
instance Twin = "Work cell"(pace = 3)
transition Move {
  Missing -> Twin.Out, Twin.In
}
scenario Odd {
  override nope = 1
  marking {
    Raw: [1
  }
}
`,
    );

    expect(
      diagnostics.map(({ message, range }) => [
        message,
        range.startLine - offset,
      ]),
    ).toEqual([
      ['Place "Raw" is declared twice', 2],
      ['Unknown component "Nowhere"', 3],
      ['Component "Work cell" has no parameter "pace"', 4],
      ['Unknown place "Missing"', 6],
      ['Instance "Twin" has no port "Out"', 6],
      ['Unknown parameter "nope"', 9],
      [
        "Token rows read as JSON: a list of rows, each a list of numbers, booleans or strings",
        11,
      ],
    ]);
  });
});
