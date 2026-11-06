import * as v from "valibot";

const vBrowserBinding = v.strictObject({
  conversationId: v.string(),
  documentId: v.string(),
  /** Still sent by the website for servers that require it; not read. */
  incarnationId: v.optional(v.string()),
});

export const vSdcpnInitialData = v.optional(
  v.object({ binding: vBrowserBinding }),
);

export type SdcpnInitialData = v.InferOutput<typeof vSdcpnInitialData>;
/** Initial data is present only when a Petrinaut document binding is attached. */
export type BrowserContext = NonNullable<SdcpnInitialData>;
