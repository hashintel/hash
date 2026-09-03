/**
 * Asks whether a transition kernel's expressions could be translated to WGSL.
 *
 * This is **not** a kernel emitter — `compile-net-shader.ts` emits the real
 * kernels for typed outputs. This module only predicts translatability for
 * the Compilation panel, without building a shader.
 *
 * It answers the narrower question the Compilation panel needs: is a kernel held
 * up by the *backend* (slot allocation, still to be built) or by its own *code*
 * (a `string` attribute, a generated `uuid`)? Those are the same "runs on the
 * CPU" outcome but completely different work, and reporting them identically
 * told the author nothing about which.
 *
 * Input tokens are bound to a placeholder accessor rather than real state
 * offsets, because whether `tokens.Space[0].x` resolves to a load is a property
 * of the future slot support, not of the expression.
 */
import { buildKernelContext } from "../hir/surface-context";
import { resolveNetParameterValues } from "../parameter-values";
import { WgslBailError, WgslEmitter } from "./emit-wgsl";

import type { PetrinautExtensionSettings } from "../extensions";
import type { HirFunction } from "../hir/hir";
import type { SDCPN, Transition } from "../types/sdcpn";
import type { WgslValue } from "./emit-wgsl";

/** Name the probe uses for the generator; the real one is chosen when emitting. */
const PROBE_RNG_STATE_VAR = "rng_state";

export type KernelTranslationResult =
  | { translatable: true }
  | { translatable: false; reason: string };

export function tryTranslateKernel({
  sdcpn,
  transition,
  hir,
  extensions,
  parameterValues,
}: {
  sdcpn: SDCPN;
  transition: Transition;
  hir: HirFunction;
  extensions?: PetrinautExtensionSettings;
  /**
   * Resolved parameter values. Defaults to the net's own declared defaults —
   * the shader inlines parameters as literals, so an absent one fails emission
   * with `unknown parameter ...`, which would read as the kernel's fault.
   */
  parameterValues?: Readonly<Record<string, number | boolean>>;
}): KernelTranslationResult {
  try {
    const context = buildKernelContext(sdcpn, transition, extensions);
    const emitter = new WgslEmitter({
      parameterValues:
        parameterValues ??
        resolveNetParameterValues(
          sdcpn.parameters,
          {},
          extensions?.parameters ?? true,
        ),
      rngStateVar: PROBE_RNG_STATE_VAR,
    });

    const env = new Map<string, WgslValue>();
    const tokensParam = hir.params[0];
    if (tokensParam) {
      // One entry per input slot, each a tuple of the arc's weight. Attribute
      // reads resolve to a constant: the probe is about translatability, and a
      // misspelled attribute is already a typecheck error upstream.
      env.set(tokensParam.name, {
        kind: "record",
        fields: new Map(
          context.inputSlots.map((slot) => [
            slot.name,
            {
              kind: "array" as const,
              elements: Array.from(
                { length: slot.tokenCount },
                (): WgslValue => ({
                  kind: "token",
                  read: () => ({ kind: "f32", code: "0.0" }),
                }),
              ),
            },
          ]),
        ),
      });
    }

    emitter.emit(hir.body, env);
    return { translatable: true };
  } catch (error) {
    if (error instanceof WgslBailError) {
      return { translatable: false, reason: error.message };
    }
    throw error;
  }
}
