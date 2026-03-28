import type ts from "typescript";

import type { SDCPN } from "../../core/types/sdcpn";
import {
  buildContextForDifferentialEquation,
  buildContextForTransition,
  compileToIR,
  type IRResult,
} from "../../expression/ts-to-ir/compile-to-ir";
import type { SDCPNLanguageServer } from "./create-sdcpn-language-service";
import { getItemFilePath } from "./file-paths";

export type ItemType =
  | "transition-lambda"
  | "transition-kernel"
  | "differential-equation";

export type SDCPNDiagnostic = {
  /** The ID of the SDCPN item (transition or differential equation) */
  itemId: string;
  /** The type of the item */
  itemType: ItemType;
  /** The file path in the virtual file system */
  filePath: string;
  /** TypeScript diagnostics for this file */
  diagnostics: ts.Diagnostic[];
};

export type SDCPNCheckResult = {
  /** Whether the SDCPN is valid (no TypeScript errors) */
  isValid: boolean;
  /** TypeScript error diagnostics grouped by item */
  itemDiagnostics: SDCPNDiagnostic[];
  /** Expression IR diagnostics (unsupported math expressions, do not affect validity) */
  expressionDiagnostics: SDCPNDiagnostic[];
};

/**
 * Creates a synthetic ts.Diagnostic from an expression IR compilation error.
 * Uses category 0 (Warning) since the TypeScript code may still be valid,
 * just not representable as a pure mathematical expression.
 */
function makeExpressionDiagnostic(
  result: IRResult & { ok: false },
): ts.Diagnostic {
  return {
    category: 0, // Warning
    code: 99000,
    messageText: `Invalid expression: ${result.error}`,
    file: undefined,
    start: result.start,
    length: result.length,
  };
}

/**
 * Appends an expression diagnostic to the item diagnostics list, merging with
 * any existing entry for the same item.
 */
function appendExpressionDiagnostic(
  itemDiagnostics: SDCPNDiagnostic[],
  itemId: string,
  itemType: ItemType,
  filePath: string,
  result: IRResult & { ok: false },
): void {
  const diag = makeExpressionDiagnostic(result);
  const existing = itemDiagnostics.find(
    (di) => di.itemId === itemId && di.itemType === itemType,
  );
  if (existing) {
    existing.diagnostics.push(diag);
  } else {
    itemDiagnostics.push({ itemId, itemType, filePath, diagnostics: [diag] });
  }
}

/**
 * Validates all SDCPN code expressions as mathematical expressions by
 * compiling them to the expression IR, appending any errors as warnings.
 */
function checkExpressions(sdcpn: SDCPN): SDCPNDiagnostic[] {
  const itemDiagnostics: SDCPNDiagnostic[] = [];
  // Check differential equations
  for (const de of sdcpn.differentialEquations) {
    const ctx = buildContextForDifferentialEquation(sdcpn, de.colorId);
    const result = compileToIR(de.code, ctx);
    if (!result.ok) {
      const filePath = getItemFilePath("differential-equation-code", {
        id: de.id,
      });
      appendExpressionDiagnostic(
        itemDiagnostics,
        de.id,
        "differential-equation",
        filePath,
        result,
      );
    }
  }

  // Check transition lambdas and kernels
  for (const transition of sdcpn.transitions) {
    const lambdaCtx = buildContextForTransition(sdcpn, transition, "Lambda");
    const lambdaResult = compileToIR(transition.lambdaCode, lambdaCtx);
    if (!lambdaResult.ok) {
      const filePath = getItemFilePath("transition-lambda-code", {
        transitionId: transition.id,
      });
      appendExpressionDiagnostic(
        itemDiagnostics,
        transition.id,
        "transition-lambda",
        filePath,
        lambdaResult,
      );
    }

    // Only check TransitionKernel if there are coloured output places,
    // matching the TypeScript checker's behavior
    const hasColouredOutputPlaces = transition.outputArcs.some((arc) => {
      const place = sdcpn.places.find((pl) => pl.id === arc.placeId);
      return place?.colorId != null;
    });

    if (hasColouredOutputPlaces) {
      const kernelCtx = buildContextForTransition(
        sdcpn,
        transition,
        "TransitionKernel",
      );
      const kernelResult = compileToIR(
        transition.transitionKernelCode,
        kernelCtx,
      );
      if (!kernelResult.ok) {
        const filePath = getItemFilePath("transition-kernel-code", {
          transitionId: transition.id,
        });
        appendExpressionDiagnostic(
          itemDiagnostics,
          transition.id,
          "transition-kernel",
          filePath,
          kernelResult,
        );
      }
    }
  }

  return itemDiagnostics;
}

/**
 * Checks the validity of an SDCPN by running TypeScript validation
 * on all user-provided code (transitions and differential equations).
 */
export function checkSDCPN(
  sdcpn: SDCPN,
  server: SDCPNLanguageServer,
): SDCPNCheckResult {
  const itemDiagnostics: SDCPNDiagnostic[] = [];

  // Check all differential equations
  for (const de of sdcpn.differentialEquations) {
    const filePath = getItemFilePath("differential-equation-code", {
      id: de.id,
    });
    const semanticDiagnostics = server.getSemanticDiagnostics(filePath);
    const syntacticDiagnostics = server.getSyntacticDiagnostics(filePath);
    const allDiagnostics = [...syntacticDiagnostics, ...semanticDiagnostics];

    if (allDiagnostics.length > 0) {
      itemDiagnostics.push({
        itemId: de.id,
        itemType: "differential-equation",
        filePath,
        diagnostics: allDiagnostics,
      });
    }
  }

  // Check all functions in transitions (both lambda and kernel)
  for (const transition of sdcpn.transitions) {
    // Check Lambda code
    const lambdaFilePath = getItemFilePath("transition-lambda-code", {
      transitionId: transition.id,
    });
    const lambdaSemanticDiagnostics =
      server.getSemanticDiagnostics(lambdaFilePath);
    const lambdaSyntacticDiagnostics =
      server.getSyntacticDiagnostics(lambdaFilePath);
    const lambdaDiagnostics = [
      ...lambdaSyntacticDiagnostics,
      ...lambdaSemanticDiagnostics,
    ];

    if (lambdaDiagnostics.length > 0) {
      itemDiagnostics.push({
        itemId: transition.id,
        itemType: "transition-lambda",
        filePath: lambdaFilePath,
        diagnostics: lambdaDiagnostics,
      });
    }

    // Check TransitionKernel code only if there are coloured output places
    // (places with a color type that can receive tokens)
    const hasColouredOutputPlaces = transition.outputArcs.some((arc) => {
      const place = sdcpn.places.find((pl) => pl.id === arc.placeId);
      return place?.colorId != null;
    });

    if (hasColouredOutputPlaces) {
      const kernelFilePath = getItemFilePath("transition-kernel-code", {
        transitionId: transition.id,
      });
      const kernelSemanticDiagnostics =
        server.getSemanticDiagnostics(kernelFilePath);
      const kernelSyntacticDiagnostics =
        server.getSyntacticDiagnostics(kernelFilePath);
      const kernelDiagnostics = [
        ...kernelSyntacticDiagnostics,
        ...kernelSemanticDiagnostics,
      ];

      if (kernelDiagnostics.length > 0) {
        itemDiagnostics.push({
          itemId: transition.id,
          itemType: "transition-kernel",
          filePath: kernelFilePath,
          diagnostics: kernelDiagnostics,
        });
      }
    }
  }

  // Validate expressions as mathematical IR
  const expressionDiagnostics = checkExpressions(sdcpn);

  return {
    isValid: itemDiagnostics.length === 0,
    itemDiagnostics,
    expressionDiagnostics,
  };
}
