import { describe, expect, it } from "vitest";

import { createSDCPNLanguageService } from "./create-sdcpn-language-service";
import { createSDCPN } from "./helper/create-sdcpn";

describe("createSDCPNLanguageService", () => {
  describe("getSemanticDiagnostics", () => {
    it("returns no errors for valid code accessing defined token properties", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [
          {
            id: "color1",
            elements: [{ elementId: "x", name: "x", type: "real" }],
          },
        ],
        differentialEquations: [
          {
            colorId: "color1",
            code: `export default Dynamics((tokens, parameters) => {
              const value = tokens[0].x;
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
            elements: [{ elementId: "x", name: "x", type: "real" }],
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
      const code = `export default Dynamics((tokens, parameters) => {
        const value = tokens[0].undefinedProperty;
      });`;
      const sdcpn = createSDCPN({
        types: [
          {
            id: "color1",
            elements: [{ elementId: "x", name: "x", type: "real" }],
          },
        ],
        differentialEquations: [
          {
            colorId: "color1",
            code,
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
      expect(errorEnd).toBeLessThanOrEqual(code.length);
      expect(code.slice(errorStart, errorEnd)).toBe("undefinedProperty");
    });

    it("returns an error when accessing undefined parameter", () => {
      // GIVEN
      const code = `export default Dynamics((tokens, parameters) => {
        const value = parameters.undefinedParam;
      });`;
      const sdcpn = createSDCPN({
        types: [
          {
            id: "color1",
            elements: [{ elementId: "x", name: "x", type: "real" }],
          },
        ],
        parameters: [
          { id: "p1", name: "Alpha", variableName: "alpha", type: "real" },
        ],
        differentialEquations: [
          {
            colorId: "color1",
            code,
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
      expect(errorEnd).toBeLessThanOrEqual(code.length);
      expect(code.slice(errorStart, errorEnd)).toBe("undefinedParam");
    });

    it("returns a syntax error for invalid TypeScript code", () => {
      // GIVEN
      const code = `export default Dynamics((tokens, parameters) => {
        const x = ;
      });`;
      const sdcpn = createSDCPN({
        types: [{ id: "color1" }],
        differentialEquations: [
          {
            colorId: "color1",
            code,
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
      expect(errorStart).toBeLessThan(code.length);
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
              { elementId: "x", name: "x", type: "real" },
              { elementId: "y", name: "y", type: "real" },
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
            elements: [{ elementId: "x", name: "x", type: "real" }],
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
});
