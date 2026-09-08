import * as v from "valibot";
import { z } from "zod";

import {
  normalizePetrinautAiToolInput,
  petrinautAiTools,
} from "@hashintel/petrinaut-core/ai";

import { declaredBasisSchema, sha256Schema } from "./declared-basis";

// Initial-data contracts stay Valibot-owned; only tool inputs use native Zod.
export const browserBindingSchema = v.strictObject({
  conversationId: v.pipe(v.string(), v.minLength(1)),
  documentId: v.pipe(v.string(), v.minLength(1)),
  incarnationId: v.pipe(v.string(), v.minLength(1)),
});

export const rootArcEnvelopeSchema = z.strictObject({
  basis: declaredBasisSchema,
  requestedBaseHash: sha256Schema,
});

const canonical = petrinautAiTools.addArc.inputSchema;
/** safeExtend retains Petrinaut's runtime .check rules; no canonical fields are copied. */
export const joinedRootArcInputSchema = canonical
  .safeExtend({ brunch: rootArcEnvelopeSchema })
  .refine(
    (input) => !input.targetSubnetId && typeof input.placeId === "string",
    {
      message: "Only root place arcs are admitted.",
    },
  )
  .describe(petrinautAiTools.addArc.description);

/** Shared explicit compatibility boundary for retained raw calls and browser execution. */
export const parseJoinedRootArcInput = (input: unknown) =>
  joinedRootArcInputSchema.parse(
    normalizePetrinautAiToolInput("addArc", input),
  );
