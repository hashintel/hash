import { describe, expect, it } from "vitest";

import { checkSDCPN } from "./checker";
import { createSDCPN } from "./helper/create-sdcpn";

describe("checkSDCPN", () => {
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
      const result = checkSDCPN(sdcpn);

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
      const result = checkSDCPN(sdcpn);

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
      const result = checkSDCPN(sdcpn);

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
      const result = checkSDCPN(sdcpn);

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
      const result = checkSDCPN(sdcpn);

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
            inputArcs: [{ placeId: "place1", weight: 1 }],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              const token = input.Source[0];
              return token.x > 0;
            });`,
          },
        ],
      });

      // WHEN
      const result = checkSDCPN(sdcpn);

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
      const result = checkSDCPN(sdcpn);

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
      const result = checkSDCPN(sdcpn);

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
            inputArcs: [{ placeId: "place1", weight: 1 }],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              return input.Source[0].rate;
            });`,
          },
        ],
      });

      // WHEN
      const result = checkSDCPN(sdcpn);

      // THEN
      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
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
            inputArcs: [{ placeId: "place1", weight: 1 }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              return { Target: [input.Source[0]] };
            });`,
          },
        ],
      });

      // WHEN
      const result = checkSDCPN(sdcpn);

      // THEN
      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
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
      const result = checkSDCPN(sdcpn);

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
      const result = checkSDCPN(sdcpn);

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
            inputArcs: [{ placeId: "place1", weight: 1 }],
            outputArcs: [{ placeId: "place2", weight: 1 }],
            transitionKernelCode: `export default TransitionKernel((input, parameters) => {
              const newX = input.Source[0].x * parameters.multiplier;
              return { Target: [{ x: newX }] };
            });`,
          },
        ],
      });

      // WHEN
      const result = checkSDCPN(sdcpn);

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
              { placeId: "place1", weight: 1 },
              { placeId: "place2", weight: 1 },
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
      const result = checkSDCPN(sdcpn);

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
            inputArcs: [{ placeId: "place1", weight: 1 }],
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
      const result = checkSDCPN(sdcpn);

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
            inputArcs: [{ placeId: "place1", weight: 1 }],
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
      const result = checkSDCPN(sdcpn);

      // THEN - should error because nonExistentProperty doesn't exist on the token type
      expect(result.isValid).toBe(false);
      expect(result.itemDiagnostics).toHaveLength(1);
      expect(result.itemDiagnostics[0]?.itemId).toBe(transition.id);
      expect(result.itemDiagnostics[0]?.itemType).toBe("transition-kernel");
      expect(result.itemDiagnostics[0]?.diagnostics[0]?.messageText).toContain(
        "nonExistentProperty",
      );
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
            inputArcs: [{ placeId: "place1", weight: 1 }],
            outputArcs: [],
            lambdaCode: `export default Lambda((input, parameters) => {
              return input.UndefinedPlace[0];
            });`,
          },
        ],
      });

      // WHEN
      const result = checkSDCPN(sdcpn);

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
            inputArcs: [{ placeId: "placeIn", weight: 1 }],
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
            inputArcs: [{ placeId: "placeIn", weight: 1 }],
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
      const result = checkSDCPN(sdcpn);

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
            inputArcs: [{ placeId: "placeIn", weight: 1 }],
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
      const result = checkSDCPN(sdcpn);

      // THEN - Should be valid because TransitionKernel is not checked when no coloured output places
      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toHaveLength(0);
    });
  });
});
