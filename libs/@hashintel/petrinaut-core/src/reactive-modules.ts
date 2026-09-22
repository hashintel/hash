/**
 * Entry point for the Zeroth reactive-modules export: a net becomes a Petri
 * net IR, and the IR becomes a reactive module in Python over `zrth.sugar`.
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
  PETRI_NET_IR_IDENTIFIER_PATTERN,
  PETRI_NET_IR_NAME_PATTERN,
  type PetriNetIr,
  type PetriNetIrArc,
  type PetriNetIrArcs,
  type PetriNetIrKind,
  type PetriNetIrPlace,
  type PetriNetIrTransition,
  petriNetIrArcWeight,
  petriNetIrPlaceCapacity,
  petriNetIrPlaceInitial,
  renderPetriNetIr,
} from "./reactive-modules/petri-net-ir";
export {
  type PetriNetIrToReactiveModuleOptions,
  petriNetIrToReactiveModule,
  RESERVED_MODULE_NAMES,
} from "./reactive-modules/petri-net-ir-to-reactive-module";
export {
  type PetriNetIrDiagnostic,
  type PetriNetIrDiagnosticItem,
  type SdcpnToPetriNetIrInput,
  type SdcpnToPetriNetIrOutcome,
  sdcpnToPetriNetIr,
} from "./reactive-modules/sdcpn-to-petri-net-ir";
