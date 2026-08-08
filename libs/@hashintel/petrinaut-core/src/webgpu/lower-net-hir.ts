/**
 * Re-lowers a net's user code to HIR for the WGSL backend.
 *
 * `HirArtifacts` stores *emitted JavaScript source*, not the HIR tree
 * (`../hir/instantiate.ts`), so the WGSL backend cannot reuse them — it needs the
 * tree. Rather than widen the artifact format and make every consumer carry a
 * second program, the GPU path lowers again from the net's own code. Lowering is
 * cheap relative to a dispatch and happens once per experiment.
 */
import { DEFAULT_PETRINAUT_EXTENSIONS } from "../extensions";
import { lowerTypeScriptToHir } from "../hir/lower-typescript";

import type { PetrinautExtensionSettings } from "../extensions";
import type { HirFunction } from "../hir/hir";
import type { SDCPN } from "../types/sdcpn";

export type LoweredNetHir = {
  /** Transition id → lambda HIR, for transitions with lambda code. */
  lambdas: Map<string, HirFunction>;
  /** Place id → dynamics HIR, for places with dynamics enabled. */
  dynamics: Map<string, HirFunction>;
  /** Transition id → kernel HIR, for transitions with kernel code. */
  kernels: Map<string, HirFunction>;
  /** Items whose code would not lower, with the reason. Non-fatal. */
  skipped: { itemId: string; reason: string }[];
};

/**
 * Lowers every lambda and differential equation in `sdcpn`.
 *
 * A lambda that fails to lower is omitted rather than throwing: the shader
 * generator treats a missing lambda as always-enabled, which matches the CPU
 * engine's default for transitions without compiled lambdas.
 */
export function lowerNetHir(
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): LoweredNetHir {
  const lambdas = new Map<string, HirFunction>();
  const dynamics = new Map<string, HirFunction>();
  const kernels = new Map<string, HirFunction>();
  const skipped: { itemId: string; reason: string }[] = [];

  for (const transition of sdcpn.transitions) {
    // Stochasticity off means the CPU engine installs the always-enabled
    // default instead of compiling lambdas; match that.
    if (!extensions.stochasticity || transition.lambdaCode.trim() === "") {
      continue;
    }
    const lowered = lowerTypeScriptToHir(transition.lambdaCode, "lambda");
    if (lowered.ok) {
      lambdas.set(transition.id, lowered.fn);
    } else {
      skipped.push({
        itemId: transition.id,
        reason:
          lowered.diagnostics[0]?.message ??
          "lambda could not be lowered to HIR",
      });
    }
  }

  for (const transition of sdcpn.transitions) {
    if (
      !extensions.colors ||
      transition.transitionKernelCode.trim() === ""
    ) {
      continue;
    }
    const lowered = lowerTypeScriptToHir(
      transition.transitionKernelCode,
      "kernel",
    );
    if (lowered.ok) {
      kernels.set(transition.id, lowered.fn);
    } else {
      skipped.push({
        itemId: transition.id,
        reason:
          lowered.diagnostics[0]?.message ??
          "transition kernel could not be lowered to HIR",
      });
    }
  }

  const equationById = new Map(
    sdcpn.differentialEquations.map((equation) => [equation.id, equation]),
  );
  for (const place of sdcpn.places) {
    if (
      !extensions.dynamics ||
      !place.dynamicsEnabled ||
      !place.differentialEquationId ||
      !place.colorId
    ) {
      continue;
    }
    const equation = equationById.get(place.differentialEquationId);
    if (!equation) {
      continue;
    }
    const lowered = lowerTypeScriptToHir(equation.code, "dynamics");
    if (lowered.ok) {
      dynamics.set(place.id, lowered.fn);
    } else {
      skipped.push({
        itemId: place.id,
        reason:
          lowered.diagnostics[0]?.message ??
          "differential equation could not be lowered to HIR",
      });
    }
  }

  return { lambdas, dynamics, kernels, skipped };
}
