/**
 * Compilation of user code through the HIR pipeline.
 *
 * `compileHirArtifacts` batch-compiles a whole SDCPN (root net and all
 * subnets) into serializable artifact sources (`HirArtifacts`) — the only
 * runtime compilation path. Per item it produces:
 *
 * - a buffer-ABI program (`emit-buffer-js.ts`) when the code typechecks
 *   cleanly and its shape scalarizes to direct packed-buffer reads/writes,
 * - an object-convention fallback (`emit-js.ts`) whenever lowering succeeds.
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
import { emitBufferKernelJs, emitBufferLambdaJs } from "./emit-buffer-js";
import { emitBufferDynamicsJs, emitUserFunctionJs } from "./emit-js";
import {
  instantiateHirBufferDynamics,
  instantiateHirUserFn,
} from "./instantiate";
import { lowerTypeScriptToHir } from "./lower-typescript";
import {
  buildDynamicsContext,
  buildKernelContext,
  buildLambdaContext,
} from "./surface-context";
import { typecheckHir } from "./typecheck";

import type { SDCPN, Subnet } from "../types/sdcpn";
import type { HirDiagnostic, HirFunction, HirSurfaceKind } from "./hir";
import type {
  HirArtifacts,
  HirCompiledBufferDynamics,
  HirCompiledUserFn,
  HirParameterValues,
} from "./instantiate";
import type {
  HirNetScope,
  HirSurfaceContext,
  HirTokenElementInfo,
} from "./surface-context";

export type HirCompileFailure = {
  itemId: string;
  itemType: "differential-equation" | "transition-lambda" | "transition-kernel";
  diagnostics: HirDiagnostic[];
};

export type HirCompileResult = {
  artifacts: HirArtifacts;
  /** Items whose code could not be lowered (no artifact emitted). */
  failures: HirCompileFailure[];
};

type LoweredItem = {
  fn: HirFunction;
  /** True when typechecking against the context produced no errors — the
   * gate for buffer-ABI emission. */
  typecheckClean: boolean;
};

function lowerAndCheck(
  code: string,
  surface: HirSurfaceKind,
  context: HirSurfaceContext | null,
): LoweredItem | HirDiagnostic[] {
  const lowered = lowerTypeScriptToHir(code, surface);
  if (!lowered.ok) {
    return lowered.diagnostics;
  }
  let typecheckClean = false;
  if (context) {
    const checked = typecheckHir(lowered.fn, context);
    typecheckClean = !checked.diagnostics.some(
      (diagnostic) => diagnostic.severity === "error",
    );
  }
  return { fn: lowered.fn, typecheckClean };
}

/**
 * Batch-compiles all dynamics/lambda/kernel code of an SDCPN (root and
 * subnets) to HIR artifacts for `buildSimulation`. Item availability mirrors
 * the engine: empty lambdas and kernels without colored output places are
 * skipped (the engine substitutes defaults for those).
 */
export function compileHirArtifacts(
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): HirCompileResult {
  const sanitized = sanitizeSDCPNForExtensions(sdcpn, extensions);
  const artifacts: HirArtifacts = {
    version: 2,
    dynamics: {},
    lambdas: {},
    kernels: {},
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
      const lowered = lowerAndCheck(de.code, "dynamics", context);
      if (Array.isArray(lowered)) {
        failures.push({
          itemId: de.id,
          itemType: "differential-equation",
          diagnostics: lowered,
        });
        continue;
      }
      const buffer = lowered.typecheckClean
        ? emitBufferDynamicsJs(lowered.fn, color.elements)
        : null;
      artifacts.dynamics[de.id] = {
        ...(buffer !== null ? { buffer } : {}),
        object: emitUserFunctionJs(lowered.fn),
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
        const lowered = lowerAndCheck(transition.lambdaCode, "lambda", context);
        if (Array.isArray(lowered)) {
          failures.push({
            itemId: transition.id,
            itemType: "transition-lambda",
            diagnostics: lowered,
          });
        } else {
          const buffer = lowered.typecheckClean
            ? emitBufferLambdaJs(lowered.fn, context)
            : null;
          artifacts.lambdas[transition.id] = {
            ...(buffer !== null ? { buffer } : {}),
            object: emitUserFunctionJs(lowered.fn),
          };
        }
      }

      if (availability.transitionKernel) {
        const context = buildKernelContext(
          sanitized,
          transition,
          extensions,
          net,
        );
        const lowered = lowerAndCheck(
          transition.transitionKernelCode,
          "kernel",
          context,
        );
        if (Array.isArray(lowered)) {
          failures.push({
            itemId: transition.id,
            itemType: "transition-kernel",
            diagnostics: lowered,
          });
        } else {
          const buffer = lowered.typecheckClean
            ? emitBufferKernelJs(lowered.fn, context)
            : null;
          artifacts.kernels[transition.id] = {
            ...(buffer !== null ? { buffer } : {}),
            object: emitUserFunctionJs(lowered.fn),
          };
        }
      }
    }
  }

  return { artifacts, failures };
}

// ---------------------------------------------------------------------------
// Single-item helpers (tests, tooling)
// ---------------------------------------------------------------------------

function emitObjectSource(
  code: string,
  surface: HirSurfaceKind,
): string | null {
  try {
    const lowered = lowerTypeScriptToHir(code, surface);
    if (!lowered.ok) {
      return null;
    }
    return emitUserFunctionJs(lowered.fn);
  } catch {
    return null;
  }
}

/** Compiles a `Lambda(...)` module to an object-convention function, or
 * `null` when the code is outside the HIR subset. */
export function tryCompileHirLambda(code: string): HirCompiledUserFn | null {
  const source = emitObjectSource(code, "lambda");
  return source === null ? null : instantiateHirUserFn(source);
}

/** Compiles a `TransitionKernel(...)` module to an object-convention
 * function, or `null` when the code is outside the HIR subset. */
export function tryCompileHirKernel(code: string): HirCompiledUserFn | null {
  const source = emitObjectSource(code, "kernel");
  return source === null ? null : instantiateHirUserFn(source);
}

/** Compiles a `Dynamics(...)` module to a buffer-native derivative function
 * with `parameterValues` pre-bound, or `null` when the body doesn't fit the
 * buffer-native shape. */
export function tryCompileHirBufferDynamics(
  code: string,
  elements: readonly HirTokenElementInfo[],
  parameterValues: HirParameterValues,
): HirCompiledBufferDynamics | null {
  try {
    const lowered = lowerTypeScriptToHir(code, "dynamics");
    if (!lowered.ok) {
      return null;
    }
    const source = emitBufferDynamicsJs(lowered.fn, elements);
    if (source === null) {
      return null;
    }
    return instantiateHirBufferDynamics(source, parameterValues);
  } catch {
    return null;
  }
}
