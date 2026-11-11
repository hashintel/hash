import { describe, expect, it } from "vitest";

import {
  DEFAULT_DIFFERENTIAL_EQUATION_CODE,
  generateDefaultDifferentialEquationCode,
} from "./default-codes";
import { compileHirArtifacts, lowerTypeScriptToHir } from "./hir";

import type { Color, SDCPN } from "./types/sdcpn";

const body: Color = {
  id: "body",
  name: "Body",
  iconSlug: "circle",
  displayColor: "#000000",
  elements: [
    { elementId: "x", name: "x", type: "real" },
    { elementId: "alive", name: "alive", type: "boolean" },
  ],
};

const netWith = (code: string, arity: number): SDCPN => ({
  types: [body],
  differentialEquations: [
    {
      id: "equation",
      name: "Equation",
      colorId: body.id,
      code,
      arity,
    },
  ],
  parameters: [],
  places: [],
  transitions: [],
});

describe("generateDefaultDifferentialEquationCode", () => {
  it.each([1, 2, 3])(
    "produces a template that compiles for arity %s",
    (arity) => {
      const code = generateDefaultDifferentialEquationCode(body, arity);
      const { failures } = compileHirArtifacts(netWith(code, arity));
      expect(
        failures.flatMap((failure) =>
          failure.diagnostics.map((diagnostic) => diagnostic.message),
        ),
      ).toEqual([]);
    },
  );

  it("names one token parameter per coupled token", () => {
    const code = generateDefaultDifferentialEquationCode(body, 3);
    expect(code).toContain("const [a, b, c] = tokens;");
    expect(code.match(/x: 1/g)).toHaveLength(3);
  });

  it("destructures the single token of an arity-1 equation", () => {
    expect(generateDefaultDifferentialEquationCode(body, 1)).toContain(
      "const { x, alive } = token;",
    );
  });

  it.each([
    ["generated", generateDefaultDifferentialEquationCode(body, 1)],
    ["fallback", DEFAULT_DIFFERENTIAL_EQUATION_CODE],
  ])(
    "reads `token` and never the `tokens` tuple in the %s arity-1 template",
    (_label, code) => {
      expect(code).not.toMatch(/\btokens\b/);
      const result = lowerTypeScriptToHir(code, "dynamics", { arity: 1 });
      expect(
        result.diagnostics.map((diagnostic) => diagnostic.message),
      ).toEqual([]);
      expect(result.ok).toBe(true);
    },
  );
});
