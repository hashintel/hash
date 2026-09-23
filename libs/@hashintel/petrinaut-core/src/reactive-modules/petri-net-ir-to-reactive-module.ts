import { emitReactiveModulePython } from "./emit-reactive-module-python";
import { lowerPetriNetIr } from "./lower-petri-net-ir";

import type { LowerPetriNetIrOptions } from "./lower-petri-net-ir";
import type { PetriNetIr } from "./petri-net-ir";
import type { ReactiveModuleGraph } from "./reactive-module-graph";
import type { PetriNetIrDiagnostic } from "./sdcpn-to-petri-net-ir";

/**
 * The compiler from the Petri net IR to a Zeroth reactive module in Python:
 * the IR is lowered to a module graph in the shape its `zeroth` flags ask
 * for, and the graph is rendered over `zrth.sugar`.
 */

/**
 * Names the generated module uses for itself; the IR must not claim them.
 * IR names are UpperCamelCase, so only the capitalised identifiers can
 * collide; the lowercase ones are listed for the reader.
 */
export const RESERVED_MODULE_NAMES: readonly string[] = [
  "net",
  "ite",
  "X",
  "Module",
  "Var",
  "LIA",
  "LRA",
  "Int",
  "Real",
  "Bool",
  "INT",
  "REAL",
  "BOOL",
  "self",
  "None",
  "True",
  "False",
];

export type PetriNetIrToReactiveModuleOptions = LowerPetriNetIrOptions;

export type CompilePetriNetIrOutcome =
  | { ok: true; graph: ReactiveModuleGraph; python: string }
  | { ok: false; errors: PetriNetIrDiagnostic[] };

/** Lowers the IR and renders the module as Python, or says what stops it. */
export const compilePetriNetIr = (
  ir: PetriNetIr,
  options: PetriNetIrToReactiveModuleOptions = {},
): CompilePetriNetIrOutcome => {
  const lowered = lowerPetriNetIr(ir, options);
  return lowered.ok
    ? {
        ok: true,
        graph: lowered.graph,
        python: emitReactiveModulePython(lowered.graph),
      }
    : lowered;
};

/** The Python for an IR the lowering accepts; throws with the first refusal otherwise. */
export const petriNetIrToReactiveModule = (
  ir: PetriNetIr,
  options: PetriNetIrToReactiveModuleOptions = {},
): string => {
  const outcome = compilePetriNetIr(ir, options);
  if (!outcome.ok) {
    const [first] = outcome.errors;
    throw new Error(
      first === undefined
        ? "the IR cannot be lowered"
        : `${first.item.kind} ${first.item.name}: ${first.message}`,
    );
  }
  return outcome.python;
};
