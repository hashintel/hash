/**
 * @layerRoot core.reactive-modules
 * @role Compiles a plain or stochastic net to the Petri net IR and on to a Zeroth reactive module in Python
 */
import { renderPetriNetIr } from "./petri-net-ir";
import {
  petriNetIrToReactiveModule,
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
  /** Step length a stochastic rate is tested over in the module. Defaults to 1. */
  dt?: number;
};

export type ReactiveModuleExport = {
  /** The IR as YAML, or `null` when the net cannot be expressed. */
  ir: string | null;
  /** The reactive module as Python over `zrth.sugar`, or `null` with `ir`. */
  python: string | null;
  errors: PetriNetIrDiagnostic[];
  warnings: PetriNetIrDiagnostic[];
};

/**
 * The whole pipeline in one call: the net to the IR, the IR to a module.
 * Both texts are `null` when the net has an error, and the errors say which
 * item stops it.
 */
export const compileReactiveModuleExport = ({
  dt,
  ...input
}: ReactiveModuleExportInput): ReactiveModuleExport => {
  // The module's own identifiers stay out of the IR's names, so the IR compiles as written.
  const outcome = sdcpnToPetriNetIr({
    ...input,
    reservedNames: RESERVED_MODULE_NAMES,
  });
  if (!outcome.ok) {
    return {
      ir: null,
      python: null,
      errors: outcome.errors,
      warnings: outcome.warnings,
    };
  }
  return {
    ir: renderPetriNetIr(outcome.ir),
    python: petriNetIrToReactiveModule(
      outcome.ir,
      dt === undefined ? {} : { dt },
    ),
    errors: [],
    warnings: outcome.warnings,
  };
};
