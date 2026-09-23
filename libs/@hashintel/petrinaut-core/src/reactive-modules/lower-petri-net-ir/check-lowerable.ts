import type { PetriNetIr } from "../petri-net-ir";
import type { PetriNetIrDiagnostic } from "../sdcpn-to-petri-net-ir";

/**
 * The constructs of the IR the lowering does not yet turn into a module.
 * Each is refused per item, so a document with one coloured place still
 * says which one, and the IR itself stays readable next to the refusal.
 */

const NOT_YET = "is not lowered to a reactive module yet";

export const checkLowerable = (ir: PetriNetIr): PetriNetIrDiagnostic[] => {
  const errors: PetriNetIrDiagnostic[] = [];
  for (const [name, place] of Object.entries(ir.places)) {
    const item = { kind: "place" as const, id: name, name };
    if (place?.colour !== undefined) {
      errors.push({
        code: "coloured-place-not-lowered",
        message: `a coloured place ${NOT_YET}`,
        item,
      });
    }
    if (place?.dynamics !== undefined) {
      errors.push({
        code: "dynamics-not-lowered",
        message: `a place with dynamics ${NOT_YET}`,
        item,
      });
    }
  }
  for (const [name, transition] of Object.entries(ir.transitions)) {
    const item = { kind: "transition" as const, id: name, name };
    if (transition.guard !== undefined) {
      errors.push({
        code: "guard-not-lowered",
        message: `a guard over the input tokens ${NOT_YET}`,
        item,
      });
    }
    if (typeof transition.rate === "string") {
      errors.push({
        code: "rate-code-not-lowered",
        message: `a rate computed from the input tokens ${NOT_YET}`,
        item,
      });
    }
    if (transition.kernel !== undefined) {
      errors.push({
        code: "kernel-not-lowered",
        message: `a transition kernel ${NOT_YET}`,
        item,
      });
    }
    if (transition.reads !== undefined) {
      errors.push({
        code: "read-arc-not-lowered",
        message: `a read arc ${NOT_YET}`,
        item,
      });
    }
    if (transition.inhibitors !== undefined) {
      errors.push({
        code: "inhibitor-arc-not-lowered",
        message: `an inhibitor arc ${NOT_YET}`,
        item,
      });
    }
  }
  return errors;
};
