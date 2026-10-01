import * as v from "valibot";

import { interviewBudgetSchema } from "./interview-budget";

const browserBindingSchema = v.strictObject({
  conversationId: v.string(),
  documentId: v.string(),
  incarnationId: v.string(),
});

export const sdcpnInitialDataSchema = v.optional(
  v.object({
    binding: browserBindingSchema,
    interviewBudget: v.optional(interviewBudgetSchema),
  }),
);

export type SdcpnInitialData = v.InferOutput<typeof sdcpnInitialDataSchema>;
/** Initial data is present only when a Petrinaut document binding is attached. */
export type BrowserContext = NonNullable<SdcpnInitialData>;
