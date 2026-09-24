import {
  type PetriNetIr,
  type PetriNetIrArcs,
  petriNetIrArcWeight,
  petriNetIrInitialTokens,
  type ResolvedZerothTarget,
} from "../petri-net-ir";

import type { PetriNetIrDiagnostic } from "../sdcpn-to-petri-net-ir";

/** The arcs of one side that carry more than one token, each as a clause. */
const heavyArcs = (
  arcs: PetriNetIrArcs | undefined,
  side: "from" | "into",
): string[] =>
  Object.entries(arcs ?? {})
    .filter(([, arc]) => petriNetIrArcWeight(arc) > 1)
    .map(
      ([place, arc]) =>
        `the arc ${side} ${place} carries ${petriNetIrArcWeight(arc)}`,
    );

/**
 * What the clocks strategy cannot express: it arms a clock with a constant
 * positive rate, fires on the clock and the input arcs alone, counts plain
 * tokens in Nat, tests a count against zero only and moves one token per
 * arc.
 */
const clockRefusals = (ir: PetriNetIr): PetriNetIrDiagnostic[] => {
  const errors: PetriNetIrDiagnostic[] = [];
  for (const [name, place] of Object.entries(ir.places)) {
    const item = { kind: "place" as const, id: name, name };
    if (place?.colour !== undefined) {
      errors.push({
        code: "clocks-coloured",
        message:
          "the clocks strategy counts plain tokens; a coloured place holds records",
        item,
      });
    }
    if (place?.dynamics !== undefined) {
      errors.push({
        code: "clocks-dynamics",
        message:
          "the clocks strategy counts tokens as Nat; dynamics need Real places",
        item,
      });
    }
    if (place?.capacity !== undefined) {
      errors.push({
        code: "clocks-capacity",
        message:
          "the clocks strategy cannot test a capacity: the SPN theory tests a count against zero only",
        item,
      });
    }
    const initial = petriNetIrInitialTokens(ir, name);
    if (!Number.isInteger(initial) || initial < 0) {
      errors.push({
        code: "clocks-marking",
        message: `a Nat counter starts at a whole number of tokens; the marking is ${initial}`,
        item,
      });
    }
  }
  for (const [name, transition] of Object.entries(ir.transitions)) {
    const item = { kind: "transition" as const, id: name, name };
    if (transition.rate === undefined) {
      errors.push({
        code: "clocks-plain-transition",
        message:
          "the clocks strategy arms a clock at the transition's rate, and this transition has none",
        item,
      });
    } else if (typeof transition.rate === "string") {
      errors.push({
        code: "clocks-rate-code",
        message:
          "the clocks strategy arms a clock with a constant rate; this rate reads its tokens",
        item,
      });
    } else if (!(Number.isFinite(transition.rate) && transition.rate > 0)) {
      errors.push({
        code: "clocks-rate-not-positive",
        message: `the clocks strategy arms a clock with a positive rate; the rate is ${transition.rate}`,
        item,
      });
    }
    if (transition.guard !== undefined) {
      errors.push({
        code: "clocks-guard",
        message:
          "the clocks strategy fires on its clock and its arcs alone; this transition also has a guard",
        item,
      });
    }
    if (transition.kernel !== undefined) {
      errors.push({
        code: "clocks-kernel",
        message:
          "the clocks strategy moves plain tokens; this transition has a kernel",
        item,
      });
    }
    const heavy = [
      ...heavyArcs(transition.inputs, "from"),
      ...heavyArcs(transition.outputs, "into"),
    ];
    if (heavy.length > 0) {
      errors.push({
        code: "clocks-arc-weight",
        message: `the clocks strategy moves one token per arc; ${heavy.join(", ")}`,
        item,
      });
    }
  }
  return errors;
};

/**
 * The combinations of flags and constructs the lowering does not turn into
 * a module, refused up front so the IR stays readable next to the reason.
 */
export const checkLowerable = (
  ir: PetriNetIr,
  target: ResolvedZerothTarget,
): PetriNetIrDiagnostic[] => {
  if (target.rates === "clock") {
    return clockRefusals(ir);
  }
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
