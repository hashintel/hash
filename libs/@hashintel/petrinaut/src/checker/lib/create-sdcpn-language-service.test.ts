import { describe, expect, it } from "vitest";

import { createSDCPNLanguageService } from "./create-sdcpn-language-service";
import { getItemFilePath } from "./file-paths";
import { createSDCPN } from "./helper/create-sdcpn";

/** Cursor marker used in test code strings to indicate the completion position. */
const CURSOR = "∫";

/**
 * Find the offset of a cursor marker in user code.
 * Returns the offset (without the marker) and the clean code.
 */
function parseCursor(codeWithCursor: string): {
  offset: number;
  code: string;
} {
  const offset = codeWithCursor.indexOf(CURSOR);
  if (offset === -1) {
    throw new Error(`No cursor marker \`${CURSOR}\` found in code`);
  }
  const code =
    codeWithCursor.slice(0, offset) + codeWithCursor.slice(offset + 1);
  return { offset, code };
}

/** Extract just the completion names from a position. */
function getCompletionNames(
  sdcpnOptions: Parameters<typeof createSDCPN>[0],
  codeWithCursor: string,
  target:
    | { type: "transition-lambda"; transitionId?: string }
    | { type: "transition-kernel"; transitionId?: string }
    | { type: "differential-equation"; deId?: string },
): string[] {
  const { offset, code } = parseCursor(codeWithCursor);

  // Patch the SDCPN to inject the clean code at the right item
  const patched = { ...sdcpnOptions };
  if (
    target.type === "transition-lambda" ||
    target.type === "transition-kernel"
  ) {
    const transitionId = target.transitionId ?? "t1";
    patched.transitions = (patched.transitions ?? []).map((tr) =>
      (tr.id ?? "t1") === transitionId
        ? {
            ...tr,
            ...(target.type === "transition-lambda"
              ? { lambdaCode: code }
              : { transitionKernelCode: code }),
          }
        : tr,
    );
  } else {
    const deId = target.deId ?? "de_1";
    patched.differentialEquations = (patched.differentialEquations ?? []).map(
      (de, index) =>
        (de.id ?? `de_${index + 1}`) === deId ? { ...de, code } : de,
    );
  }

  const sdcpn = createSDCPN(patched);
  const ls = createSDCPNLanguageService(sdcpn);

  let filePath: string;
  if (target.type === "transition-lambda") {
    filePath = getItemFilePath("transition-lambda-code", {
      transitionId: target.transitionId ?? "t1",
    });
  } else if (target.type === "transition-kernel") {
    filePath = getItemFilePath("transition-kernel-code", {
      transitionId: target.transitionId ?? "t1",
    });
  } else {
    filePath = getItemFilePath("differential-equation-code", {
      id: target.deId ?? "de_1",
    });
  }

  const completions = ls.getCompletionsAtPosition(filePath, offset, undefined);
  return (completions?.entries ?? []).map((entry) => entry.name);
}

describe("createSDCPNLanguageService completions", () => {
  const baseSdcpn = {
    types: [{ id: "color1", elements: [{ name: "x", type: "real" as const }] }],
    places: [
      { id: "place1", name: "Source", colorId: "color1" },
      { id: "place2", name: "Target", colorId: "color1" },
    ],
    parameters: [
      { id: "p1", variableName: "alpha", type: "real" as const },
      { id: "p2", variableName: "enabled", type: "boolean" as const },
    ],
    transitions: [
      {
        id: "t1",
        lambdaType: "predicate" as const,
        inputArcs: [{ placeId: "place1", weight: 1 }],
        outputArcs: [{ placeId: "place2", weight: 1 }],
        lambdaCode: "",
        transitionKernelCode: "",
      },
    ],
  };

  describe("member access completions (dot completions)", () => {
    it("returns Number methods after `a.` where a is a number", () => {
      const names = getCompletionNames(
        baseSdcpn,
        `const a = 42;\na.${CURSOR}`,
        {
          type: "transition-lambda",
        },
      );

      expect(names).toContain("toFixed");
      expect(names).toContain("toString");
      expect(names).toContain("valueOf");
      // Should NOT contain global scope items
      expect(names).not.toContain("Array");
      expect(names).not.toContain("Lambda");
    });

    it("returns parameter names after `parameters.`", () => {
      const names = getCompletionNames(
        baseSdcpn,
        `export default Lambda((input, parameters) => {\n  return parameters.${CURSOR};\n});`,
        { type: "transition-lambda" },
      );

      expect(names).toContain("alpha");
      expect(names).toContain("enabled");
      // Should NOT contain globals
      expect(names).not.toContain("Array");
    });

    it("returns place names after `input.`", () => {
      const names = getCompletionNames(
        baseSdcpn,
        `export default Lambda((input, parameters) => {\n  return input.${CURSOR};\n});`,
        { type: "transition-lambda" },
      );

      expect(names).toContain("Source");
      // Should NOT contain unrelated globals
      expect(names).not.toContain("Array");
    });

    it("returns token properties after `input.Source[0].`", () => {
      const names = getCompletionNames(
        baseSdcpn,
        `export default Lambda((input, parameters) => {\n  const token = input.Source[0];\n  return token.${CURSOR};\n});`,
        { type: "transition-lambda" },
      );

      expect(names).toContain("x");
    });

    it("returns String methods after string expression", () => {
      const names = getCompletionNames(
        baseSdcpn,
        `const s = "hello";\ns.${CURSOR}`,
        {
          type: "transition-lambda",
        },
      );

      expect(names).toContain("charAt");
      expect(names).toContain("indexOf");
      expect(names).not.toContain("Array");
    });
  });

  describe("top-level completions (no dot)", () => {
    it("returns globals and declared identifiers at top level", () => {
      const names = getCompletionNames(baseSdcpn, `const a = 42;\n${CURSOR}`, {
        type: "transition-lambda",
      });

      // Should include user-defined and prefix-declared identifiers
      expect(names).toContain("a");
      expect(names).toContain("Lambda");
      // Should include globals
      expect(names).toContain("Array");
    });
  });

  describe("updateFileContent", () => {
    it("returns completions for updated code, not original code", () => {
      // Start with number code
      const sdcpn = createSDCPN({
        ...baseSdcpn,
        transitions: [
          {
            ...baseSdcpn.transitions[0]!,
            lambdaCode: "const a = 42;\na.",
          },
        ],
      });

      const ls = createSDCPNLanguageService(sdcpn);
      const filePath = getItemFilePath("transition-lambda-code", {
        transitionId: "t1",
      });

      // Update to string code
      const { offset, code } = parseCursor(`const s = "hello";\ns.${CURSOR}`);
      ls.updateFileContent(filePath, code);

      const completions = ls.getCompletionsAtPosition(
        filePath,
        offset,
        undefined,
      );
      const names = (completions?.entries ?? []).map((entry) => entry.name);

      // Should have String methods
      expect(names).toContain("charAt");
      expect(names).toContain("indexOf");
      // Should NOT have Number methods
      expect(names).not.toContain("toFixed");
    });

    it("reflects new content after multiple updates", () => {
      const sdcpn = createSDCPN({
        ...baseSdcpn,
        transitions: [
          {
            ...baseSdcpn.transitions[0]!,
            lambdaCode: "",
          },
        ],
      });

      const ls = createSDCPNLanguageService(sdcpn);
      const filePath = getItemFilePath("transition-lambda-code", {
        transitionId: "t1",
      });

      // First update: number
      const first = parseCursor(`const a = 42;\na.${CURSOR}`);
      ls.updateFileContent(filePath, first.code);
      const firstCompletions = ls.getCompletionsAtPosition(
        filePath,
        first.offset,
        undefined,
      );
      const firstNames = (firstCompletions?.entries ?? []).map(
        (entry) => entry.name,
      );
      expect(firstNames).toContain("toFixed");

      // Second update: string
      const second = parseCursor(`const s = "hello";\ns.${CURSOR}`);
      ls.updateFileContent(filePath, second.code);
      const secondCompletions = ls.getCompletionsAtPosition(
        filePath,
        second.offset,
        undefined,
      );
      const secondNames = (secondCompletions?.entries ?? []).map(
        (entry) => entry.name,
      );
      expect(secondNames).toContain("charAt");
      expect(secondNames).not.toContain("toFixed");
    });
  });

  describe("differential equation completions", () => {
    const deSdcpn = {
      types: [
        {
          id: "color1",
          elements: [{ name: "velocity", type: "real" as const }],
        },
      ],
      parameters: [
        { id: "p1", variableName: "gravity", type: "real" as const },
      ],
      differentialEquations: [
        {
          id: "de1",
          colorId: "color1",
          code: "",
        },
      ],
    };

    it("returns token properties after `tokens[0].`", () => {
      const names = getCompletionNames(
        deSdcpn,
        `export default Dynamics((tokens, parameters) => {\n  const t = tokens[0];\n  return t.${CURSOR};\n});`,
        { type: "differential-equation", deId: "de1" },
      );

      expect(names).toContain("velocity");
    });

    it("returns parameter names after `parameters.`", () => {
      const names = getCompletionNames(
        deSdcpn,
        `export default Dynamics((tokens, parameters) => {\n  return parameters.${CURSOR};\n});`,
        { type: "differential-equation", deId: "de1" },
      );

      expect(names).toContain("gravity");
    });
  });
});
