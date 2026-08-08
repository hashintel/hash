/**
 * Reads the HIR the GPU backend needs out of already-compiled artifacts.
 *
 * The alternative — lowering the net's TypeScript here — is what
 * `lower-net-hir.ts` does, and it cannot be used from the browser: it pulls in
 * the TypeScript frontend, whose Node builtins break the frontend bundle
 * outright (`Module not found: Can't resolve 'module'`). Artifacts are produced
 * in the language worker, which has the compiler, and carry the HIR alongside the
 * emitted JavaScript, so the browser only reads.
 *
 * Deliberately dependency-free beyond types, for the same reason.
 */
import { DEFAULT_PETRINAUT_EXTENSIONS } from "../extensions";

import type { PetrinautExtensionSettings } from "../extensions";
import type { HirArtifacts } from "../hir-runtime";
import type { HirFunction } from "../hir/hir";
import type { SDCPN } from "../types/sdcpn";

export type NetHir = {
  /** Transition id → lambda HIR, for transitions with a compiled lambda. */
  lambdas: Map<string, HirFunction>;
  /** Place id → dynamics HIR, for places with dynamics enabled. */
  dynamics: Map<string, HirFunction>;
  /**
   * Transition id → kernel HIR, for transitions with a compiled kernel.
   *
   * Collected but not yet emitted: the shader's fire block only adjusts token
   * counts, so a kernel's output attributes are not written. Carrying the HIR is
   * the prerequisite for that, and lets the compilation report say whether a
   * kernel *could* be translated rather than only that it is unsupported.
   */
  kernels: Map<string, HirFunction>;
  /** Items whose artifact carried no HIR, with why it matters. Non-fatal. */
  skipped: { itemId: string; reason: string }[];
};

/**
 * Collects per-item HIR for `sdcpn` from `artifacts`.
 *
 * An artifact without HIR is skipped rather than fatal: the shader generator
 * treats a missing lambda as always-enabled, which is what the CPU engine does
 * for a transition with no compiled lambda. Extensions are honoured so a net run
 * with stochasticity or dynamics disabled compiles the same surfaces the CPU
 * engine would.
 */
export function hirFromArtifacts(
  sdcpn: SDCPN,
  artifacts: HirArtifacts,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): NetHir {
  const lambdas = new Map<string, HirFunction>();
  const dynamics = new Map<string, HirFunction>();
  const kernels = new Map<string, HirFunction>();
  const skipped: { itemId: string; reason: string }[] = [];

  for (const transition of sdcpn.transitions) {
    if (!extensions.stochasticity || transition.lambdaCode.trim() === "") {
      continue;
    }
    const artifact = artifacts.lambdas[transition.id];
    if (!artifact) {
      // The lambda did not compile for the CPU either, so its absence is
      // already reported through the usual compile-failure path.
      continue;
    }
    if (!artifact.hir) {
      skipped.push({
        itemId: transition.id,
        reason:
          "its compiled artifact carries no HIR, so it cannot be translated to a shader",
      });
      continue;
    }
    lambdas.set(transition.id, artifact.hir);
  }

  for (const transition of sdcpn.transitions) {
    if (transition.transitionKernelCode.trim() === "") {
      continue;
    }
    const artifact = artifacts.kernels[transition.id];
    if (!artifact) {
      // Did not compile for the CPU either; reported through that path.
      continue;
    }
    if (!artifact.hir) {
      skipped.push({
        itemId: transition.id,
        reason:
          "its compiled kernel artifact carries no HIR, so it cannot be translated to a shader",
      });
      continue;
    }
    kernels.set(transition.id, artifact.hir);
  }

  for (const place of sdcpn.places) {
    if (
      !extensions.dynamics ||
      !place.dynamicsEnabled ||
      !place.differentialEquationId ||
      !place.colorId
    ) {
      continue;
    }
    // Dynamics artifacts are keyed by differential equation, not by place.
    const artifact = artifacts.dynamics[place.differentialEquationId];
    if (!artifact) {
      continue;
    }
    if (!artifact.hir) {
      skipped.push({
        itemId: place.id,
        reason:
          "its differential equation's artifact carries no HIR, so it cannot be translated to a shader",
      });
      continue;
    }
    dynamics.set(place.id, artifact.hir);
  }

  return { lambdas, dynamics, kernels, skipped };
}
