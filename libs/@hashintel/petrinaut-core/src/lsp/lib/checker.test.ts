import ts from "typescript";
import { describe, expect, it } from "vitest";

import { checkSDCPN } from "./checker";
import { SDCPNLanguageServer } from "./create-sdcpn-language-service";
import { createSDCPN } from "./helper/create-sdcpn";

import type { PetrinautExtensionSettings } from "../../extensions";
import type { SDCPN } from "../../types/sdcpn";

/** Create a server, sync the SDCPN, and run diagnostics. */
function check(sdcpn: SDCPN, extensions?: PetrinautExtensionSettings) {
  const server = new SDCPNLanguageServer();
  server.syncFiles(sdcpn, extensions);
  return checkSDCPN(sdcpn, server, extensions);
}

describe("checkSDCPN", () => {
  describe("Color IDs with special characters", () => {
    it("handles UUID-style color IDs with dashes", () => {
      // GIVEN - color ID in UUID format
      const sdcpn = createSDCPN({
        types: [
          {
            id: "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
            elements: [{ name: "value", type: "real" }],
          },
        ],
        places: [
          {
            id: "place1",
            name: "Source",
            colorId: "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
          },
          {
            id: "place2",
            name: "Target",
            colorId: "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
          },
        ],
        transitions: [
          {
            id: "t1",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            lambdaCode: `export default Lambda((input, parameters) => {
              return input.Source[0].value > 0;
            });`,
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { Target: [input.Source[0]] };
            });`,
          },
        ],
      });

      // WHEN
      const result = check(sdcpn);

      // THEN - should be valid
      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });
  });

  describe("Differential Equations", () => {
    it("returns valid for code accessing defined token properties", () => {
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

      // WHEN
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });

    it("returns valid for code accessing defined parameters", () => {
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

      // WHEN
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });

    it("returns invalid when accessing undefined token property", () => {
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
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics).toHaveLength(1);
      expect(result.itemDiagnostics[0]?.itemId).toBe(de.id);
      expect(result.itemDiagnostics[0]?.itemType).toBe("differential-equation");
      expect(result.itemDiagnostics[0]?.diagnostics.length).toBeGreaterThan(0);
      expect(result.itemDiagnostics[0]?.diagnostics[0]?.messageText).toContain(
        "undefinedProperty",
      );
    });

    it("returns valid when returning derivatives only for real attributes", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [
          {
            id: "color1",
            elements: [
              { name: "x", type: "real" },
              { name: "count", type: "integer" },
              { name: "flag", type: "boolean" },
            ],
          },
        ],
        differentialEquations: [
          {
            colorId: "color1",
            code: `export default Dynamics((tokens, parameters) => {
              return tokens.map(({ x, count, flag }) => {
                return { x: flag ? x + count : x };
              });
            });`,
          },
        ],
      });

      // WHEN
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });

    it("returns invalid when returning a derivative for a discrete attribute", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [
          {
            id: "color1",
            elements: [
              { name: "x", type: "real" },
              { name: "flag", type: "boolean" },
            ],
          },
        ],
        differentialEquations: [
          {
            colorId: "color1",
            code: `export default Dynamics((tokens, parameters) => {
              return tokens.map(({ x }) => {
                return { x: 1, flag: 0 };
              });
            });`,
          },
        ],
      });
      const de = sdcpn.differentialEquations[0]!;

      // WHEN
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics).toHaveLength(1);
      expect(result.itemDiagnostics[0]?.itemId).toBe(de.id);
      expect(result.itemDiagnostics[0]?.itemType).toBe("differential-equation");
      // The assignability error is a nested DiagnosticMessageChain naming the
      // offending discrete attribute.
      expect(
        ts.flattenDiagnosticMessageText(
          result.itemDiagnostics[0]?.diagnostics[0]?.messageText,
          "\n",
        ),
      ).toContain("flag");
    });

    it("returns invalid when accessing undefined parameter", () => {
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
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics).toHaveLength(1);
      expect(result.itemDiagnostics[0]?.itemId).toBe(de.id);
      expect(result.itemDiagnostics[0]?.diagnostics[0]?.messageText).toContain(
        "undefinedParam",
      );
    });

    it("returns invalid for syntax errors in TypeScript code", () => {
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
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics).toHaveLength(1);
      expect(result.itemDiagnostics[0]?.itemId).toBe(de.id);
      expect(result.itemDiagnostics[0]?.itemType).toBe("differential-equation");
      expect(result.itemDiagnostics[0]?.diagnostics.length).toBeGreaterThan(0);
    });
  });

  describe("Transition Lambda", () => {
    it("returns valid for Lambda code accessing input tokens", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [{ id: "place1", name: "Source", colorId: "color1" }],
        transitions: [
          {
            id: "t1",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              const token = input.Source[0];
              return token.x > 0;
            });`,
          },
        ],
      });

      // WHEN
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });

    it("returns invalid when accessing undefined input place in Lambda", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [{ id: "place1", name: "Source", colorId: "color1" }],
        transitions: [
          {
            id: "t1",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
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
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics).toHaveLength(1);
      expect(result.itemDiagnostics[0]?.itemId).toBe(transition.id);
      expect(result.itemDiagnostics[0]?.itemType).toBe("transition-lambda");
      expect(result.itemDiagnostics[0]?.diagnostics[0]?.messageText).toContain(
        "UndefinedPlace",
      );
    });

    it("returns invalid when Lambda returns wrong type for predicate", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [{ id: "place1", name: "Source", colorId: "color1" }],
        transitions: [
          {
            id: "t1",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              return 42;
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics).toHaveLength(1);
      expect(result.itemDiagnostics[0]?.itemId).toBe(transition.id);
      expect(result.itemDiagnostics[0]?.itemType).toBe("transition-lambda");
    });

    it("returns valid for stochastic Lambda returning number", () => {
      // GIVEN
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "rate", type: "real" }] }],
        places: [{ id: "place1", name: "Source", colorId: "color1" }],
        transitions: [
          {
            id: "t1",
            lambdaType: "stochastic",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              return input.Source[0].rate;
            });`,
          },
        ],
      });

      // WHEN
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });

    it("does not lint Lambda code when transition lambdas are unavailable", () => {
      const sdcpn = createSDCPN({
        places: [{ id: "place1", name: "Source", colorId: null }],
        transitions: [
          {
            id: "t1",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              return input.Source[0].missing;
            });`,
          },
        ],
      });

      const result = check(sdcpn, {
        colors: true,
        stochasticity: false,
        dynamics: true,
        parameters: true,
        subnets: true,
      });

      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });

    it("still lints predicate Lambda code when stochasticity is disabled but coloured inputs exist", () => {
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [{ id: "place1", name: "Source", colorId: "color1" }],
        transitions: [
          {
            id: "t1",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              return input.Source[0].missing;
            });`,
          },
        ],
      });

      const result = check(sdcpn, {
        colors: true,
        stochasticity: false,
        dynamics: true,
        parameters: true,
        subnets: true,
      });

      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics[0]?.itemType).toBe("transition-lambda");
      expect(result.itemDiagnostics[0]?.diagnostics[0]?.messageText).toContain(
        "missing",
      );
    });

    it("lints predicate Lambda code for colored component-port inputs", () => {
      const sdcpn: SDCPN = {
        ...createSDCPN({
          transitions: [
            {
              id: "t1",
              lambdaType: "predicate",
              inputArcs: [
                {
                  endpoint: {
                    kind: "componentPort",
                    componentInstanceId: "instance-1",
                    portPlaceId: "port-in",
                  },
                  weight: 1,
                  type: "standard",
                },
              ],
              outputArcs: [],
              lambdaCode: `export default Lambda((input) => {
                return input["Instance 1::PortIn"][0].missing > 0;
              });`,
            },
          ],
        }),
        componentInstances: [
          {
            id: "instance-1",
            name: "Instance 1",
            subnetId: "subnet-1",
            parameterValues: {},
            x: 0,
            y: 0,
          },
        ],
        subnets: [
          {
            id: "subnet-1",
            name: "Subnet 1",
            types: [
              {
                id: "subnet-color",
                name: "Subnet Color",
                iconSlug: "circle",
                displayColor: "#ff0000",
                elements: [{ elementId: "x", name: "x", type: "real" }],
              },
            ],
            places: [
              {
                id: "port-in",
                name: "PortIn",
                colorId: "subnet-color",
                dynamicsEnabled: false,
                differentialEquationId: null,
                isPort: true,
                x: 0,
                y: 0,
              },
            ],
            transitions: [],
            differentialEquations: [],
            parameters: [],
            componentInstances: [],
          },
        ],
      };

      const result = check(sdcpn, {
        colors: true,
        stochasticity: false,
        dynamics: true,
        parameters: true,
        subnets: true,
      });

      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics[0]?.itemType).toBe("transition-lambda");
      expect(result.itemDiagnostics[0]?.diagnostics[0]?.messageText).toContain(
        "missing",
      );
    });
  });

  describe("Transition Kernel", () => {
    it("returns valid for valid TransitionKernel code", () => {
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
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { Target: [input.Source[0]] };
            });`,
          },
        ],
      });

      // WHEN
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });

    it("allows plain TransitionKernel outputs when stochasticity is disabled", () => {
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [
          { id: "place1", name: "Source", colorId: "color1" },
          { id: "place2", name: "Target", colorId: "color1" },
        ],
        transitions: [
          {
            id: "t1",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { Target: [{ x: input.Source[0].x + 1 }] };
            });`,
          },
        ],
      });

      const result = check(sdcpn, {
        colors: true,
        stochasticity: false,
        dynamics: true,
        parameters: true,
        subnets: true,
      });

      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });

    it("allows Distribution for real attributes but not for discrete attributes", () => {
      // GIVEN — stochasticity enabled (default extensions), a colour mixing
      // real and discrete elements
      const types = [
        {
          id: "color1",
          elements: [
            { name: "x", type: "real" as const },
            { name: "count", type: "integer" as const },
            { name: "active", type: "boolean" as const },
          ],
        },
      ];
      const places = [
        { id: "place1", name: "Source", colorId: "color1" },
        { id: "place2", name: "Target", colorId: "color1" },
      ];
      const kernel = (body: string) =>
        createSDCPN({
          types,
          places,
          transitions: [
            {
              id: "t1",
              inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
              outputArcs: [{ placeId: "place2", weight: 1 }],
              transitionKernelCode: `export default TransitionKernel((input, parameters) => {
                return { Target: [${body}] };
              });`,
            },
          ],
        });

      // WHEN / THEN — Distribution on the real attribute is fine
      const valid = check(
        kernel(`{ x: Distribution.Gaussian(0, 1), count: 1, active: true }`),
      );
      expect(valid.isValid).toBe(true);
      expect(valid.itemDiagnostics).toHaveLength(0);

      // WHEN / THEN — Distribution on the integer attribute is a type error
      const invalidInteger = check(
        kernel(`{ x: 1, count: Distribution.Uniform(0, 5), active: true }`),
      );
      expect(invalidInteger.isValid).toBe(false);
      expect(invalidInteger.itemDiagnostics[0]?.itemType).toBe(
        "transition-kernel",
      );

      // WHEN / THEN — Distribution on the boolean attribute is a type error
      const invalidBoolean = check(
        kernel(`{ x: 1, count: 1, active: Distribution.Uniform(0, 1) }`),
      );
      expect(invalidBoolean.isValid).toBe(false);
      expect(invalidBoolean.itemDiagnostics[0]?.itemType).toBe(
        "transition-kernel",
      );
    });

    it("returns invalid when TransitionKernel uses Distribution while stochasticity is disabled", () => {
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [
          { id: "place1", name: "Source", colorId: "color1" },
          { id: "place2", name: "Target", colorId: "color1" },
        ],
        transitions: [
          {
            id: "t1",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { Target: [{ x: Distribution.Uniform(0, 1) }] };
            });`,
          },
        ],
      });

      const result = check(sdcpn, {
        colors: true,
        stochasticity: false,
        dynamics: true,
        parameters: true,
        subnets: true,
      });

      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics[0]?.itemType).toBe("transition-kernel");
      expect(result.itemDiagnostics[0]?.diagnostics[0]?.messageText).toContain(
        "Distribution",
      );
    });

    it("returns invalid when TransitionKernel returns wrong output place", () => {
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
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { WrongPlace: [input.Source[0]] };
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics).toHaveLength(1);
      expect(result.itemDiagnostics[0]?.itemId).toBe(transition.id);
      expect(result.itemDiagnostics[0]?.itemType).toBe("transition-kernel");
    });

    it("returns invalid when TransitionKernel output has wrong token count", () => {
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
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "place2", weight: 2 }], // expects 2 tokens
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { Target: [input.Source[0]] };
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics).toHaveLength(1);
      expect(result.itemDiagnostics[0]?.itemId).toBe(transition.id);
      expect(
        result.itemDiagnostics[0]?.diagnostics.map((diag) => diag.code),
      ).toContain(2345);
    });

    it("returns valid when accessing parameters in TransitionKernel", () => {
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
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              const newX = input.Source[0].x * parameters.multiplier;
              return { Target: [{ x: newX }] };
            });`,
          },
        ],
      });

      // WHEN
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });

    it("returns invalid when accessing untyped input place", () => {
      // GIVEN - place2 has no color, so it should not appear in input
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [
          { id: "place1", name: "Source", colorId: "color1" },
          { id: "place2", name: "Untyped", colorId: null },
          { id: "place3", name: "Target", colorId: "color1" },
        ],
        transitions: [
          {
            id: "t1",
            inputArcs: [
              { placeId: "place1", weight: 1, type: "standard" },
              { placeId: "place2", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "place3", weight: 1 }],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              // Accessing Untyped should fail since it has no color
              const token = input.Untyped[0];
              return { Target: [{ x: 1 }] };
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const result = check(sdcpn);

      // THEN - should error because Untyped is not in the input type
      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics).toHaveLength(1);
      expect(result.itemDiagnostics[0]?.itemId).toBe(transition.id);
      expect(result.itemDiagnostics[0]?.diagnostics[0]?.messageText).toContain(
        "Untyped",
      );
    });

    it("returns invalid when returning untyped output place instead of typed one", () => {
      // GIVEN - place2 has no color, so it should not be allowed in output
      // The TransitionKernel returns only Untyped instead of Target, which should error
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [
          { id: "place1", name: "Source", colorId: "color1" },
          { id: "place2", name: "Untyped", colorId: null },
          { id: "place3", name: "Target", colorId: "color1" },
        ],
        transitions: [
          {
            id: "t1",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [
              { placeId: "place2", weight: 1 },
              { placeId: "place3", weight: 1 },
            ],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              // Missing Target which is required - should fail
              return { Untyped: [{ x: 1 }] };
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const result = check(sdcpn);

      // THEN - should error because Target is missing from the output type
      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics).toHaveLength(1);
      expect(result.itemDiagnostics[0]?.itemId).toBe(transition.id);
      expect(result.itemDiagnostics[0]?.itemType).toBe("transition-kernel");
    });

    it("returns invalid when accessing undefined property on input token", () => {
      // GIVEN - Access a property that doesn't exist on the token type
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [
          { id: "place1", name: "Source", colorId: "color1" },
          { id: "place2", name: "Target", colorId: "color1" },
        ],
        transitions: [
          {
            id: "t1",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              // Accessing 'nonExistentProperty' should fail since color1 only has 'x'
              const value = input.Source[0].nonExistentProperty;
              return { Target: [{ x: value }] };
            });`,
          },
        ],
      });
      const transition = sdcpn.transitions[0]!;

      // WHEN
      const result = check(sdcpn);

      // THEN - should error because nonExistentProperty doesn't exist on the token type
      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics).toHaveLength(1);
      expect(result.itemDiagnostics[0]?.itemId).toBe(transition.id);
      expect(result.itemDiagnostics[0]?.itemType).toBe("transition-kernel");
      expect(result.itemDiagnostics[0]?.diagnostics[0]?.messageText).toContain(
        "nonExistentProperty",
      );
    });

    it("lints TransitionKernel code for colored component-port outputs", () => {
      const sdcpn: SDCPN = {
        ...createSDCPN({
          transitions: [
            {
              id: "t1",
              inputArcs: [],
              outputArcs: [
                {
                  endpoint: {
                    kind: "componentPort",
                    componentInstanceId: "instance-1",
                    portPlaceId: "port-out",
                  },
                  weight: 1,
                },
              ],
              transitionKernelCode: `export default TransitionKernel(() => {
                return { "Instance 1::PortOut": [{ x: "not a number" }] };
              });`,
            },
          ],
        }),
        componentInstances: [
          {
            id: "instance-1",
            name: "Instance 1",
            subnetId: "subnet-1",
            parameterValues: {},
            x: 0,
            y: 0,
          },
        ],
        subnets: [
          {
            id: "subnet-1",
            name: "Subnet 1",
            types: [
              {
                id: "subnet-color",
                name: "Subnet Color",
                iconSlug: "circle",
                displayColor: "#ff0000",
                elements: [{ elementId: "x", name: "x", type: "real" }],
              },
            ],
            places: [
              {
                id: "port-out",
                name: "PortOut",
                colorId: "subnet-color",
                dynamicsEnabled: false,
                differentialEquationId: null,
                isPort: true,
                x: 0,
                y: 0,
              },
            ],
            transitions: [],
            differentialEquations: [],
            parameters: [],
            componentInstances: [],
          },
        ],
      };

      const result = check(sdcpn, {
        colors: true,
        stochasticity: false,
        dynamics: true,
        parameters: true,
        subnets: true,
      });

      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics[0]?.itemType).toBe("transition-kernel");
      expect(result.itemDiagnostics[0]?.diagnostics).not.toHaveLength(0);
    });
  });

  describe("UUID elements", () => {
    const uuidTypes = [
      {
        id: "color1",
        elements: [
          { name: "id", type: "uuid" as const },
          { name: "x", type: "real" as const },
        ],
      },
    ];
    const uuidPlaces = [
      { id: "place1", name: "Source", colorId: "color1" },
      { id: "place2", name: "Target", colorId: "color1" },
    ];
    const uuidKernel = (body: string) =>
      createSDCPN({
        types: uuidTypes,
        places: uuidPlaces,
        transitions: [
          {
            id: "t1",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { Target: [${body}] };
            });`,
          },
        ],
      });

    it("types input uuid attributes as bigint (=== comparison is valid)", () => {
      const sdcpn = createSDCPN({
        types: uuidTypes,
        places: uuidPlaces,
        transitions: [
          {
            id: "t1",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "place1", weight: 2, type: "standard" }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            lambdaCode: `export default Lambda((input, parameters) => {
              return input.Source[0].id === input.Source[1].id;
            });`,
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { Target: [input.Source[0]] };
            });`,
          },
        ],
      });

      const result = check(sdcpn);

      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });

    it("rejects arithmetic mixing an input uuid bigint with a number", () => {
      const sdcpn = createSDCPN({
        types: uuidTypes,
        places: uuidPlaces,
        transitions: [
          {
            id: "t1",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            lambdaCode: `export default Lambda((input, parameters) => {
              return input.Source[0].id * 2 > 0;
            });`,
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { Target: [input.Source[0]] };
            });`,
          },
        ],
      });

      const result = check(sdcpn);

      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics[0]?.itemType).toBe("transition-lambda");
    });

    it("accepts kernel outputs with omitted uuid, Uuid.generate(), and strings", () => {
      const omitted = check(uuidKernel(`{ x: 1 }`));
      expect(omitted.isValid).toBe(true);
      expect(omitted.itemDiagnostics).toHaveLength(0);

      const generated = check(uuidKernel(`{ id: Uuid.generate(), x: 1 }`));
      expect(generated.isValid).toBe(true);
      expect(generated.itemDiagnostics).toHaveLength(0);

      const fromString = check(uuidKernel(`{ id: "order-1", x: 1 }`));
      expect(fromString.isValid).toBe(true);
      expect(fromString.itemDiagnostics).toHaveLength(0);

      const forwarded = check(
        uuidKernel(`{ id: input.Source[0].id, x: input.Source[0].x }`),
      );
      expect(forwarded.isValid).toBe(true);
      expect(forwarded.itemDiagnostics).toHaveLength(0);
    });

    it("accepts Uuid helpers even when stochasticity is disabled", () => {
      const result = check(uuidKernel(`{ id: Uuid.generate(), x: 1 }`), {
        colors: true,
        stochasticity: false,
        dynamics: true,
        parameters: true,
        subnets: true,
      });

      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });

    it("rejects Distribution values on uuid attributes", () => {
      const result = check(
        uuidKernel(`{ id: Distribution.Uniform(0, 1), x: 1 }`),
      );

      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics[0]?.itemType).toBe("transition-kernel");
    });
  });

  describe("string elements", () => {
    const stringTypes = [
      {
        id: "color1",
        elements: [
          { name: "label", type: "string" as const },
          { name: "x", type: "real" as const },
        ],
      },
    ];
    const stringPlaces = [
      { id: "place1", name: "Source", colorId: "color1" },
      { id: "place2", name: "Target", colorId: "color1" },
    ];
    const stringKernel = (body: string) =>
      createSDCPN({
        types: stringTypes,
        places: stringPlaces,
        transitions: [
          {
            id: "t1",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { Target: [${body}] };
            });`,
          },
        ],
      });

    it("types input string attributes as string (comparison and methods are valid)", () => {
      const sdcpn = createSDCPN({
        types: stringTypes,
        places: stringPlaces,
        transitions: [
          {
            id: "t1",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            lambdaCode: `export default Lambda((input, parameters) => {
              return input.Source[0].label === "queued" && input.Source[0].label.startsWith("q");
            });`,
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { Target: [input.Source[0]] };
            });`,
          },
        ],
      });

      const result = check(sdcpn);

      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });

    it("accepts plain string kernel outputs and forwarded input strings", () => {
      const literal = check(stringKernel(`{ label: "shipped", x: 1 }`));
      expect(literal.isValid).toBe(true);
      expect(literal.itemDiagnostics).toHaveLength(0);

      const forwarded = check(
        stringKernel(`{ label: input.Source[0].label, x: input.Source[0].x }`),
      );
      expect(forwarded.isValid).toBe(true);
      expect(forwarded.itemDiagnostics).toHaveLength(0);
    });

    it("rejects arithmetic on an input string attribute", () => {
      const sdcpn = createSDCPN({
        types: stringTypes,
        places: stringPlaces,
        transitions: [
          {
            id: "t1",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            lambdaCode: `export default Lambda((input, parameters) => {
              return input.Source[0].label * 2 > 0;
            });`,
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { Target: [input.Source[0]] };
            });`,
          },
        ],
      });

      const result = check(sdcpn);

      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics[0]?.itemType).toBe("transition-lambda");
    });

    it("rejects Distribution values on string attributes", () => {
      const result = check(
        stringKernel(`{ label: Distribution.Uniform(0, 1), x: 1 }`),
      );

      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics[0]?.itemType).toBe("transition-kernel");
    });

    it("rejects numeric values on string attributes", () => {
      const result = check(stringKernel(`{ label: 42, x: 1 }`));

      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics[0]?.itemType).toBe("transition-kernel");
    });
  });

  describe("Multiple errors", () => {
    it("reports errors from multiple items", () => {
      // GIVEN - SDCPN with errors in both a differential equation and a transition
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [{ id: "place1", name: "Source", colorId: "color1" }],
        differentialEquations: [
          {
            colorId: "color1",
            code: `export default Dynamics((tokens, parameters) => {
              const value = tokens[0].undefinedProp;
              return tokens;
            });`,
          },
        ],
        transitions: [
          {
            id: "t1",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "place1", weight: 1, type: "standard" }],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              return input.UndefinedPlace[0];
            });`,
          },
        ],
      });

      // WHEN
      const result = check(sdcpn);

      // THEN
      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics.length).toBeGreaterThanOrEqual(2);

      const deError = result.itemDiagnostics.find(
        (diag) => diag.itemType === "differential-equation",
      );
      const lambdaError = result.itemDiagnostics.find(
        (diag) => diag.itemType === "transition-lambda",
      );

      expect(deError).toBeDefined();
      expect(lambdaError).toBeDefined();
    });
  });

  describe("Transitions without output places", () => {
    it("does not check TransitionKernel when transition has no output places", () => {
      // GIVEN - Two transitions with no output places
      // Lambda code is valid, but TransitionKernel code is invalid
      // Since there are no output places, TransitionKernel should not be checked
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [{ id: "placeIn", name: "PlaceIn", colorId: "color1" }],
        transitions: [
          {
            id: "transitionA",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "placeIn", weight: 1, type: "standard" }],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              return input.PlaceIn[0].x > 0;
            });`,
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              // Invalid: returning a non-existent place
              return { NonExistentPlace: [{ x: 1 }] };
            });`,
          },
          {
            id: "transitionB",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "placeIn", weight: 1, type: "standard" }],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              return input.PlaceIn[0].x < 100;
            });`,
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              // Invalid: syntax error
              return { };
            });`,
          },
        ],
      });

      // WHEN
      const result = check(sdcpn);

      // THEN - Should be valid because TransitionKernel is not checked when no output places
      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });

    it("does not check TransitionKernel when transition has only uncoloured output places", () => {
      // GIVEN - A transition with output places that have no color (null colorId)
      // Lambda code is valid, but TransitionKernel code is invalid
      // Since there are no coloured output places, TransitionKernel should not be checked
      const sdcpn = createSDCPN({
        types: [{ id: "color1", elements: [{ name: "x", type: "real" }] }],
        places: [
          { id: "placeIn", name: "PlaceIn", colorId: "color1" },
          { id: "placeOut", name: "PlaceOut", colorId: null }, // uncoloured place
        ],
        transitions: [
          {
            id: "transitionA",
            lambdaType: "predicate",
            inputArcs: [{ placeId: "placeIn", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "placeOut", weight: 1 }],
            lambdaCode: `export default Lambda((input, parameters) => {
              return input.PlaceIn[0].x > 0;
            });`,
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              // Invalid: returning wrong type and non-existent properties
              return { PlaceOut: [{ wrongProperty: "invalid" }] };
            });`,
          },
        ],
      });

      // WHEN
      const result = check(sdcpn);

      // THEN - Should be valid because TransitionKernel is not checked when no coloured output places
      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });
  });
});
