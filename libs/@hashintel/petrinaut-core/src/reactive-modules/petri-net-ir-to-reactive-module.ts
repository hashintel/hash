import {
  emitReactiveModuleFiles,
  emitReactiveModulePython,
} from "./emit-reactive-module-python";
import {
  emitSpnModuleFiles,
  emitSpnModulePython,
} from "./emit-spn-module-python";
import { lowerPetriNetIr } from "./lower-petri-net-ir";
import { resolveZerothTarget, zerothTargetComposes } from "./petri-net-ir";

import type {
  ReactiveModuleLayout,
  ReactiveModuleSyntax,
} from "./emit-reactive-module-python";
import type {
  LoweredGraph,
  LowerPetriNetIrOptions,
} from "./lower-petri-net-ir";
import type { PetriNetIr } from "./petri-net-ir";
import type { PetriNetIrDiagnostic } from "./sdcpn-to-petri-net-ir";
import type { ReactiveModuleFile } from "./shared/python-layout";

/**
 * The compiler from the Petri net IR to a Zeroth reactive module in Python:
 * the IR is lowered to a module graph in the shape its `zeroth` flags ask
 * for, and the graph is rendered over `zrth.sugar` by the emitter of its
 * language.
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
  "SPN",
  "Nat",
  "Clock",
  "Event",
  "t",
  "d",
  "exp",
  "fired",
  "if_then",
  "self",
  "None",
  "True",
  "False",
];

export type PetriNetIrToReactiveModuleOptions = LowerPetriNetIrOptions;

export type CompilePetriNetIrOutcome =
  | {
      ok: true;
      graph: LoweredGraph;
      /** The main file: the whole module, or `net.py` under the per-module layout. */
      python: string;
      /** Every file, the main one first. One file under the single layout. */
      files: ReactiveModuleFile[];
    }
  | { ok: false; errors: PetriNetIrDiagnostic[] };

/** The layout the flags ask for: a module per file only splits a composed system. */
export const reactiveModuleLayout = (
  ir: Pick<PetriNetIr, "zeroth">,
): ReactiveModuleLayout => {
  const target = resolveZerothTarget(ir.zeroth);
  return zerothTargetComposes(target) ? target.layout : "single";
};

/** The whole module as one program, whatever the layout says. */
const emitProgram = (
  graph: LoweredGraph,
  syntax: ReactiveModuleSyntax,
): string =>
  graph.language === "spn"
    ? emitSpnModulePython(graph)
    : emitReactiveModulePython(graph, { syntax });

const emitModuleFiles = (
  graph: LoweredGraph,
  syntax: ReactiveModuleSyntax,
): ReactiveModuleFile[] =>
  graph.language === "spn"
    ? emitSpnModuleFiles(graph)
    : emitReactiveModuleFiles(graph, { syntax });

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
  const { syntax } = resolveZerothTarget(ir.zeroth);
  const files =
    layout === "single"
      ? [{ path: "net.py", text: emitProgram(lowered.graph, syntax) }]
      : emitModuleFiles(lowered.graph, syntax);
  const [main] = files;
  if (main === undefined) {
    throw new Error("the emitter produced no file");
  }
  return { ok: true, graph: lowered.graph, python: main.text, files };
};

/**
 * The Python for an IR the lowering accepts, as one program whatever the
 * layout flag says; throws with the first refusal otherwise.
 */
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
  return emitProgram(outcome.graph, resolveZerothTarget(ir.zeroth).syntax);
};
