/**
 * Entry point for the Zeroth reactive-modules export: a net becomes a Petri
 * net IR, the IR is lowered to a reactive module graph in the shape its
 * `zeroth` flags ask for, and the graph becomes Python over `zrth.sugar`.
 *
 * Separate from the main entry so a host loads it only when the export is
 * shown. Browser-safe: it interprets the conditions' lowered HIR and never
 * touches the TypeScript frontend.
 */
export {
  compileReactiveModuleExport,
  type ReactiveModuleExport,
  type ReactiveModuleExportInput,
} from "./reactive-modules/compile-reactive-module-export";
export {
  type EmitReactiveModuleOptions,
  emitReactiveModuleFiles,
  emitReactiveModulePython,
  moduleFileStem,
  type ReactiveModuleFile,
  type ReactiveModuleLayout,
  type ReactiveModuleSyntax,
} from "./reactive-modules/emit-reactive-module-python";
export {
  interpretReactiveModuleGraph,
  type InterpretReactiveModuleGraphOptions,
  orderReactiveModules,
  type ReactiveTrace,
  type ReactiveValue,
} from "./reactive-modules/interpret-reactive-module-graph";
export {
  type LowerPetriNetIrOptions,
  lowerPetriNetIr,
} from "./reactive-modules/lower-petri-net-ir";
export {
  PETRI_NET_IR_IDENTIFIER_PATTERN,
  PETRI_NET_IR_NAME_PATTERN,
  type PetriNetIr,
  type PetriNetIrArc,
  type PetriNetIrArcs,
  type PetriNetIrKind,
  type PetriNetIrMarking,
  type PetriNetIrPlace,
  type PetriNetIrTransition,
  petriNetIrArcWeight,
  petriNetIrInitialTokens,
  petriNetIrPlaceCapacity,
  renderPetriNetIr,
  type ResolvedZerothTarget,
  resolveZerothTarget,
  ZEROTH_TARGET_DEFAULTS,
  type ZerothTarget,
  zerothTargetForNet,
} from "./reactive-modules/petri-net-ir";
export {
  type Provenance,
  provenanceAt,
  type ProvenanceSource,
  type Trace,
  tracePetriNetIr,
  type TraceRange,
  traceReactiveModulePython,
} from "./reactive-modules/provenance";
export {
  type PetriNetIrToReactiveModuleOptions,
  petriNetIrToReactiveModule,
  reactiveModuleLayout,
  RESERVED_MODULE_NAMES,
} from "./reactive-modules/petri-net-ir-to-reactive-module";
export type {
  ReactiveExpr,
  ReactiveModuleDecl,
  ReactiveModuleGraph,
  ReactiveSort,
  ReactiveStatement,
  ReactiveTheory,
  ReactiveVariable,
} from "./reactive-modules/reactive-module-graph";
export {
  type PetriNetIrDiagnostic,
  type PetriNetIrDiagnosticItem,
  type SdcpnToPetriNetIrInput,
  type SdcpnToPetriNetIrOutcome,
  sdcpnToPetriNetIr,
} from "./reactive-modules/sdcpn-to-petri-net-ir";
export type { PetriNetIrOrigins } from "./reactive-modules/sdcpn-to-petri-net-ir";
export type { ReactiveModuleExportFile } from "./reactive-modules/compile-reactive-module-export";
