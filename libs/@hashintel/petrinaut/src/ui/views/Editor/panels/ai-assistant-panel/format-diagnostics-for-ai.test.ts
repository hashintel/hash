import type { SDCPN } from "@hashintel/petrinaut-core";
import { describe, expect, test } from "vitest";
import {
  type Diagnostic,
  DiagnosticSeverity,
} from "vscode-languageserver-types";

import { formatDiagnosticsForAi } from "./format-diagnostics-for-ai";

const definition: SDCPN = {
  places: [],
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
  severity: DiagnosticSeverity.Error,
  source: "ts",
  ...overrides,
});

describe("formatDiagnosticsForAi", () => {
  test("reports an empty diagnostics state", () => {
    expect(
      formatDiagnosticsForAi({
        definition,
        diagnosticsByUri: new Map(),
      }),
    ).toBe("No errors detected in your model – everything compiles!");
  });

  test("formats transition and differential-equation diagnostics", () => {
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
            severity: DiagnosticSeverity.Warning,
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
    ]);

    expect(formatDiagnosticsForAi({ definition, diagnosticsByUri })).toBe(
      [
        "Current TypeScript diagnostics (3 issues):",
        "- Transition: Infect lambda: error TS2304 at Ln 4, Col 11: Cannot find name 'infected'.",
        "- Transition: Infect kernel: warning TS2322 at Ln 2, Col 3: Type 'string' is not assignable to type 'number'.",
        "- Differential Equation: Viral load: error TS1128 at Ln 1, Col 1: Declaration or statement expected.",
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
