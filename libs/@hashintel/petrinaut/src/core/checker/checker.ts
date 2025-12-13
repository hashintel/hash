import type ts from "typescript";

import type { SDCPN } from "../types/sdcpn";
import { createSDCPNLanguageService } from "./create-sdcpn-language-service";

export type SDCPNDiagnostic = {
  /** The ID of the SDCPN item (transition or differential equation) */
  itemId: string;
  /** The type of the item */
  itemType: "transition-lambda" | "transition-kernel" | "differential-equation";
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
 *
 * @param sdcpn - The SDCPN to check
 * @returns A result object indicating validity and any diagnostics
 */
export function checkSDCPN(sdcpn: SDCPN): SDCPNCheckResult {
  const languageService = createSDCPNLanguageService(sdcpn);
  const itemDiagnostics: SDCPNDiagnostic[] = [];

  // Check all differential equations
  for (const de of sdcpn.differentialEquations) {
    const filePath = `differential_equations/${de.id}/code.ts`;
    const semanticDiagnostics =
      languageService.getSemanticDiagnostics(filePath);
    const syntacticDiagnostics =
      languageService.getSyntacticDiagnostics(filePath);
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

  // Check all transitions (both lambda and kernel)
  for (const transition of sdcpn.transitions) {
    // Check Lambda code
    const lambdaFilePath = `transitions/${transition.id}/lambda/code.ts`;
    const lambdaSemanticDiagnostics =
      languageService.getSemanticDiagnostics(lambdaFilePath);
    const lambdaSyntacticDiagnostics =
      languageService.getSyntacticDiagnostics(lambdaFilePath);
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

    // Check TransitionKernel code
    const kernelFilePath = `transitions/${transition.id}/kernel/code.ts`;
    const kernelSemanticDiagnostics =
      languageService.getSemanticDiagnostics(kernelFilePath);
    const kernelSyntacticDiagnostics =
      languageService.getSyntacticDiagnostics(kernelFilePath);
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

  return {
    isValid: itemDiagnostics.length === 0,
    itemDiagnostics,
  };
}
