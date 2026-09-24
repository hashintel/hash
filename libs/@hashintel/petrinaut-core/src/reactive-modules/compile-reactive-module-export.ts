/**
 * @layerRoot core.reactive-modules
 * @role Compiles a plain or stochastic net to the Petri net IR, the exchange format a reactive-module compiler reads
 */
import { renderPetriNetIr } from "./petri-net-ir";
import { sdcpnToPetriNetIr } from "./sdcpn-to-petri-net-ir";

import type {
  PetriNetIrDiagnostic,
  SdcpnToPetriNetIrInput,
} from "./sdcpn-to-petri-net-ir";

export type ReactiveModuleExportInput = SdcpnToPetriNetIrInput;

export type ReactiveModuleExport = {
  /** The IR as YAML, or `null` when the net cannot be expressed. */
  ir: string | null;
  errors: PetriNetIrDiagnostic[];
  warnings: PetriNetIrDiagnostic[];
};

/**
 * The export in one call: the net to the IR, rendered. The text is `null`
 * when the net has an error, and the errors say which item stops it.
 */
export const compileReactiveModuleExport = (
  input: ReactiveModuleExportInput,
): ReactiveModuleExport => {
  const outcome = sdcpnToPetriNetIr(input);
  if (!outcome.ok) {
    return { ir: null, errors: outcome.errors, warnings: outcome.warnings };
  }
  return {
    ir: renderPetriNetIr(outcome.ir),
    errors: [],
    warnings: outcome.warnings,
  };
};
