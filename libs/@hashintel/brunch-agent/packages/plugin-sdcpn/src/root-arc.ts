import * as v from "valibot";

import {
  normalizePetrinautAiToolInput,
  petrinautAiTools,
} from "@hashintel/petrinaut-core/ai";

import { declaredBasisSchema, sha256Schema } from "./declared-basis";
import { canonicalSchemaCarrier } from "./tools/canonical-schema-carrier";

export const browserBindingSchema = v.strictObject({
  conversationId: v.pipe(v.string(), v.minLength(1)),
  documentId: v.pipe(v.string(), v.minLength(1)),
  incarnationId: v.pipe(v.string(), v.minLength(1)),
});

export const rootArcEnvelopeSchema = v.strictObject({
  basis: declaredBasisSchema,
  requestedBaseHash: sha256Schema,
});

export const parseJoinedRootArcInput = (input: unknown) =>
  v.parse(joinedRootArcInputSchema, input);

const canonicalSchema = petrinautAiTools.addArc.inputSchema.toJSONSchema();
// The canonical root is a strict object; its entries remain mechanically owned by Petrinaut.
const root = canonicalSchemaCarrier(canonicalSchema);
if (root.type !== "strict_object" || !("entries" in root))
  throw new Error("The root arc carrier must remain a strict object.");
const carrier = v.strictObject({
  ...(root.entries as v.ObjectEntries),
  brunch: rootArcEnvelopeSchema,
});

/** Normalize first, then structurally validate, then validate against Petrinaut itself. */
export const joinedRootArcInputSchema = v.pipe(
  v.looseObject({}),
  v.transform((input) => normalizePetrinautAiToolInput("addArc", input)),
  carrier,
  v.description(petrinautAiTools.addArc.description),
  // The canonical carrier cannot own a foreign envelope. Split it locally, without copying fields.
  v.rawTransform((context) => {
    const { brunch, ...input } = context.dataset.value;
    const canonical = petrinautAiTools.addArc.inputSchema.safeParse(input);
    if (!canonical.success) {
      context.addIssue({
        message: "Invalid canonical root arc or declared basis envelope.",
      });
      return context.NEVER;
    }
    if (
      canonical.data.targetSubnetId ||
      typeof canonical.data.placeId !== "string"
    ) {
      context.addIssue({ message: "Only root place arcs are admitted." });
      return context.NEVER;
    }
    return { ...canonical.data, brunch };
  }),
);
