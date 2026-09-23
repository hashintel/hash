/**
 * @layerRoot core.reactive-modules
 * @role Compiles a plain or stochastic net to the Petri net IR and on to a Zeroth reactive module in Python
 */
import {
  type PetriNetIr,
  renderPetriNetIr,
  type ZerothTarget,
  zerothTargetForNet,
} from "./petri-net-ir";
import {
  compilePetriNetIr,
  RESERVED_MODULE_NAMES,
} from "./petri-net-ir-to-reactive-module";
import { sdcpnToPetriNetIr } from "./sdcpn-to-petri-net-ir";

import type {
  PetriNetIrDiagnostic,
  SdcpnToPetriNetIrInput,
} from "./sdcpn-to-petri-net-ir";

export type ReactiveModuleExportInput = Omit<
  SdcpnToPetriNetIrInput,
  "reservedNames"
> & {
  /**
   * The compiler flags, written into the IR's `zeroth` section where they
   * apply to the net and differ from their defaults.
   */
  zeroth?: ZerothTarget;
};

export type ReactiveModuleExport = {
  /** The IR as plain data, or `null` when the net cannot be expressed. */
  document: PetriNetIr | null;
  /** The IR as YAML, or `null` with `document`. */
  ir: string | null;
  /**
   * The reactive module as Python over `zrth.sugar`, or `null` when the net
   * has no IR or the IR holds a construct the lowering refuses.
   */
  python: string | null;
  errors: PetriNetIrDiagnostic[];
  warnings: PetriNetIrDiagnostic[];
};

/**
 * The whole pipeline in one call: the net to the IR, the IR to a module.
 * Both texts are `null` when the net has an error; the IR stands alone
 * when only the lowering refuses. The errors say which item stops it.
 */
export const compileReactiveModuleExport = ({
  zeroth,
  ...input
}: ReactiveModuleExportInput): ReactiveModuleExport => {
  // The module's own identifiers stay out of the IR's names, so the IR compiles as written.
  const outcome = sdcpnToPetriNetIr({
    ...input,
    reservedNames: RESERVED_MODULE_NAMES,
  });
  if (!outcome.ok) {
    return {
      document: null,
      ir: null,
      python: null,
      errors: outcome.errors,
      warnings: outcome.warnings,
    };
  }
  const target = zerothTargetForNet(zeroth, outcome.ir);
  const document: PetriNetIr = {
    ...outcome.ir,
    ...(target === undefined ? {} : { zeroth: target }),
  };
  const compiled = compilePetriNetIr(document);
  return {
    document,
    ir: renderPetriNetIr(document),
    python: compiled.ok ? compiled.python : null,
    errors: compiled.ok ? [] : compiled.errors,
    warnings: outcome.warnings,
  };
};
