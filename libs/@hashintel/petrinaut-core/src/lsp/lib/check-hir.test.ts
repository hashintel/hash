import ts from "@typescript/typescript6";
import { describe, expect, it } from "vitest";

import { getHirDiagnosticsForItem, HIR_DIAGNOSTIC_CODES } from "./check-hir";

import type {
  HirKernelContext,
  HirLambdaContext,
} from "../../hir/surface-context";

const lambdaContext: HirLambdaContext = {
  surface: "lambda",
  parameters: [],
  inputPlaces: [],
  inputSlots: [],
  inputCounts: [],
  lambdaType: "stochastic",
};

const kernelContext: HirKernelContext = {
  surface: "kernel",
  parameters: [],
  inputPlaces: [],
  inputSlots: [],
  inputCounts: [],
  outputPlaces: [],
  outputSlots: [],
  stochasticity: true,
};

describe("getHirDiagnosticsForItem", () => {
  it("allows only the optional lambda surface to be empty", () => {
    expect(getHirDiagnosticsForItem("", lambdaContext)).toEqual([]);
    expect(getHirDiagnosticsForItem("", kernelContext)).toContainEqual(
      expect.objectContaining({ category: ts.DiagnosticCategory.Error }),
    );
  });
});

describe("HIR_DIAGNOSTIC_CODES", () => {
  it("gives every diagnostic a code of its own", () => {
    const codes = Object.values(HIR_DIAGNOSTIC_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
