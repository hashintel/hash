import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  getTransitionLogicAvailability,
  type PetrinautExtensionSettings,
} from "../../extensions";
import {
  buildDynamicsContext,
  buildKernelContext,
  buildLambdaContext,
} from "../../hir";
import { getHirDiagnosticsForItem } from "./check-hir";
import { getItemFilePath } from "./file-paths";

import type { HirSurfaceContext } from "../../hir";
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
  /** Whether the SDCPN is valid (no error-severity diagnostics). */
  isValid: boolean;
  /** All diagnostics grouped by item */
  itemDiagnostics: SDCPNDiagnostic[];
};

/** TS `DiagnosticCategory.Error` (kept numeric — `typescript` is imported
 * type-only here). */
const TS_CATEGORY_ERROR = 1;

/**
 * Collects TS diagnostics for one code file and, when TypeScript found no
 * errors, appends HIR semantic lints (friendlier domain rules, analyzability
 * notes). HIR spans are user-content-relative, matching the adjusted TS
 * diagnostics.
 */
function collectItemDiagnostics(
  server: SDCPNLanguageServer,
  filePath: string,
  hirContext: HirSurfaceContext | null,
): ts.Diagnostic[] {
  const semanticDiagnostics = server.getSemanticDiagnostics(filePath);
  const syntacticDiagnostics = server.getSyntacticDiagnostics(filePath);
  const allDiagnostics = [...syntacticDiagnostics, ...semanticDiagnostics];

  const hasTsError = allDiagnostics.some(
    (diagnostic) => diagnostic.category === TS_CATEGORY_ERROR,
  );
  if (!hasTsError && hirContext) {
    const userContent = server.getUserContent(filePath);
    if (userContent !== undefined) {
      allDiagnostics.push(...getHirDiagnosticsForItem(userContent, hirContext));
    }
  }

  return allDiagnostics;
}

/**
 * Checks the validity of an SDCPN by running TypeScript validation and HIR
 * semantic lints on all user-provided code (transitions and differential
 * equations).
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
    const allDiagnostics = collectItemDiagnostics(
      server,
      filePath,
      de.colorId ? buildDynamicsContext(sdcpn, de.colorId, extensions) : null,
    );

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
    const availability = getTransitionLogicAvailability(
      transition,
      sdcpn,
      extensions,
    );

    if (availability.lambda) {
      // Check Lambda code
      const lambdaFilePath = getItemFilePath("transition-lambda-code", {
        transitionId: transition.id,
      });
      const lambdaDiagnostics = collectItemDiagnostics(
        server,
        lambdaFilePath,
        buildLambdaContext(sdcpn, transition, extensions),
      );

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
      const kernelDiagnostics = collectItemDiagnostics(
        server,
        kernelFilePath,
        buildKernelContext(sdcpn, transition, extensions),
      );

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
    isValid: !itemDiagnostics.some((item) =>
      item.diagnostics.some(
        (diagnostic) => diagnostic.category === TS_CATEGORY_ERROR,
      ),
    ),
    itemDiagnostics,
  };
}
