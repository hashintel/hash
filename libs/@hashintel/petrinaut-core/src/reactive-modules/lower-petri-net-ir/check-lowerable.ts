import type { PetriNetIr, ResolvedZerothTarget } from "../petri-net-ir";
import type { PetriNetIrDiagnostic } from "../sdcpn-to-petri-net-ir";

/**
 * The combinations of flags and constructs the lowering does not yet turn
 * into a module, refused up front so the IR stays readable next to the
 * reason.
 */
export const checkLowerable = (
  ir: PetriNetIr,
  target: ResolvedZerothTarget,
): PetriNetIrDiagnostic[] => {
  const errors: PetriNetIrDiagnostic[] = [];
  const places = Object.values(ir.places);
  const coloured = places.some((place) => place?.colour !== undefined);
  const dynamic = places.some((place) => place?.dynamics !== undefined);
  if (target.shape === "modular" && (coloured || dynamic)) {
    errors.push({
      code: "modular-coloured-not-lowered",
      message:
        "the modular shape is not lowered for a net with coloured places or dynamics yet; use the monolithic shape",
      item: { kind: "net", id: "net", name: ir.name },
    });
  }
  return errors;
};
