import { describe, expect, it } from "vitest";

import { assemblyLine } from "../examples/assembly-line";
import { cafeQueue } from "../examples/cafe-queue";
import { printPetrinautDsl } from "./print";

import type { Place, SDCPN, Transition } from "../types/sdcpn";

const place = (id: string, overrides: Partial<Place> = {}): Place => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
  ...overrides,
});

const transition = (
  id: string,
  overrides: Partial<Transition> = {},
): Transition => ({
  id,
  name: id,
  inputArcs: [],
  outputArcs: [],
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
  ...overrides,
});

const lineOf = (text: string, line: number): string =>
  text.split("\n")[line - 1]!;

describe("printPetrinautDsl", () => {
  it("prints the Assembly Line with its components inline, then instances, fusions and metrics", () => {
    const { text } = printPetrinautDsl({
      sdcpn: assemblyLine.petriNetDefinition,
      title: assemblyLine.title,
    });

    expect(text).toContain('net "Assembly Line"\n');
    expect(text).toContain(
      'component Source from "hash.standard-components/source" {\n  param rate: real = 1\n  /// The tokens the source creates.\n  port out Out\n  transition Emit {\n    -> Out\n    rate { return parameters.rate; }\n  }\n}',
    );
    expect(text).toContain("  port in In\n  port out Out\n");
    expect(text).toContain("place Buffer capacity 5 start\n");
    expect(text).toContain("instance Cutter = Stage(rate = 2)\n");
    expect(text).toContain("fuse RawParts = Parts.Out, Cutter.In\n");
    expect(text).toContain("fuse Buffer, Cutter.Out, Drill.In\n");
    expect(text).toContain(
      'metric "Finished parts" { return state.places.Finished.count; }\n',
    );
    // Declarations are separated by blank lines, section by section.
    expect(text).toMatch(/\}\n\n\/\/\/ Cut parts waiting/u);
  });

  it("records the lines each entity occupies", () => {
    const { text, spans } = printPetrinautDsl({
      sdcpn: assemblyLine.petriNetDefinition,
    });

    const buffer = spans.find(
      (span) => span.kind === "place" && span.id === "place__buffer",
    )!;
    expect(lineOf(text, buffer.startLine)).toMatch(/^\/\/\/ Cut parts/u);
    expect(lineOf(text, buffer.endLine)).toBe("place Buffer capacity 5 start");
    const fusion = spans.find(
      (span) => span.kind === "fusion" && span.id === "fusion__buffer",
    )!;
    expect(lineOf(text, fusion.endLine)).toBe(
      "fuse Buffer, Cutter.Out, Drill.In",
    );
    const stage = spans.find((span) => span.kind === "subnet")!;
    expect(lineOf(text, stage.endLine)).toBe("}");
    expect(spans.find((span) => span.kind === "net")?.startLine).toBe(1);
  });

  it("unwraps module-form code and writes untitled nets, scenarios and parameters with labels", () => {
    const { text } = printPetrinautDsl({
      sdcpn: cafeQueue.petriNetDefinition,
    });

    expect(text.startsWith("/// Stochastic café service")).toBe(true);
    expect(text).toContain("\nnet\n");
    expect(text).toContain("param arrival_rate: real = 1.2\n");
    expect(text).toContain(
      'param begin_rate "Begin Service Rate": real = 0.4\n',
    );
    expect(text).toContain(
      "transition BeginService {\n  Waiting, FreeStaff -> Serving\n  rate {\n",
    );
    expect(text).toContain("    return parameters.begin_rate;\n  }\n");
    expect(text).toContain(
      'scenario "Morning Rush" {\n  param arrival_rate: real = 1.2\n',
    );
    expect(text).toContain("  override arrival_rate = scenario.arrival_rate\n");
  });

  it("writes weights, arc kinds, ports used by transitions, types, dynamics and visualizers", () => {
    const sdcpn: SDCPN = {
      componentsOnly: false,
      types: [
        {
          id: "part",
          name: "Part",
          iconSlug: "circle",
          displayColor: "#000",
          elements: [
            { elementId: "w", name: "weight", type: "real" },
            { elementId: "k", name: "kind", type: "string" },
          ],
        },
      ],
      parameters: [],
      differentialEquations: [
        {
          id: "cool",
          name: "Cool down",
          colorId: "part",
          code: "export default Dynamics((tokens, parameters) => tokens.map(() => ({ weight: -1 })));",
        },
      ],
      places: [
        place("raw", {
          name: "Raw",
          colorId: "part",
          dynamicsEnabled: true,
          differentialEquationId: "cool",
          visualizerCode: "export default Visualization(() => <svg />);",
        }),
        place("gate", { name: "Gate" }),
        place("scrap", { name: "Scrap", capacity: 3 }),
      ],
      subnets: [
        {
          id: "cell",
          name: "Work cell",
          places: [
            place("in", { name: "In", isPort: true, portDirection: "in" }),
          ],
          transitions: [],
          types: [],
          differentialEquations: [],
          parameters: [],
        },
      ],
      componentInstances: [
        {
          id: "c1",
          name: "Cell",
          subnetId: "cell",
          parameterValues: {},
          x: 0,
          y: 0,
        },
      ],
      transitions: [
        transition("sort", {
          name: "Sort",
          inputArcs: [
            { placeId: "raw", weight: 2, type: "standard" },
            { placeId: "gate", weight: 1, type: "read" },
            { placeId: "scrap", weight: 1, type: "inhibitor" },
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
          lambdaCode: "return input.Raw[0].weight > 1;",
          transitionKernelCode: "",
        }),
      ],
    };

    const { text } = printPetrinautDsl({ sdcpn, title: "Sorting" });

    expect(text).toBe(`net "Sorting"

component "Work cell" {
  port in In
}

type Part { weight: real, kind: string }

dynamics "Cool down" (Part) { return tokens.map(() => ({ weight: -1 })); }

place Raw: Part dynamics "Cool down" {
  visualizer { export default Visualization(() => <svg />); }
}
place Gate
place Scrap capacity 3

instance Cell = "Work cell"

transition Sort {
  2 Raw, read Gate, inhibit Scrap -> 2 Cell.In
  guard { return input.Raw[0].weight > 1; }
}
`);
  });

  it("marks a components-only net on its header", () => {
    const { text } = printPetrinautDsl({
      sdcpn: {
        componentsOnly: true,
        places: [],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
      },
      title: "Line",
    });

    expect(text).toBe('net "Line" components-only\n');
  });
});
