import * as v from "valibot";

import { brunchModes } from "@hashintel/brunch-agent/constants";

import { INTEGRATED_PETRINAUT_MODES } from "./construction-mode";

const browserBindingSchema = v.strictObject({
  conversationId: v.string(),
  documentId: v.string(),
  incarnationId: v.string(),
});

export const sdcpnInitialDataSchema = v.optional(
  v.pipe(
    v.object({
      mode: v.picklist([
        brunchModes.stockOverFlue,
        ...INTEGRATED_PETRINAUT_MODES,
      ]),
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
