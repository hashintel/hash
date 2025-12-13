import { describe, expect, it } from "vitest";

import { createSDCPNLanguageService } from "./create-sdcpn-language-service";
import { createSDCPN } from "./helper/create-sdcpn";

describe("createSDCPNLanguageService", () => {
  describe("getSemanticDiagnostics", () => {
    it("returns no errors for valid code accessing defined token properties", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        differentialEquations: [
          {
            colorId: "color1",
            code: `export default Dynamics((tokens, parameters) => {
              const value = tokens[0].x;
              return tokens;
            });`,
          },
        ],
      });
      const de = sdcpn.differentialEquations[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const diagnostics = service.getSemanticDiagnostics(
        `differential_equations/${de.id}/code.ts`,
      );

      // THEN
      expect(diagnostics).toHaveLength(0);
    });

    it("returns no errors for valid code accessing defined parameters", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [
          {
            id: "color1",
            elements: [{ name: "x", type: "real" }],
          },
        ],
        parameters: [
          { id: "p1", variableName: "alpha", type: "real" },
          { id: "p2", variableName: "enabled", type: "boolean" },
        ],
        differentialEquations: [
          {
            colorId: "color1",
            code: `export default Dynamics((tokens, parameters) => {
              const a = parameters.alpha;
              const e = parameters.enabled;
              return tokens;
            });`,
          },
        ],
      });
      const de = sdcpn.differentialEquations[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const diagnostics = service.getSemanticDiagnostics(
        `differential_equations/${de.id}/code.ts`,
      );

      // THEN
      expect(diagnostics).toHaveLength(0);
    });

    it("returns an error when accessing undefined token property", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [
          {
            id: "color1",
            elements: [{ name: "x", type: "real" }],
          },
        ],
        differentialEquations: [
          {
            colorId: "color1",
            code: `export default Dynamics((tokens, parameters) => {
              const value = tokens[0].undefinedProperty;
              return tokens;
            });`,
          },
        ],
      });
      const de = sdcpn.differentialEquations[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const diagnostics = service.getSemanticDiagnostics(
        `differential_equations/${de.id}/code.ts`,
      );

      // THEN
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0]?.messageText).toContain("undefinedProperty");
      // Verify error position is relative to user code, not including prefix
      const errorStart = diagnostics[0]?.start ?? -1;
      const errorEnd = errorStart + (diagnostics[0]?.length ?? 0);
      expect(errorStart).toBeGreaterThanOrEqual(0);
      expect(errorEnd).toBeLessThanOrEqual(de.code.length);
      expect(de.code.slice(errorStart, errorEnd)).toBe("undefinedProperty");
    });

    it("returns an error when accessing undefined parameter", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [
          {
            id: "color1",
            elements: [{ name: "x", type: "real" }],
          },
        ],
        parameters: [{ id: "p1", variableName: "alpha", type: "real" }],
        differentialEquations: [
          {
            colorId: "color1",
            code: `export default Dynamics((tokens, parameters) => {
              const value = parameters.undefinedParam;
              return tokens;
            });`,
          },
        ],
      });
      const de = sdcpn.differentialEquations[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const diagnostics = service.getSemanticDiagnostics(
        `differential_equations/${de.id}/code.ts`,
      );

      // THEN
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0]?.messageText).toContain("undefinedParam");
      // Verify error position is relative to user code, not including prefix
      const errorStart = diagnostics[0]?.start ?? -1;
      const errorEnd = errorStart + (diagnostics[0]?.length ?? 0);
      expect(errorStart).toBeGreaterThanOrEqual(0);
      expect(errorEnd).toBeLessThanOrEqual(de.code.length);
      expect(de.code.slice(errorStart, errorEnd)).toBe("undefinedParam");
    });

    it("returns a syntax error for invalid TypeScript code", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1" }],
        differentialEquations: [
          {
            colorId: "color1",
            code: `export default Dynamics((tokens, parameters) => {
              const x = ;
            });`,
          },
        ],
      });
      const de = sdcpn.differentialEquations[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const diagnostics = service.getSyntacticDiagnostics(
        `differential_equations/${de.id}/code.ts`,
      );

      // THEN
      expect(diagnostics.length).toBeGreaterThan(0);
      // Verify error position is relative to user code, not including prefix
      const errorStart = diagnostics[0]?.start ?? -1;
      expect(errorStart).toBeGreaterThanOrEqual(0);
      expect(errorStart).toBeLessThan(de.code.length);
    });
  });

  describe("getCompletionsAtPosition", () => {
    it("provides completions for token properties", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [
          {
            id: "color1",
            elements: [
              { name: "x", type: "real" },
              { name: "y", type: "real" },
            ],
          },
        ],
        differentialEquations: [
          {
            colorId: "color1",
            code: `export default Dynamics((tokens, parameters) => {
              tokens[0].`,
          },
        ],
      });
      const de = sdcpn.differentialEquations[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const completions = service.getCompletionsAtPosition(
        `differential_equations/${de.id}/code.ts`,
        de.code.length,
        {},
      );

      // THEN
      expect(completions).toBeDefined();
      const completionNames = completions?.entries.map((entry) => entry.name);
      expect(completionNames).toEqual(["x", "y"]);
    });

    it("provides completions for parameters", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [
          {
            id: "color1",
            elements: [{ name: "x", type: "real" }],
          },
        ],
        parameters: [
          { id: "p1", variableName: "alpha", type: "real" },
          { id: "p2", variableName: "beta", type: "integer" },
          { id: "p3", variableName: "enabled", type: "boolean" },
        ],
        differentialEquations: [
          {
            colorId: "color1",
            code: `export default Dynamics((tokens, parameters) => {
              parameters.`,
          },
        ],
      });
      const de = sdcpn.differentialEquations[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const completions = service.getCompletionsAtPosition(
        `differential_equations/${de.id}/code.ts`,
        de.code.length,
        {},
      );

      // THEN
      expect(completions).toBeDefined();
      const completionNames = completions?.entries.map((entry) => entry.name);
      expect(completionNames).toEqual(["alpha", "beta", "enabled"]);
    });
  });

  describe("Transition Lambda", () => {
    it("returns no errors for valid Lambda code accessing input tokens", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [{ id: "place1", name: "Source", colorId: "color1" }],
        transitions: [
          {
            id: "t1",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "place1", weight: 1 }],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              const token = input.Source[0];
              return token.x > 0;
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const diagnostics = service.getSemanticDiagnostics(
        `transitions/${transition.id}/lambda/code.ts`,
      );

      // THEN
      expect(diagnostics).toHaveLength(0);
    });

    it("returns an error when accessing undefined input place in Lambda", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [{ id: "place1", name: "Source", colorId: "color1" }],
        transitions: [
          {
            id: "t1",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "place1", weight: 1 }],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              const token = input.UndefinedPlace[0];
              return true;
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const diagnostics = service.getSemanticDiagnostics(
        `transitions/${transition.id}/lambda/code.ts`,
      );

      // THEN
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0]?.messageText).toContain("UndefinedPlace");
    });

    it("returns an error when Lambda returns wrong type for predicate", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [{ id: "place1", name: "Source", colorId: "color1" }],
        transitions: [
          {
            id: "t1",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "place1", weight: 1 }],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              return 42;
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const diagnostics = service.getSemanticDiagnostics(
        `transitions/${transition.id}/lambda/code.ts`,
      );

      // THEN
      expect(diagnostics.length).toBeGreaterThan(0);
    });

    it("returns no errors for stochastic Lambda returning number", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "rate", type: "real" }] }],
        places: [{ id: "place1", name: "Source", colorId: "color1" }],
        transitions: [
          {
            id: "t1",
            lambdaType: "stochastic",
            inputArcs: [{ placeId: "place1", weight: 1 }],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              return input.Source[0].rate;
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const diagnostics = service.getSemanticDiagnostics(
        `transitions/${transition.id}/lambda/code.ts`,
      );

      // THEN
      expect(diagnostics).toHaveLength(0);
    });

    it("provides completions for input places in Lambda", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [
          { id: "place1", name: "Source", colorId: "color1" },
          { id: "place2", name: "Buffer", colorId: "color1" },
        ],
        transitions: [
          {
            id: "t1",
            lambdaType: "predicate",
            inputArcs: [
              { placeId: "place1", weight: 1 },
              { placeId: "place2", weight: 2 },
            ],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              input.`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const completions = service.getCompletionsAtPosition(
        `transitions/${transition.id}/lambda/code.ts`,
        transition.lambdaCode.length,
        {},
      );

      // THEN
      expect(completions).toBeDefined();
      const completionNames = completions?.entries.map((entry) => entry.name);
      expect(completionNames).toContain("Source");
      expect(completionNames).toContain("Buffer");
    });
  });

  describe("Transition Kernel", () => {
    it("returns no errors for valid TransitionKernel code", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [
          { id: "place1", name: "Source", colorId: "color1" },
          { id: "place2", name: "Target", colorId: "color1" },
        ],
        transitions: [
          {
            id: "t1",
            inputArcs: [{ placeId: "place1", weight: 1 }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { Target: [input.Source[0]] };
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const diagnostics = service.getSemanticDiagnostics(
        `transitions/${transition.id}/kernel/code.ts`,
      );

      // THEN
      expect(diagnostics).toHaveLength(0);
    });

    it("returns an error when TransitionKernel returns wrong output place", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [
          { id: "place1", name: "Source", colorId: "color1" },
          { id: "place2", name: "Target", colorId: "color1" },
        ],
        transitions: [
          {
            id: "t1",
            inputArcs: [{ placeId: "place1", weight: 1 }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { WrongPlace: [input.Source[0]] };
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const diagnostics = service.getSemanticDiagnostics(
        `transitions/${transition.id}/kernel/code.ts`,
      );

      // THEN
      expect(diagnostics.length).toBeGreaterThan(0);
    });

    it("returns an error when TransitionKernel output has wrong token count", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [
          { id: "place1", name: "Source", colorId: "color1" },
          { id: "place2", name: "Target", colorId: "color1" },
        ],
        transitions: [
          {
            id: "t1",
            inputArcs: [{ placeId: "place1", weight: 1 }],
            outputArcs: [{ placeId: "place2", weight: 2 }], // expects 2 tokens
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { Target: [input.Source[0]] };
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const diagnostics = service.getSemanticDiagnostics(
        `transitions/${transition.id}/kernel/code.ts`,
      );

      // THEN
      expect(diagnostics.map((diag) => diag.code)).toEqual([2345]);
    });

    it("provides completions for output places in TransitionKernel", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [
          { id: "place1", name: "Source", colorId: "color1" },
          { id: "place2", name: "Target", colorId: "color1" },
          { id: "place3", name: "Sink", colorId: "color1" },
        ],
        transitions: [
          {
            id: "t1",
            inputArcs: [{ placeId: "place1", weight: 1 }],
            outputArcs: [
              { placeId: "place2", weight: 1 },
              { placeId: "place3", weight: 1 },
            ],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return {`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const completions = service.getCompletionsAtPosition(
        `transitions/${transition.id}/kernel/code.ts`,
        transition.transitionKernelCode.length,
        {},
      );

      // THEN
      expect(completions).toBeDefined();
      const completionNames = completions?.entries.map((entry) => entry.name);
      expect(completionNames).toContain("Target");
      expect(completionNames).toContain("Sink");
    });

    it("allows accessing parameters in TransitionKernel", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [
          { id: "place1", name: "Source", colorId: "color1" },
          { id: "place2", name: "Target", colorId: "color1" },
        ],
        parameters: [{ id: "p1", variableName: "multiplier", type: "real" }],
        transitions: [
          {
            id: "t1",
            inputArcs: [{ placeId: "place1", weight: 1 }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              const newX = input.Source[0].x * parameters.multiplier;
              return { Target: [{ x: newX }] };
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const diagnostics = service.getSemanticDiagnostics(
        `transitions/${transition.id}/kernel/code.ts`,
      );

      // THEN
      expect(diagnostics).toHaveLength(0);
    });

    it("excludes input places without color from input type", () => {
      // GIVEN - place2 has no color, so it should not appear in input
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [
          { id: "place1", name: "Source", colorId: "color1" },
          { id: "place2", name: "Untyped", colorId: null },
        ],
        transitions: [
          {
            id: "t1",
            inputArcs: [
              { placeId: "place1", weight: 1 },
              { placeId: "place2", weight: 1 },
            ],
            outputArcs: [],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              // Accessing Untyped should fail since it has no color
              const token = input.Untyped[0];
              return {};
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const diagnostics = service.getSemanticDiagnostics(
        `transitions/${transition.id}/kernel/code.ts`,
      );

      // THEN - should error because Untyped is not in the input type
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0]?.messageText).toContain("Untyped");
    });

    it("excludes output places without color from output type", () => {
      // GIVEN - place2 has no color, so it should not be allowed in output
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [
          { id: "place1", name: "Source", colorId: "color1" },
          { id: "place2", name: "Untyped", colorId: null },
        ],
        transitions: [
          {
            id: "t1",
            inputArcs: [{ placeId: "place1", weight: 1 }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              // Returning Untyped should fail since it has no color
              return { Untyped: [{ x: 1 }] };
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const service = createSDCPNLanguageService(sdcpn);
      const diagnostics = service.getSemanticDiagnostics(
        `transitions/${transition.id}/kernel/code.ts`,
      );

      // THEN - should error because Untyped is not in the output type
      expect(diagnostics.length).toBeGreaterThan(0);
    });
  });
});
