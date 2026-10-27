import * as v from "valibot";

import { netElementKinds } from "../../petrinaut/petrinaut-tool-effects";
import {
  vClaimReference,
  vEntityReference,
  vObligationReference,
} from "../shared/references";

export const vNetElementAddress = v.pipe(
  v.strictObject({
    kind: v.pipe(
      v.picklist(netElementKinds),
      v.description("The kind of the observed net element."),
    ),
    id: v.pipe(
      v.string(),
      v.minLength(1),
      v.description(
        "The ID you gave the element when you created it, or for an element you did not create the ID from an inspection; never a display name or Ledger entity ID.",
      ),
    ),
  }),
  v.description("An address of an observed net element by kind and ID."),
);

export const vReflection = v.pipe(
  v.strictObject({
    text: v.pipe(
      v.string(),
      v.minLength(1),
      v.description(
        "The reflection itself: why an accepted change was made, what referenced net elements represent, and any consequential approximation or omission, not a restatement of the change or its element descriptions. A stand-in or approximation a reported result rests on also gets an obligation entry in the same call, naming the run that would test it. Do not repeat tool outcomes (accepted, read back, diagnostics clean, not yet run) or revision IDs.",
      ),
    ),
    netElements: v.optional(
      v.pipe(
        v.array(vNetElementAddress),
        v.description(
          "Addresses of the observed net elements this reflection concerns.",
        ),
      ),
    ),
    claims: v.optional(
      v.pipe(
        v.array(vClaimReference),
        v.description(
          "References to the claims this reflection addresses: existing claim IDs or $index references to claim entries in this call.",
        ),
      ),
    ),
    entities: v.optional(
      v.pipe(
        v.array(vEntityReference),
        v.description(
          "References to the entities this reflection concerns that its claims do not already reach: existing entity IDs or $index references to entity entries in this call.",
        ),
      ),
    ),
    discharges: v.optional(
      v.pipe(
        v.array(vObligationReference),
        v.description(
          "Obligations this reflection discharges: existing obligation IDs or $index references to obligation entries in this call. The text names the run, calculation or inspection that met each one, with its observed result, the USER's explicit waiver, or the model change that left no result resting on it.",
        ),
      ),
    ),
  }),
  v.check(
    (reflection) =>
      (reflection.netElements?.length ?? 0) +
        (reflection.claims?.length ?? 0) +
        (reflection.entities?.length ?? 0) +
        (reflection.discharges?.length ?? 0) >
      0,
    "A reflection must reference at least one net element, claim, entity or obligation.",
  ),
  v.description(
    "Reflect on the constructed net: an accepted change, what net elements represent, or a consequential approximation or omission. Anchor it with at least one net element, claim or entity reference. The system supplies the reflection ID, conversation turn and change provenance. This neither executes a net change nor confirms any claim; epistemic status lives on the referenced claims and entities.",
  ),
);

export type NetElementAddress = v.InferOutput<typeof vNetElementAddress>;
export type Reflection = v.InferOutput<typeof vReflection>;
