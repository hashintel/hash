import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  getTransitionLogicAvailability,
  sanitizeSDCPNForExtensions,
  type PetrinautExtensionSettings,
} from "../../extensions";
import {
  buildDynamicsContext,
  buildKernelContext,
  buildLambdaContext,
  buildMetricContext,
  buildVisualizerContext,
} from "../../hir";
import { classifyNet } from "../../hir/classify-net";
import { lowerAndCheck } from "../../hir/compile";
import { inferMetricShape } from "../../hir/metric-shape";
import { isSourcePredicate, netTimeOf } from "../../net-class";
import { getHirDiagnosticsForItem } from "./check-hir";
import {
  sourcePredicateDiagnostic,
  TS_CATEGORY_ERROR,
} from "./check-net-timing";
import { getItemFilePath } from "./file-paths";

import type { HirSurfaceContext } from "../../hir";
import type { MetricShape } from "../../hir/metric-shape";
import type { NetClass } from "../../net-class";
import type { SDCPN } from "../../types/sdcpn";
import type { LanguageServers } from "./language-servers";
import type { VirtualFileLanguageServer } from "./virtual-file-language-server";
import type ts from "@typescript/typescript6";

export type ItemType =
  | "transition-lambda"
  | "transition-kernel"
  | "differential-equation"
  | "place-visualizer";

export type SDCPNDiagnostic = {
  /** The ID of the SDCPN item (transition, differential equation or place) */
  itemId: string;
  /** The type of the item */
  itemType: ItemType;
  /** The file path in the virtual file system */
  filePath: string;
  /** TypeScript diagnostics for this file */
  diagnostics: ts.Diagnostic[];
};

export type SDCPNCheckResult = {
  /**
   * Whether the net can run: no error-severity diagnostic in any item other
   * than a `place-visualizer`. A visualizer that does not type-check draws
   * nothing; it never stops a simulation.
   */
  isValid: boolean;
  /** All diagnostics grouped by item */
  itemDiagnostics: SDCPNDiagnostic[];
  /**
   * The shape of every metric whose code lowers, by metric id. Metrics are
   * lowered here for what the net's consumers learn from their code; their
   * diagnostics are the metric editing session's.
   */
  metricShapes: Record<string, MetricShape>;
  /** The class of the net, whatever its diagnostics. */
  netClass: NetClass;
};

/**
 * Collects TS diagnostics for one code file and, when TypeScript found no
 * errors, appends HIR semantic lints (friendlier domain rules, analyzability
 * notes). HIR spans are user-content-relative, matching the adjusted TS
 * diagnostics.
 */
function collectItemDiagnostics(
  server: VirtualFileLanguageServer,
  filePath: string,
  hirContext: HirSurfaceContext | null,
): ts.Diagnostic[] {
  const semanticDiagnostics = server.getSemanticDiagnostics(filePath);
  const syntacticDiagnostics = server.getSyntacticDiagnostics(filePath);
  const allDiagnostics = [
    ...syntacticDiagnostics,
    ...semanticDiagnostics,
    ...server.getDeprecationDiagnostics(filePath),
  ];

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
 * equations), and TypeScript validation on place visualizers.
 */
export function checkSDCPN(
  sdcpn: SDCPN,
  servers: LanguageServers,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): SDCPNCheckResult {
  const server = servers.sdcpn;
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
      buildDynamicsContext(sdcpn, de, extensions),
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

  const timed = netTimeOf(sdcpn, extensions) === "timed";

  // Check all functions in transitions (both lambda and kernel)
  for (const transition of sdcpn.transitions) {
    const availability = getTransitionLogicAvailability(
      transition,
      sdcpn,
      extensions,
    );

    // The lambda's file carries the transition's firing diagnostics, the
    // structural one included, which holds whether or not the code is shown.
    const lambdaFilePath = getItemFilePath("transition-lambda-code", {
      transitionId: transition.id,
    });
    const lambdaDiagnostics = [
      ...(timed && isSourcePredicate(transition, extensions)
        ? [
            sourcePredicateDiagnostic(
              transition,
              server.getUserContent(lambdaFilePath) ?? "",
            ),
          ]
        : []),
      ...(availability.lambda
        ? collectItemDiagnostics(
            server,
            lambdaFilePath,
            buildLambdaContext(sdcpn, transition, extensions),
          )
        : []),
    ];

    if (lambdaDiagnostics.length > 0) {
      itemDiagnostics.push({
        itemId: transition.id,
        itemType: "transition-lambda",
        filePath: lambdaFilePath,
        diagnostics: lambdaDiagnostics,
      });
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

  // Visualizers are checked in their own JSX program, then lowered to the
  // view HIR, which rejects what the renderer cannot draw.
  for (const place of extensions.colors ? sdcpn.places : []) {
    if (place.visualizerCode === undefined) {
      continue;
    }
    const filePath = getItemFilePath("place-visualizer-code", {
      placeId: place.id,
    });
    const visualizerDiagnostics = collectItemDiagnostics(
      servers.visualizer,
      filePath,
      buildVisualizerContext(sdcpn, place, extensions),
    );

    if (visualizerDiagnostics.length > 0) {
      itemDiagnostics.push({
        itemId: place.id,
        itemType: "place-visualizer",
        filePath,
        diagnostics: visualizerDiagnostics,
      });
    }
  }

  const sanitized = sanitizeSDCPNForExtensions(sdcpn, extensions);
  const metricContext = buildMetricContext(sanitized, extensions);
  const metricShapes: Record<string, MetricShape> = {};
  for (const metric of sanitized.metrics ?? []) {
    if (metric.code.trim() === "") {
      continue;
    }
    const item = lowerAndCheck(metric.code, "metric", metricContext);
    if (item.ok) {
      metricShapes[metric.id] = inferMetricShape(
        item.fn,
        sanitized.places,
        sanitized.types,
      );
    }
  }

  return {
    metricShapes,
    netClass: classifyNet(sdcpn, extensions),
    isValid: !itemDiagnostics.some(
      (item) =>
        item.itemType !== "place-visualizer" &&
        item.diagnostics.some(
          (diagnostic) => diagnostic.category === TS_CATEGORY_ERROR,
        ),
    ),
    itemDiagnostics,
  };
}
