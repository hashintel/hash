import * as v from "valibot";

import {
  INTEGRATED_PETRINAUT_MODES,
  STOCK_OVER_FLUE_MODE,
} from "./construction-mode";
import { draftPetrinautExperimentToolName } from "./draft-experiment";
import { readPetrinautDocs } from "./tools/read-petrinaut-doc";

export {
  CANONICAL_PETRINAUT_TOOLS_MODE,
  INTEGRATED_BRUNCH_MODE,
  STOCK_OVER_FLUE_MODE,
  isIntegratedPetrinautMode,
  type CanonicalPetrinautMode,
  type IntegratedPetrinautMode,
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

export { draftPetrinautExperimentToolName, readPetrinautDocs };
export { READ_PETRINAUT_DOCS_TOOL_NAME } from "./construction-tool-names";
export {
  CANONICAL_PETRINAUT_TOOL_NAMES,
  canonicalPetrinautTools,
} from "./tools/petrinaut-construction";
