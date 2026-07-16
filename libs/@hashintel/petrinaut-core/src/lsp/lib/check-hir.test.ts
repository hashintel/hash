import ts from "typescript";
import { describe, expect, it } from "vitest";

import { getHirDiagnosticsForItem } from "./check-hir";

import type {
  HirKernelContext,
  HirLambdaContext,
} from "../../hir/surface-context";

const lambdaContext: HirLambdaContext = {
  surface: "lambda",
  parameters: [],
  inputPlaces: [],
  inputSlots: [],
  lambdaType: "stochastic",
};

const kernelContext: HirKernelContext = {
  surface: "kernel",
  parameters: [],
  inputPlaces: [],
  inputSlots: [],
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
