import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import { netElementKinds } from "../../petrinaut-tool-effects";
import { vClaimReference, vEntityReference } from "../shared/references";

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
        "The net element's ID from an inspection or accepted change, not a display name or Ledger entity ID.",
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
        "The reflection itself: the modeling choice behind an accepted change, what referenced net elements represent, and any consequential approximation or omission. Do not repeat mechanical tool receipts or revision IDs.",
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
          "References to the entities this reflection concerns: existing entity IDs or $index references to entity entries in this call.",
        ),
      ),
    ),
  }),
  v.check(
    (reflection) =>
      (reflection.netElements?.length ?? 0) +
        (reflection.claims?.length ?? 0) +
        (reflection.entities?.length ?? 0) >
      0,
    "A reflection must reference at least one net element, claim or entity.",
  ),
  v.description(
    "Reflect on the constructed net: an accepted change, what net elements represent, or a consequential approximation or omission. Anchor it with at least one net element, claim or entity reference. The system supplies the reflection ID, conversation turn and change provenance. This neither executes a net change nor confirms any claim; epistemic status lives on the referenced claims and entities.",
  ),
);

export type NetElementAddress = v.InferOutput<typeof vNetElementAddress>;
export type Reflection = v.InferOutput<typeof vReflection>;

export const NetElementAddressSchema = toJsonSchema(vNetElementAddress);
export const ReflectionSchema = toJsonSchema(vReflection, {
  errorMode: "ignore",
});
