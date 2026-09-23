import { emitReactiveModulePython } from "./emit-reactive-module-python";
import { lowerPetriNetIr } from "./lower-petri-net-ir";

import type { LowerPetriNetIrOptions } from "./lower-petri-net-ir";
import type { PetriNetIr } from "./petri-net-ir";

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

/** Lowers the IR and renders the module as Python. */
export const petriNetIrToReactiveModule = (
  ir: PetriNetIr,
  options: PetriNetIrToReactiveModuleOptions = {},
): string => emitReactiveModulePython(lowerPetriNetIr(ir, options));
