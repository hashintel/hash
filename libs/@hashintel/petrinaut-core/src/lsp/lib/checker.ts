import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  type PetrinautExtensionSettings,
} from "../../extensions";
import { getItemFilePath } from "./file-paths";
import { getTransitionCodeAvailability } from "./transition-code-availability";

import type { SDCPN } from "../../types/sdcpn";
import type { SDCPNLanguageServer } from "./create-sdcpn-language-service";
import type ts from "typescript";

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
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): SDCPNCheckResult {
  const itemDiagnostics: SDCPNDiagnostic[] = [];

  // Check all differential equations
  for (const de of extensions.colors && extensions.dynamics
    ? sdcpn.differentialEquations
    : []) {
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
    const availability = getTransitionCodeAvailability({
      transition,
      sdcpn,
      extensions,
    });

    if (availability.lambda) {
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
    }

    if (availability.transitionKernel) {
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
