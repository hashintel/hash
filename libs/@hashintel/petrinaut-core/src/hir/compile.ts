/**
 * Compilation of user code through the HIR pipeline.
 *
 * `compileHirArtifacts` batch-compiles a whole SDCPN (root net and all
 * subnets) into serializable artifact sources (`HirArtifacts`) — the only
 * runtime compilation path. Per item it produces:
 *
 * - a buffer-ABI program (`emit-buffer-js.ts`) when the code typechecks cleanly
 *   and scalarizes to direct packed-buffer reads/writes.
 *
 * Items whose code cannot be lowered get no artifact and are reported in
 * `failures`; `buildSimulation` refuses to run them (the LSP shows the same
 * diagnostics with exact source ranges).
 *
 * Note: this module (transitively) imports `typescript` — keep it out of the
 * simulation worker bundles; those only need `instantiate.ts`.
 */
import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  getTransitionLogicAvailability,
  sanitizeSDCPNForExtensions,
  type PetrinautExtensionSettings,
} from "../extensions";
import { createUserKeyedRecord } from "../validation/record-keys";
import { analyzeHir } from "./analyze";
import { fingerprintHirCompilationInput } from "./artifact-fingerprint";
import {
  emitBufferDynamicsJs,
  emitBufferKernelJs,
  emitBufferLambdaJs,
  emitBufferMetricJs,
} from "./emit-buffer-js";
import { getStatusConditionArtifactKey } from "./instantiate";
import { lowerTypeScriptToHir } from "./lower-typescript";
import {
  buildDynamicsContext,
  buildKernelContext,
  buildLambdaContext,
  buildMetricContext,
  buildStatusConditionContext,
} from "./surface-context";
import { typecheckHir } from "./typecheck";

import type { SDCPN, Subnet } from "../types/sdcpn";
import type { HirDiagnostic, HirFunction, HirSurfaceKind } from "./hir";
import type { HirArtifacts } from "./instantiate";
import type { HirNetScope, HirSurfaceContext } from "./surface-context";

export type HirCompileFailure = {
  itemId: string;
  itemType:
    | "differential-equation"
    | "transition-lambda"
    | "transition-kernel"
    | "metric"
    | "status-label-condition";
  diagnostics: HirDiagnostic[];
};

export type HirCompileResult = {
  artifacts: HirArtifacts;
  /** Items whose code could not be lowered (no artifact emitted). */
  failures: HirCompileFailure[];
};

function notCompilableDiagnostic(fn: HirFunction): HirDiagnostic {
  return {
    code: "hir:not-compilable",
    message:
      "This code shape cannot be compiled to a buffer program (e.g. dynamic token indices, structurally-dynamic results). Restructure it as static token records / `.map(...)` over input tokens.",
    severity: "error",
    span: fn.body.span,
  };
}

type ItemResult =
  | { ok: true; fn: HirFunction }
  | { ok: false; diagnostics: HirDiagnostic[] };

function lowerAndCheck(
  code: string,
  surface: HirSurfaceKind,
  context: HirSurfaceContext | null,
): ItemResult {
  const lowered = lowerTypeScriptToHir(code, surface);
  if (!lowered.ok) {
    return { ok: false, diagnostics: lowered.diagnostics };
  }
  if (context) {
    const checked = typecheckHir(lowered.fn, context);
    const errors = checked.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    );
    if (errors.length > 0) {
      return { ok: false, diagnostics: errors };
    }
  }
  return { ok: true, fn: lowered.fn };
}

/**
 * Batch-compiles all dynamics/lambda/kernel code of an SDCPN (root and
 * subnets) to buffer programs — the simulator's only compilation path.
 * Items whose code cannot be lowered, fails the schema typecheck, or does
 * not scalarize to a buffer program are reported in `failures` (mirrored by
 * the LSP as error diagnostics); such items cannot simulate.
 */
export type CompileHirArtifactsOptions = {
  /**
   * Also carry the lowered HIR tree on each artifact.
   *
   * Off by default: the tree roughly triples artifact size (measured +197% on
   * the supply-chain example), and artifacts are posted to every Monte Carlo
   * shard worker, none of which need it. Only the WebGPU backend does, because
   * it generates a shader from the HIR and cannot lower the net itself — that
   * would pull the TypeScript frontend into the browser bundle.
   */
  includeHir?: boolean;
};

export function compileHirArtifacts(
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
  options: CompileHirArtifactsOptions = {},
): HirCompileResult {
  const sanitized = sanitizeSDCPNForExtensions(sdcpn, extensions);
  // The four sub-records are keyed by item ids from the net definition, so
  // they have no prototype: an id like "__proto__" becomes an ordinary own
  // property instead of replacing the record's prototype and losing the
  // artifact. Readers still guard with `getOwn` because a `structuredClone`
  // or JSON round-trip revives these as plain objects.
  const artifacts: HirArtifacts = {
    version: 4,
    fingerprint: fingerprintHirCompilationInput(sanitized, extensions),
    dynamics: createUserKeyedRecord(),
    lambdas: createUserKeyedRecord(),
    kernels: createUserKeyedRecord(),
    metrics: createUserKeyedRecord(),
    statusConditions: createUserKeyedRecord(),
  };
  const failures: HirCompileFailure[] = [];

  const colorById = new Map(
    [
      ...sanitized.types,
      ...(sanitized.subnets ?? []).flatMap((subnet) => subnet.types),
    ].map((color) => [color.id, color]),
  );

  const nets: { net: HirNetScope; subnet: Subnet | null }[] = [
    { net: sanitized, subnet: null },
    ...(sanitized.subnets ?? []).map((subnet) => ({ net: subnet, subnet })),
  ];

  for (const { net, subnet } of nets) {
    const differentialEquations = subnet
      ? subnet.differentialEquations
      : sanitized.differentialEquations;
    const transitions = subnet ? subnet.transitions : sanitized.transitions;

    for (const de of differentialEquations) {
      const color = de.colorId ? colorById.get(de.colorId) : undefined;
      if (
        !color ||
        !color.elements.some((element) => element.type === "real")
      ) {
        continue;
      }
      const context = de.colorId
        ? buildDynamicsContext(sanitized, de.colorId, extensions, net)
        : null;
      const item = lowerAndCheck(de.code, "dynamics", context);
      if (!item.ok) {
        failures.push({
          itemId: de.id,
          itemType: "differential-equation",
          diagnostics: item.diagnostics,
        });
        continue;
      }
      const source = emitBufferDynamicsJs(item.fn, color.elements);
      if (source === null) {
        failures.push({
          itemId: de.id,
          itemType: "differential-equation",
          diagnostics: [notCompilableDiagnostic(item.fn)],
        });
        continue;
      }
      artifacts.dynamics[de.id] = {
        source,
        ...(options.includeHir ? { hir: item.fn } : {}),
      };
    }

    for (const transition of transitions) {
      const availability = getTransitionLogicAvailability(
        transition,
        sanitized,
        extensions,
        net,
      );

      if (availability.lambda && transition.lambdaCode.trim() !== "") {
        const context = buildLambdaContext(
          sanitized,
          transition,
          extensions,
          net,
        );
        const item = lowerAndCheck(transition.lambdaCode, "lambda", context);
        if (!item.ok) {
          failures.push({
            itemId: transition.id,
            itemType: "transition-lambda",
            diagnostics: item.diagnostics,
          });
        } else {
          const program = emitBufferLambdaJs(item.fn, context);
          if (program === null) {
            failures.push({
              itemId: transition.id,
              itemType: "transition-lambda",
              diagnostics: [notCompilableDiagnostic(item.fn)],
            });
          } else {
            const { dependencies } = analyzeHir(item.fn);
            const readsNoInputTokens =
              dependencies.tokenReads.length === 0 &&
              !dependencies.readsTokenCounts &&
              dependencies.isDeterministic;
            artifacts.lambdas[transition.id] = {
              ...(options.includeHir ? { hir: item.fn } : {}),
              source: program.source,
              inputSlotCount: program.inputSlotCount,
              ...(readsNoInputTokens ? { readsNoInputTokens: true } : {}),
            };
          }
        }
      }

      if (availability.transitionKernel) {
        const context = buildKernelContext(
          sanitized,
          transition,
          extensions,
          net,
        );
        const item = lowerAndCheck(
          transition.transitionKernelCode,
          "kernel",
          context,
        );
        if (!item.ok) {
          failures.push({
            itemId: transition.id,
            itemType: "transition-kernel",
            diagnostics: item.diagnostics,
          });
        } else {
          const program = emitBufferKernelJs(item.fn, context);
          if (program === null) {
            failures.push({
              itemId: transition.id,
              itemType: "transition-kernel",
              diagnostics: [notCompilableDiagnostic(item.fn)],
            });
          } else {
            artifacts.kernels[transition.id] = {
              source: program.source,
              inputSlotCount: program.inputSlotCount,
              outputByteCount: program.outputByteCount,
              ...(options.includeHir ? { hir: item.fn } : {}),
            };
          }
        }
      }
    }
  }

  // Metrics live on the root net only and see every root place by name.
  const metricContext = buildMetricContext(sanitized, extensions);
  for (const metric of sanitized.metrics ?? []) {
    if (metric.code.trim() === "") {
      // Empty drafts get no artifact; running them reports a missing-artifact
      // error, but they must not block the rest of the net from compiling.
      continue;
    }
    const item = lowerAndCheck(metric.code, "metric", metricContext);
    if (!item.ok) {
      failures.push({
        itemId: metric.id,
        itemType: "metric",
        diagnostics: item.diagnostics,
      });
      continue;
    }
    const program = emitBufferMetricJs(item.fn, metricContext);
    if (program === null) {
      failures.push({
        itemId: metric.id,
        itemType: "metric",
        diagnostics: [notCompilableDiagnostic(item.fn)],
      });
      continue;
    }
    artifacts.metrics[metric.id] = {
      source: program.source,
      placeNames: program.placeNames,
    };
  }

  // Status views live on the root net only; each label's token condition is
  // a single boolean expression over `token`, evaluated by the interpreter.
  for (const statusView of sanitized.statusViews ?? []) {
    for (const label of statusView.labels) {
      const condition = label.tokenCondition;
      if (condition === undefined || condition.trim() === "") {
        continue;
      }
      const context = buildStatusConditionContext(sanitized, label, extensions);
      const item = lowerAndCheck(condition, "status-condition", context);
      if (!item.ok) {
        failures.push({
          itemId: label.id,
          itemType: "status-label-condition",
          diagnostics: item.diagnostics,
        });
        continue;
      }
      artifacts.statusConditions[
        getStatusConditionArtifactKey(statusView.id, label.id)
      ] = { fn: item.fn };
    }
  }

  return { artifacts, failures };
}
