import * as v from "valibot";

import {
  INTEGRATED_PETRINAUT_MODES,
  STOCK_OVER_FLUE_MODE,
} from "./construction-mode";

const browserBindingSchema = v.strictObject({
  conversationId: v.string(),
  documentId: v.string(),
  incarnationId: v.string(),
});

export const sdcpnInitialDataSchema = v.optional(
  v.pipe(
    v.object({
      mode: v.picklist([STOCK_OVER_FLUE_MODE, ...INTEGRATED_PETRINAUT_MODES]),
      construction: v.optional(
        v.strictObject({ binding: browserBindingSchema }),
      ),
    }),
    v.check(
      (data) => data.construction !== undefined,
      "The conversation requires a document binding.",
    ),
  ),
);

export type SdcpnInitialData = v.InferOutput<typeof sdcpnInitialDataSchema>;
export type BrowserContext = NonNullable<
  NonNullable<SdcpnInitialData>["construction"]
>;
