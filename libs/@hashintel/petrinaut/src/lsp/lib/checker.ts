import type ts from "typescript";

import type { SDCPN } from "../../core/types/sdcpn";
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
  /** Whether the SDCPN is valid (no errors) */
  isValid: boolean;
  /** All diagnostics grouped by item */
  itemDiagnostics: SDCPNDiagnostic[];
};

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

  return {
    isValid: itemDiagnostics.length === 0,
    itemDiagnostics,
  };
}
