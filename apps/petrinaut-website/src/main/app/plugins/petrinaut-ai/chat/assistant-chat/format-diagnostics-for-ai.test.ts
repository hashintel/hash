import { describe, expect, test } from "vitest";

import { formatDiagnosticsForAi } from "./format-diagnostics-for-ai";

import type { SDCPN } from "@hashintel/petrinaut-core";
import type { DiagnosticsSnapshot } from "@hashintel/petrinaut/ui/plugin";

type Diagnostic =
  DiagnosticsSnapshot["byUri"] extends Map<string, (infer Item)[]>
    ? Item
    : never;

/** LSP severity codes. */
const errorSeverity = 1;
const warningSeverity = 2;

const definition: SDCPN = {
  places: [
    {
      id: "place__ward",
      name: "Ward",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      visualizerCode: "",
      x: 0,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "transition__infect",
      name: "Infect",
      inputArcs: [],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [
    {
      id: "de__viral_load",
      name: "Viral load",
      colorId: null,
      code: "",
    },
  ],
  parameters: [],
};

const diagnostic = (
  message: string,
  overrides: Partial<Diagnostic> = {},
): Diagnostic => ({
  message,
  range: {
    start: { line: 1, character: 2 },
    end: { line: 1, character: 8 },
  },
  severity: errorSeverity,
  source: "ts",
  ...overrides,
});

describe("formatDiagnosticsForAi", () => {
  test("reports that no errors or warnings were found in net function code", () => {
    expect(
      formatDiagnosticsForAi({
        definition,
        diagnosticsByUri: new Map(),
      }),
    ).toBe(
      "No errors or warnings found in net function code. Scenario and metric compilation is checked when creating an experiment.",
    );
  });

  test("formats transition, differential-equation and visualizer diagnostics", () => {
    const diagnosticsByUri = new Map<string, Diagnostic[]>([
      [
        "inmemory://sdcpn/transitions/transition__infect/lambda.ts",
        [
          diagnostic("Cannot find name 'infected'.", {
            code: 2304,
            range: {
              start: { line: 3, character: 10 },
              end: { line: 3, character: 18 },
            },
          }),
        ],
      ],
      [
        "inmemory://sdcpn/transitions/transition__infect/kernel.ts",
        [
          diagnostic("Type 'string' is not assignable to type 'number'.", {
            code: 2322,
            severity: warningSeverity,
          }),
        ],
      ],
      [
        "inmemory://sdcpn/differential-equations/de__viral_load.ts",
        [
          diagnostic("Declaration or statement expected.", {
            code: 1128,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 1 },
            },
          }),
        ],
      ],
      [
        "inmemory://sdcpn/places/place__ward/visualizer.jsx",
        [
          diagnostic("Property 'strokeWidht' does not exist.", {
            code: 2322,
          }),
        ],
      ],
    ]);

    expect(formatDiagnosticsForAi({ definition, diagnosticsByUri })).toBe(
      [
        "Current TypeScript diagnostics (4 issues):",
        "- Transition: Infect lambda: error TS2304 at Ln 4, Col 11: Cannot find name 'infected'.",
        "- Transition: Infect kernel: warning TS2322 at Ln 2, Col 3: Type 'string' is not assignable to type 'number'.",
        "- Differential Equation: Viral load: error TS1128 at Ln 1, Col 1: Declaration or statement expected.",
        "- Place: Ward visualizer: error TS2322 at Ln 2, Col 3: Property 'strokeWidht' does not exist.",
      ].join("\n"),
    );
  });

  test("limits long diagnostics lists", () => {
    const diagnosticsByUri = new Map<string, Diagnostic[]>([
      [
        "inmemory://sdcpn/transitions/transition__infect/lambda.ts",
        [diagnostic("First"), diagnostic("Second"), diagnostic("Third")],
      ],
    ]);

    expect(
      formatDiagnosticsForAi({
        definition,
        diagnosticsByUri,
        maxDiagnostics: 2,
      }),
    ).toContain("... 1 additional diagnostic omitted.");
  });
});
