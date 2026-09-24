import {
  emitReactiveModuleFiles,
  emitReactiveModulePython,
} from "./emit-reactive-module-python";
import { lowerPetriNetIr } from "./lower-petri-net-ir";
import { resolveZerothTarget } from "./petri-net-ir";

import type {
  ReactiveModuleFile,
  ReactiveModuleLayout,
} from "./emit-reactive-module-python";
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
  | {
      ok: true;
      graph: ReactiveModuleGraph;
      /** The main file: the whole module, or `net.py` under the per-module layout. */
      python: string;
      /** Every file, the main one first. One file under the single layout. */
      files: ReactiveModuleFile[];
    }
  | { ok: false; errors: PetriNetIrDiagnostic[] };

/** The layout the flags ask for: a module per file only splits the modular shape. */
export const reactiveModuleLayout = (
  ir: Pick<PetriNetIr, "zeroth">,
): ReactiveModuleLayout => {
  const target = resolveZerothTarget(ir.zeroth);
  return target.shape === "modular" ? target.layout : "single";
};

/** Lowers the IR and renders the module as Python, or says what stops it. */
export const compilePetriNetIr = (
  ir: PetriNetIr,
  options: PetriNetIrToReactiveModuleOptions = {},
): CompilePetriNetIrOutcome => {
  const lowered = lowerPetriNetIr(ir, options);
  if (!lowered.ok) {
    return lowered;
  }
  const layout = reactiveModuleLayout(ir);
  const files =
    layout === "single"
      ? [{ path: "net.py", text: emitReactiveModulePython(lowered.graph) }]
      : emitReactiveModuleFiles(lowered.graph);
  const [main] = files;
  if (main === undefined) {
    throw new Error("the emitter produced no file");
  }
  return { ok: true, graph: lowered.graph, python: main.text, files };
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
