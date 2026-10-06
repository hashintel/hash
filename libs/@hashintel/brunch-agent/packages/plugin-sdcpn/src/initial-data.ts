import * as v from "valibot";

const browserBindingSchema = v.strictObject({
  conversationId: v.string(),
  documentId: v.string(),
});

export const sdcpnInitialDataSchema = v.optional(
  v.object({ binding: browserBindingSchema }),
);

export type SdcpnInitialData = v.InferOutput<typeof sdcpnInitialDataSchema>;
/** Initial data is present only when a Petrinaut document binding is attached. */
export type BrowserContext = NonNullable<SdcpnInitialData>;
