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
import { tracePetriNetIr, traceReactiveModulePython } from "./provenance";
import { sdcpnToPetriNetIr } from "./sdcpn-to-petri-net-ir";

import type { Trace } from "./provenance";
import type {
  PetriNetIrDiagnostic,
  PetriNetIrOrigins,
  SdcpnToPetriNetIrInput,
} from "./sdcpn-to-petri-net-ir";
import type { ReactiveModuleFile } from "./shared/python-layout";

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

/** A generated file with the trace over its lines. */
export type ReactiveModuleExportFile = ReactiveModuleFile & { trace: Trace };

export type ReactiveModuleExport = {
  /** The IR as plain data, or `null` when the net cannot be expressed. */
  document: PetriNetIr | null;
  /** The IR as YAML, or `null` with `document`. */
  ir: string | null;
  /** What each line of the IR is and where it comes from; `null` with `ir`. */
  irTrace: Trace | null;
  /** The net items the IR names stand for; `null` with `document`. */
  origins: PetriNetIrOrigins | null;
  /**
   * The reactive module as Python over `zrth.sugar`, or `null` when the net
   * has no IR or the IR holds a construct the lowering refuses. The main
   * file when the layout writes one file per module.
   */
  python: string | null;
  /** Every Python file, the main one first, each with its trace; `null` with `python`. */
  files: ReactiveModuleExportFile[] | null;
  errors: PetriNetIrDiagnostic[];
  /** The IR builder's warnings, then the lowering's. */
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
      irTrace: null,
      origins: null,
      python: null,
      files: null,
      errors: outcome.errors,
      warnings: outcome.warnings,
    };
  }
  const target = zerothTargetForNet(zeroth, outcome.ir);
  const document: PetriNetIr = {
    ...outcome.ir,
    ...(target === undefined ? {} : { zeroth: target }),
  };
  // The compiler reads the code back from the trees the IR was printed from.
  const compiled = compilePetriNetIr(document, {
    parseCode: (text) => outcome.code.get(text),
  });
  const ir = renderPetriNetIr(document);
  return {
    document,
    ir,
    irTrace: tracePetriNetIr(document, ir),
    origins: outcome.origins,
    python: compiled.ok ? compiled.python : null,
    files: compiled.ok
      ? compiled.files.map((file) => ({
          ...file,
          trace: traceReactiveModulePython(compiled.graph, document, file.text),
        }))
      : null,
    errors: compiled.ok ? [] : compiled.errors,
    warnings: [...outcome.warnings, ...compiled.warnings],
  };
};
