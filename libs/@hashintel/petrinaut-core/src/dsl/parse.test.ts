import { describe, expect, it } from "vitest";

import { assemblyLine } from "../examples/assembly-line";
import { cafeQueue } from "../examples/cafe-queue";
import { parsePetrinautDsl, skipCodeBlock } from "./parse";
import { printPetrinautDsl } from "./print";

const parseClean = (text: string) => {
  const { document, diagnostics } = parsePetrinautDsl(text);
  expect(diagnostics).toEqual([]);
  return document;
};

describe("parsePetrinautDsl", () => {
  it("reads the Assembly Line back from its printed text", () => {
    const { text } = printPetrinautDsl({
      sdcpn: assemblyLine.petriNetDefinition,
      title: assemblyLine.title,
    });

    const document = parseClean(text);

    expect(document.title).toBe("Assembly Line");
    expect(document.componentsOnly).toBe(false);
    expect(document.components.map((component) => component.name.text)).toEqual(
      ["Source", "Stage"],
    );
    const source = document.components[0]!;
    expect(source.source).toEqual({
      library: "hash.standard-components",
      component: "source",
    });
    expect(source.parameters[0]).toMatchObject({
      variableName: { text: "rate" },
      label: null,
      type: "real",
      defaultValue: "1",
    });
    expect(source.places[0]).toMatchObject({
      name: { text: "Out" },
      port: "out",
      description: "The tokens the source creates.",
    });
    expect(source.transitions[0]).toMatchObject({
      name: { text: "Emit" },
      inputs: [],
      outputs: [
        { weight: 1, target: { instance: null, place: { text: "Out" } } },
      ],
      lambda: { type: "stochastic", code: "return parameters.rate;" },
      kernel: null,
    });
    expect(document.places.map((place) => place.name.text)).toEqual([
      "Buffer",
      "Finished",
    ]);
    expect(document.places[0]).toMatchObject({
      capacity: 5,
      start: true,
      port: null,
    });
    expect(document.instances[1]).toMatchObject({
      name: { text: "Cutter" },
      component: { text: "Stage" },
      bindings: [{ name: { text: "rate" }, value: "2" }],
    });
    expect(document.fusions[0]).toMatchObject({
      name: { text: "RawParts" },
      members: [
        { instance: { text: "Parts" }, place: { text: "Out" } },
        { instance: { text: "Cutter" }, place: { text: "In" } },
      ],
    });
    expect(document.fusions[1]).toMatchObject({
      name: null,
      members: [
        { instance: null, place: { text: "Buffer" } },
        { instance: { text: "Cutter" }, place: { text: "Out" } },
        { instance: { text: "Drill" }, place: { text: "In" } },
      ],
    });
    expect(document.metrics[0]).toMatchObject({
      name: { text: "Finished parts" },
      code: "return state.places.Finished.count;",
    });
  });

  it("reads scenarios, module-form bodies and labelled parameters from the Café Queue", () => {
    const { text } = printPetrinautDsl({ sdcpn: cafeQueue.petriNetDefinition });

    const document = parseClean(text);

    expect(document.title).toBeNull();
    expect(document.description).toMatch(/^Stochastic café service/u);
    expect(
      document.parameters.find(
        (parameter) => parameter.variableName.text === "begin_rate",
      ),
    ).toMatchObject({ label: "Begin Service Rate", defaultValue: "0.4" });
    const begin = document.transitions.find(
      (transition) => transition.name.text === "BeginService",
    )!;
    expect(begin.inputs.map((arc) => arc.target.place.text)).toEqual([
      "Waiting",
      "FreeStaff",
    ]);
    expect(begin.lambda?.type).toBe("stochastic");
    expect(begin.lambda?.code).toContain("return parameters.begin_rate;");
    const scenario = document.scenarios.find(
      (candidate) => candidate.name.text === "Morning Rush",
    )!;
    expect(scenario.parameters[0]).toMatchObject({
      identifier: { text: "arrival_rate" },
      type: "real",
      default: 1.2,
    });
    expect(scenario.overrides[0]).toMatchObject({
      name: { text: "arrival_rate" },
      value: "scenario.arrival_rate",
    });
  });

  it("reads weights, arc kinds, ports, dynamics, visualizers and markings", () => {
    const document = parseClean(`/// A sorting net.
net "Sorting"

component "Work cell" {
  port in In
  port out Out: Part capacity 2
  transition Pass { In -> Out }
}

type Part { weight: real, kind: string }

dynamics "Cool down" (Part) { return tokens.map(() => ({ weight: -1 })); }

place Raw: Part dynamics "Cool down" {
  visualizer {
    const label = \`\${tokens.length} parts\`;
    return <text>{label}</text>;
  }
}
place Gate // the gate
place Scrap capacity 3

instance Cell = "Work cell"

transition Sort {
  2 Raw, read Gate, inhibit Scrap -> 2 Cell.In
  guard { return input.Raw[0].weight > 1; }
  kernel {
    return { "Cell.In": input.Raw };
  }
}

scenario Busy {
  param surge: ratio = 0.5
  override limit = scenario.surge * 2 // doubled
  marking {
    Raw: [[1, "a"], [2, "b"]]
    Gate: 1
  }
}
`);

    expect(document.description).toBe("A sorting net.");
    expect(document.components[0]).toMatchObject({
      name: { text: "Work cell" },
      source: null,
      places: [
        { name: { text: "In" }, port: "in", type: null },
        {
          name: { text: "Out" },
          port: "out",
          type: { text: "Part" },
          capacity: 2,
        },
      ],
      transitions: [
        {
          inputs: [{ target: { place: { text: "In" } } }],
          outputs: [{ target: { place: { text: "Out" } } }],
        },
      ],
    });
    expect(document.types[0]).toMatchObject({
      name: { text: "Part" },
      elements: [
        { name: { text: "weight" }, type: "real" },
        { name: { text: "kind" }, type: "string" },
      ],
    });
    expect(document.dynamics[0]).toMatchObject({
      name: { text: "Cool down" },
      type: { text: "Part" },
      code: "return tokens.map(() => ({ weight: -1 }));",
    });
    expect(document.places[0]).toMatchObject({
      name: { text: "Raw" },
      type: { text: "Part" },
      dynamics: { text: "Cool down" },
      visualizer: `const label = \`\${tokens.length} parts\`;\nreturn <text>{label}</text>;`,
    });
    expect(document.places[1]).toMatchObject({ name: { text: "Gate" } });
    expect(document.places[2]).toMatchObject({ capacity: 3 });
    const sort = document.transitions[0]!;
    expect(sort.inputs).toMatchObject([
      { weight: 2, type: "standard", target: { place: { text: "Raw" } } },
      { weight: 1, type: "read", target: { place: { text: "Gate" } } },
      { weight: 1, type: "inhibitor", target: { place: { text: "Scrap" } } },
    ]);
    expect(sort.outputs).toMatchObject([
      {
        weight: 2,
        target: { instance: { text: "Cell" }, place: { text: "In" } },
      },
    ]);
    expect(sort.lambda).toEqual({
      type: "predicate",
      code: "return input.Raw[0].weight > 1;",
    });
    expect(sort.kernel).toBe('return { "Cell.In": input.Raw };');
    expect(document.scenarios[0]).toMatchObject({
      parameters: [
        { identifier: { text: "surge" }, type: "ratio", default: 0.5 },
      ],
      overrides: [{ name: { text: "limit" }, value: "scenario.surge * 2" }],
      initial: {
        kind: "marking",
        entries: [
          { name: { text: "Raw" }, value: '[[1, "a"], [2, "b"]]' },
          { name: { text: "Gate" }, value: "1" },
        ],
      },
    });
  });

  it("records where each declaration and name is", () => {
    const document = parseClean(`net
/// Waiting customers.
place Waiting
transition Serve {
  Waiting ->
}
`);

    expect(document.places[0]!.range).toEqual({
      startLine: 2,
      startColumn: 1,
      endLine: 3,
      endColumn: 14,
    });
    expect(document.places[0]!.name.range).toEqual({
      startLine: 3,
      startColumn: 7,
      endLine: 3,
      endColumn: 14,
    });
    expect(document.transitions[0]!.range).toMatchObject({
      startLine: 4,
      endLine: 6,
    });
    expect(document.transitions[0]!.inputs[0]!.target.range).toEqual({
      startLine: 5,
      startColumn: 3,
      endLine: 5,
      endColumn: 10,
    });
  });

  it("accepts a text without a header, with `components-only`, and with bare `fuse` lines", () => {
    expect(parseClean("place A\n")).toMatchObject({
      title: null,
      places: [{ name: { text: "A" } }],
    });
    expect(parseClean('net "Line" components-only\n')).toMatchObject({
      title: "Line",
      componentsOnly: true,
    });
    expect(parseClean("net components-only\nfuse A.Out, B.In\n")).toMatchObject(
      {
        componentsOnly: true,
        fusions: [{ name: null, members: [{}, {}] }],
      },
    );
  });

  it("reports a bad line with its range and keeps reading the rest", () => {
    const { document, diagnostics } = parsePetrinautDsl(`net "Broken"
place A
plaec B
transition T {
  A -> B
  rate { return 1; }
  A -> B
}
type Part { weight: money }
place C
`);

    expect(diagnostics).toEqual([
      {
        severity: "error",
        message: 'Unknown declaration "plaec"',
        range: { startLine: 3, startColumn: 1, endLine: 3, endColumn: 6 },
      },
      {
        severity: "error",
        message: "A transition has one arcs line: inputs -> outputs",
        range: { startLine: 7, startColumn: 3, endLine: 7, endColumn: 9 },
      },
      {
        severity: "error",
        message:
          'Unknown element type "money"; expected one of real, integer, boolean, uuid, string',
        range: { startLine: 9, startColumn: 21, endLine: 9, endColumn: 26 },
      },
    ]);
    expect(document.places.map((place) => place.name.text)).toEqual(["A", "C"]);
    expect(document.transitions[0]).toMatchObject({
      name: { text: "T" },
      lambda: { type: "stochastic" },
    });
    expect(document.types).toEqual([]);
  });

  it("reports an unclosed body once and skips the block a failed head opened", () => {
    const { document, diagnostics } = parsePetrinautDsl(`transition {
  A -> B
}
place After
metric Count { return state.places.After.count;
`);

    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'Expected a transition name, found "{"',
      'The code body\'s "{" has no matching "}"',
    ]);
    expect(document.places.map((place) => place.name.text)).toEqual(["After"]);
    expect(document.transitions).toEqual([]);
  });

  it("tells a place called `read` from a read arc and a code keyword from a place", () => {
    const document = parseClean(`place read
place rate
transition T {
  read, rate -> read
}
`);

    expect(document.transitions[0]!.inputs).toMatchObject([
      { type: "standard", target: { place: { text: "read" } } },
      { type: "standard", target: { place: { text: "rate" } } },
    ]);
  });
});

describe("skipCodeBlock", () => {
  it("counts braces outside strings, templates and comments", () => {
    const text = `{ const a = '}'; const b = \`\${ { x: 1 }.x }\`; // }\n /* } */ return { y: '{' }; } tail`;

    expect(text.slice(skipCodeBlock(text, 0)!)).toBe(" tail");
    expect(skipCodeBlock("{ return 1;", 0)).toBeNull();
  });
});
